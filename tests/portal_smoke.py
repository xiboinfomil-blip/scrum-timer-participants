"""Isolated portal browser smoke; every API request is mocked, never proxied.

Parent (from scrumParticipants, after starting the portal on port 3002):
    python -m pip install playwright
    python -m playwright install chromium
    python tests/portal_smoke.py
Optional environment: BROWSER_TEST_URL, BROWSER_TEST_ALL_MOTIONS=1.
No real secret, HMAC, database, server configuration or write is needed.
This exercises the browser contract, NOT the server proxy/security integration.
"""

import asyncio
import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
import re
from urllib.parse import urlsplit

from playwright.async_api import Error, async_playwright, expect


BASE = os.environ.get("BROWSER_TEST_URL", "http://localhost:3002").rstrip("/")
URL = urlsplit(BASE)
if URL.scheme not in ("http", "https") or not URL.netloc or URL.path not in ("", "/") or URL.query or URL.fragment or URL.username or URL.password:
    raise ValueError("BROWSER_TEST_URL must be an HTTP(S) origin only")
ORIGIN = f"{URL.scheme}://{URL.netloc}"
TEAM_ID = "a" * 64
MAURITIUS = timezone(timedelta(hours=4))  # Mauritius has no DST; no tzdata dependency.


def b64url(value):
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


# Syntactically valid per TOKEN_PATTERN, deliberately NOT an authentic capability.
TOKEN = b64url(json.dumps({"v": 1, "teamId": TEAM_ID}, separators=(",", ":")).encode()) + "." + b64url(bytes(32))
assert re.fullmatch(r"[A-Za-z0-9_-]{1,512}\.[A-Za-z0-9_-]{43}", TOKEN)
PORTAL = f"{BASE}/t/{TOKEN}"


def fixture(now):
    roster = [
        {"id": f"person-{n:02}", "name": "Élodie Martin" if n == 1 else f"Participant {n:02}", "present": n % 3 != 0}
        for n in range(1, 41)
    ]
    # React must render this literally, never interpret it as markup.
    roster[1]["name"] = '<script>window.portalInjected=true</script>'
    people = [
        {"id": p["id"], "name": p["name"], "mood": (n % 4) + 1,
         "speakingSeconds": 30, "budgetSeconds": 60, "timeUp": False,
         "score": 800, "meterTitle": "Contexte archivé"}
        for n, p in enumerate(roster)
    ]
    return {
        "team": {"id": TEAM_ID, "name": "Équipe smoke · 40", "roster": roster},
        "day": now.astimezone(MAURITIUS).date().isoformat(),
        "hints": [],
        "history": [
            {"id": "round-today", "completedAt": now.isoformat(), "people": people},
            {"id": "round-yesterday", "completedAt": (now - timedelta(days=1)).isoformat(), "people": deepcopy(people)},
        ],
    }


class MockAPI:
    def __init__(self, now):
        self.data = fixture(now)
        self.read_status = 200
        self.conflict_once = False
        self.gets = 0
        self.puts = []
        self.violations = []
        self.initial_gate = None
        self.read_gate = None
        self.read_started = asyncio.Event()
        self.read_finished = asyncio.Event()

    def note(self, text, revision, participant="person-01"):
        self.data["hints"] = [h for h in self.data["hints"] if h["participantId"] != participant]
        self.data["hints"].append({"participantId": participant, "hint": text, "revision": revision})

    async def route(self, route):
        request = route.request
        url = urlsplit(request.url)
        origin = f"{url.scheme}://{url.netloc}"
        if origin != ORIGIN:
            self.violations.append(f"External request blocked: {origin}")
            await route.abort()
            return
        if url.path != "/api/team":
            # Fail closed for every other API or mutation; only app assets/pages pass.
            if url.path.startswith("/api/") or request.method not in ("GET", "HEAD"):
                self.violations.append(f"Unexpected request: {request.method} {url.path}")
                await route.abort()
            else:
                await route.continue_()
            return
        headers = await request.all_headers()
        if headers.get("x-team-link") != TOKEN or url.query:
            self.violations.append("Invalid token header or unexpected API query")
        if request.method == "GET":
            self.gets += 1
            snapshot = deepcopy(self.data)
            status = self.read_status
            if self.initial_gate is not None:
                await self.initial_gate.wait()
            gate = self.read_gate
            if gate is not None:
                self.read_gate = None
                self.read_started.set()
                await gate.wait()
            try:
                await route.fulfill(status=status, json=snapshot if status == 200 else {
                    "error": "INVALID_LINK" if status == 401 else "UPSTREAM_UNAVAILABLE"
                }, headers={"Cache-Control": "no-store"})
            except Error:
                # Saving intentionally aborts an in-flight, older GET.
                if gate is None:
                    raise
            finally:
                if gate is not None:
                    self.read_finished.set()
            return
        if request.method != "PUT":
            self.violations.append(f"Unexpected team method: {request.method}")
            await route.abort()
            return
        # A real browser fetch sends Origin on same-origin PUT. Never inject it or
        # weaken this assertion to work around a production sameOrigin failure.
        if headers.get("origin") != ORIGIN:
            self.violations.append("PUT must carry the exact same-origin Origin")
        if not headers.get("content-type", "").startswith("application/json"):
            self.violations.append("PUT must be application/json")
        body = request.post_data_json
        self.puts.append(deepcopy(body))
        if not isinstance(body, dict) or set(body) != {"participantId", "hint", "day", "revision"}:
            self.violations.append("PUT body keys differ from strict contract")
            await route.fulfill(status=400, json={"error": "INVALID_REQUEST"})
            return
        current = next((h for h in self.data["hints"] if h["participantId"] == body["participantId"]), None)
        valid = (
            any(p["id"] == body["participantId"] for p in self.data["team"]["roster"])
            and body["day"] == self.data["day"]
            and type(body["revision"]) is int
            and body["revision"] == (current["revision"] if current else 0)
            and isinstance(body["hint"], str) and body["hint"] == body["hint"].strip()
            and 1 <= len(body["hint"]) <= 600
            and not re.search(r"[\x00-\x09\x0b-\x1f\x7f-\x9f]", body["hint"])
        )
        if not valid:
            self.violations.append("Invalid day, revision, participant or note payload")
            await route.fulfill(status=400, json={"error": "INVALID_REQUEST"})
        elif self.conflict_once:
            self.conflict_once = False
            self.note("Version concurrente du serveur", body["revision"] + 1, body["participantId"])
            await route.fulfill(status=409, json={"error": "CONFLICT"})
        else:
            self.note(body["hint"], body["revision"] + 1, body["participantId"])
            await route.fulfill(json={"day": self.data["day"], "hints": deepcopy(self.data["hints"])})


def editor(page):
    return page.get_by_role("dialog").filter(has=page.locator("#editor-title"))


def notes_panel(page):
    return page.locator("section").filter(has=page.get_by_role("heading", name="Les idées à ne pas oublier", exact=True, include_hidden=True))


async def loaded(page):
    await expect(page.get_by_role("heading", name="Équipe smoke · 40", exact=True)).to_be_visible()
    await expect(page.get_by_role("button", name="Actualiser", exact=True)).to_be_enabled()
    await expect(page.get_by_role("status").filter(has_text="Données chargées.")).to_have_count(1)


async def layout(page):
    assert await page.evaluate("""() => {
        const root = document.documentElement;
        return root.scrollWidth <= root.clientWidth + 1 &&
            document.body.scrollWidth <= root.clientWidth + 1;
    }"""), "Horizontal document overflow"
    # Informational prose may mention the master's tools; interactive controls may not.
    forbidden = re.compile(r"gérer|gestion|minuteur|démarrer|pause|reprendre|mélanger|présence|humeur|supprimer|créer.*équipe|modifier.*équipe", re.I)
    for control in await page.get_by_role("button").all() + await page.get_by_role("link").all():
        if await control.is_visible():
            name = await control.get_attribute("aria-label") or await control.inner_text()
            assert not forbidden.search(name), f"Manager/timer control exposed: {name}"
    assert await page.locator('input[type="checkbox"], input[type="range"]').count() == 0
    assert not await page.evaluate("() => Boolean(window.portalInjected)"), "Participant name executed as HTML"


async def open_editor(page, name="Élodie Martin"):
    await page.get_by_role("button", name=f"Écrire une note pour {name}", exact=True).click()
    await expect(editor(page).get_by_role("textbox", name="Ce que j’ai fait récemment", exact=True)).to_be_focused()
    await expect(editor(page)).to_have_attribute("aria-modal", "true")


async def compare_and_accept(page, draft, revision, server_text):
    box = editor(page)
    await expect(box.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()
    await expect(box.get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    await box.get_by_role("button", name="Recharger pour comparer", exact=True).click()
    await expect(box.get_by_text(re.compile(rf"Version serveur .*révision {revision}$"))).to_be_visible()
    await expect(box.get_by_text(server_text, exact=True)).to_be_visible()
    await expect(box.get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    await box.get_by_role("button", name="Version examinée : conserver mon brouillon", exact=True).click()
    await expect(box.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_enabled()


async def main_flow(page, api):
    api.initial_gate = asyncio.Event()
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await expect(page.get_by_role("status").filter(has_text="Chargement de votre équipe…")).to_be_visible()
    assert not api.puts
    api.initial_gate.set()
    await loaded(page)
    await expect(page.get_by_text("40 participants", exact=True)).to_be_visible()
    await expect(page.get_by_text(f"{api.data['day']} · Maurice", exact=True)).to_be_visible()
    navigation = page.get_by_role("banner").get_by_role("navigation", name="Vues de l’équipe", exact=True)
    await expect(navigation.get_by_role("button", name="Notes du jour", exact=True)).to_have_attribute("aria-pressed", "true")
    await expect(page.get_by_role("img", name="Infomil Mauritius", exact=True)).to_be_visible()
    await layout(page)

    panel = notes_panel(page)
    await expect(panel.locator("ul > li")).to_have_count(8)
    pager = page.get_by_role("navigation", name="Participants", exact=True)
    await expect(pager.get_by_text("1 / 5", exact=True)).to_be_visible()
    await pager.get_by_role("button", name="Suivant", exact=True).click()
    await expect(pager.get_by_text("2 / 5", exact=True)).to_be_visible()
    await expect(page.get_by_role("button", name="Écrire une note pour Participant 09", exact=True)).to_be_visible()
    search = page.get_by_role("searchbox", name="Rechercher un participant", exact=True)
    await search.fill("elodie")
    await expect(panel.locator("ul > li")).to_have_count(1)
    await expect(pager.get_by_text("1 / 1", exact=True)).to_be_visible()
    await search.fill("no-such-person")
    await expect(page.get_by_text("Aucun participant ne correspond à votre recherche.", exact=True)).to_be_visible()
    await search.fill("")
    await expect(panel.get_by_text('<script>window.portalInjected=true</script>', exact=True)).to_be_visible()

    # Absent participants also have an editor; this is not an identity selector.
    await open_editor(page, "Participant 03")
    await editor(page).get_by_role("button", name="Fermer", exact=True).click()
    await open_editor(page)
    draft = "Préparer la démo 😀\n\nPartager le point bloquant"
    await editor(page).get_by_role("textbox").first.fill(draft.replace("\n\n", "\n"))
    guide_button = page.get_by_role("button", name="Guide d’utilisation", exact=True)
    await guide_button.click()
    guide = page.get_by_role("dialog", name="Guide de l’espace participants", exact=True)
    await expect(guide).to_be_visible()
    await expect(guide.get_by_role("heading", name="Garder la main sur son brouillon", exact=True)).to_be_visible()
    await layout(page)
    await guide.get_by_role("button", name="Fermer le guide", exact=True).click()
    await expect(guide).not_to_be_visible()
    await expect(guide_button).to_be_focused()
    await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    assert not api.puts, "Opening the guide must not save a draft"
    await editor(page).get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(editor(page).get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    assert api.puts == [{"participantId": "person-01", "hint": f"**Récemment**\n\n{draft}", "day": api.data["day"], "revision": 0}]
    await editor(page).get_by_role("button", name="Fermer", exact=True).click()
    await page.get_by_role("button", name="Statistiques", exact=True).click()
    await expect(navigation.get_by_role("button", name="Statistiques", exact=True)).to_have_attribute("aria-pressed", "true")
    await expect(navigation.get_by_role("button", name="Notes du jour", exact=True)).to_have_attribute("aria-pressed", "false")
    await expect(page.get_by_role("heading", name="Le rythme de l’équipe", exact=True)).to_be_visible()
    ranking = page.get_by_role("list", name="Classement sur cinq jours", exact=True)
    await expect(ranking.locator("li")).to_have_count(8)
    stats = page.locator("section").filter(has=page.get_by_role("heading", name="Le rythme de l’équipe", exact=True))
    await expect(stats.locator("dl > div").filter(has=page.get_by_text("Dailys terminés", exact=True)).locator("dd")).to_have_text("2")
    await expect(stats.locator("dl > div").filter(has=page.get_by_text("Score moyen enregistré", exact=True)).locator("dd")).to_have_text("800")
    await page.get_by_role("navigation", name="Classement statistique", exact=True).get_by_role("button", name="Suivant", exact=True).click()
    await stats.get_by_role("searchbox").fill("elodie")
    await expect(ranking.locator("li")).to_have_count(1)
    await layout(page)
    await page.get_by_role("button", name="Bilan du jour", exact=True).click()
    await expect(page.get_by_role("heading", name="Le bilan du jour", exact=True)).to_be_visible()
    await expect(page.get_by_role("list", name="Résultats du jour", exact=True).locator("li")).to_have_count(8)
    await page.get_by_text("Contexte du bilan et mesures", exact=True).click()
    await expect(page.get_by_text("Humeur : 1 · Contexte archivé", exact=True).first).to_be_visible()
    await layout(page)
    await page.get_by_role("button", name="Notes du jour", exact=True).click()
    await open_editor(page)
    await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    assert len(api.puts) == 1, "Tab navigation must not save automatically"
    await page.reload(wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    await expect(editor(page).get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()

    # Clean editors intentionally retain their accepted baseline after ANY server
    # change. They require compare + acknowledge, not automatic draft replacement.
    api.note("Mise à jour distante, éditeur propre", 2)
    await page.get_by_role("button", name="Actualiser", exact=True).click()
    await expect(editor(page).get_by_role("button", name="Recharger pour comparer", exact=True)).to_be_visible()
    await compare_and_accept(page, draft, 2, "Mise à jour distante, éditeur propre")
    assert len(api.puts) == 1, "Acknowledgement is not a save"

    conflict_draft = "Mon brouillon conservé après conflit\n\nToujours ici 😀"
    await editor(page).get_by_role("textbox").first.fill(conflict_draft.replace("\n\n", "\n"))
    api.conflict_once = True
    await editor(page).get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(editor(page).get_by_role("button", name="Recharger pour comparer", exact=True)).to_be_visible()
    assert len(api.puts) == 2 and api.puts[-1] == {
        "participantId": "person-01", "hint": f"**Récemment**\n\n{conflict_draft}",
        "day": api.data["day"], "revision": 2,
    }
    await compare_and_accept(page, conflict_draft, 3, "Version concurrente du serveur")
    await expect(editor(page).get_by_text("Version concurrente du serveur", exact=True)).to_have_count(0)
    assert len(api.puts) == 2, "409 recovery must never retry PUT automatically"
    await editor(page).get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(editor(page).get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    assert len(api.puts) == 3, "Only explicit save actions may write"
    assert api.puts[-1] == {"participantId": "person-01", "hint": f"**Récemment**\n\n{conflict_draft}", "day": api.data["day"], "revision": 3}
    await layout(page)
    await page.reload(wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    await expect(editor(page).get_by_role("textbox").first).to_have_text(conflict_draft, use_inner_text=True)
    await editor(page).get_by_role("button", name="Fermer", exact=True).click()


async def modal_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    trigger = page.get_by_role("button", name="Écrire une note pour Élodie Martin", exact=True)
    await open_editor(page)
    await page.keyboard.press("Escape")
    await expect(editor(page)).to_have_count(0)
    await expect(trigger).to_be_focused()
    await open_editor(page)
    draft = "Brouillon conservé dans la fenêtre"
    await editor(page).get_by_role("textbox").first.fill(draft)
    page.once("dialog", lambda dialog: dialog.dismiss())
    await page.keyboard.press("Escape")
    await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    page.once("dialog", lambda dialog: dialog.dismiss())
    await page.locator(".note-modal .MuiDialog-container").click(position={"x": 2, "y": 2}, force=True)
    await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    await editor(page).get_by_role("textbox").first.fill("x" * 601)
    await expect(editor(page).get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()
    await expect(editor(page).get_by_role("textbox").first).to_have_attribute("aria-invalid", "true")
    await layout(page)
    page.once("dialog", lambda dialog: dialog.accept())
    await editor(page).get_by_role("button", name="Fermer", exact=True).click()
    await expect(editor(page)).to_have_count(0)
    await expect(trigger).to_be_focused()
    assert not api.puts, "Dismissal and validation must not save a draft"


async def rich_text_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    box = editor(page)
    section = box.locator(".note-section").first
    field = section.get_by_role("textbox").first
    await field.fill("Une idée importante 😀")
    await field.press("Control+a")
    await section.get_by_role("button", name="Gras", exact=True).click()
    await expect(section.get_by_role("button", name="Gras", exact=True)).to_have_attribute("aria-pressed", "true")
    await expect(field.locator("strong")).to_have_text("Une idée importante 😀")
    await section.get_by_role("button", name="Italique", exact=True).click()
    await expect(field.locator("em")).to_have_text("Une idée importante 😀")
    await section.get_by_role("button", name="Barré", exact=True).click()
    await expect(field.locator("s")).to_have_text("Une idée importante 😀")
    await section.get_by_role("button", name="Liste à puces", exact=True).click()
    await expect(field.locator("ul li")).to_have_count(1)
    # Put the caret in the list item, excluding Tiptap's trailing empty paragraph.
    await field.locator("ul li p").click()
    await section.get_by_role("button", name="Liste numérotée", exact=True).click()
    await expect(field.locator("ol li")).to_have_count(1)
    await section.get_by_role("button", name="Annuler", exact=True).click()
    await expect(section.get_by_role("button", name="Rétablir", exact=True)).to_be_enabled()
    await section.get_by_role("button", name="Rétablir", exact=True).click()
    await expect(field.locator("ol li")).to_have_count(1)
    await layout(page)
    await box.get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(box.get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    assert len(api.puts) == 1 and api.puts[0]["hint"].startswith("**Récemment**\n\n") and "~~" in api.puts[0]["hint"]
    await box.get_by_role("button", name="Fermer", exact=True).click()
    preview = page.locator(".note-preview").first
    await expect(preview.locator("strong").filter(has_text="Une idée importante 😀")).to_have_text("Une idée importante 😀")
    await expect(preview.locator("em")).to_have_text("Une idée importante 😀")
    await expect(preview.locator("del")).to_have_text("Une idée importante 😀")
    await page.reload(wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    await expect(editor(page).get_by_role("textbox").first.locator("strong")).to_have_text("Une idée importante 😀")
    await expect(editor(page).get_by_role("textbox").first.locator("ol li")).to_have_count(1)
    await expect(editor(page).get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()
    await editor(page).get_by_role("button", name="Fermer", exact=True).click()
    # Shared Markdown cannot execute HTML or load image/link resources.
    api.note('<img src="https://example.invalid/x" onerror="window.portalInjected=true">\n<script>window.portalInjected=true</script>\n\n**Texte sûr**', 2)
    await page.get_by_role("button", name="Actualiser", exact=True).click()
    await expect(page.locator(".note-preview strong").filter(has_text="Texte sûr")).to_have_text("Texte sûr")
    assert await page.locator(".note-preview img, .note-preview script, .note-preview a").count() == 0
    await layout(page)


async def three_section_flow(page, api):
    legacy = "Une note historique sans sections"
    api.note(legacy, 1)
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    box = editor(page)
    names = ("Ce que j’ai fait récemment", "Ce que je fais maintenant", "Ce que je ferai ensuite")
    headings = ("Récemment", "Maintenant", "Ensuite")
    fields = [box.get_by_role("textbox", name=name, exact=True) for name in names]
    save = box.get_by_role("button", name="Enregistrer la note", exact=True)
    await expect(box.get_by_role("textbox")).to_have_count(3)
    await expect(box.locator(".note-section")).to_have_count(3)
    await expect(fields[0]).to_have_text(legacy, use_inner_text=True)
    for field in fields[1:]:
        await expect(field).to_have_text("", use_inner_text=True)
    await expect(save).to_be_disabled()
    assert not api.puts, "Opening a legacy note must not rewrite it"

    values = ("Démo préparée 😀", "Je partage les avancées", "Je vérifierai les retours")
    for field, value in zip(fields, values):
        await field.fill(value)
    await expect(save).to_be_enabled()
    await layout(page)
    await save.click()
    await expect(box.get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    serialized = "\n\n".join(f"**{heading}**\n\n{value}" for heading, value in zip(headings, values))
    assert api.puts == [{
        "participantId": "person-01", "hint": serialized,
        "day": api.data["day"], "revision": 1,
    }]
    await box.get_by_role("button", name="Fermer", exact=True).click()
    await page.reload(wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    for field, value in zip(fields, values):
        await expect(field).to_have_text(value, use_inner_text=True)
    await expect(save).to_be_disabled()
    assert len(api.puts) == 1, "Reopening must not save automatically"

    # Every section is optional, including the first; omit empty headings entirely.
    for selected, heading in enumerate(headings):
        for index, field in enumerate(fields):
            await field.fill(values[index] if index == selected else "")
        await expect(save).to_be_enabled()
        await save.click()
        await expect(box.get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
        assert len(api.puts) == selected + 2
        assert api.puts[-1] == {
            "participantId": "person-01", "hint": f"**{heading}**\n\n{values[selected]}",
            "day": api.data["day"], "revision": selected + 2,
        }, api.puts[-1]
        await box.get_by_role("button", name="Fermer", exact=True).click()
        await open_editor(page)
        for index, field in enumerate(fields):
            await expect(field).to_have_text(values[index] if index == selected else "", use_inner_text=True)
        await expect(save).to_be_disabled()

    for field in fields:
        await field.fill("")
    await expect(save).to_be_disabled()
    await layout(page)
    assert len(api.puts) == 4, "Clearing all sections must not save or delete the note"
    page.once("dialog", lambda dialog: dialog.accept())
    await box.get_by_role("button", name="Fermer", exact=True).click()
    await expect(box).to_have_count(0)
    assert len(api.puts) == 4, "Discarding an empty draft must not write"


async def no_midnight_refresh_flow(page, api):
    api.note("Le serveur gère le nettoyage", 1)
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    reads = api.gets
    await page.clock.fast_forward(24 * 60 * 60 * 1000)
    await expect(page.locator(".note-preview")).to_have_text("Le serveur gère le nettoyage")
    assert api.gets == reads, "No scheduled refresh at midnight or after 24 hours"
    assert not api.puts, "The portal must not clear notes itself"


async def error_flow(page, api, status):
    api.read_status = status
    await page.goto(PORTAL, wait_until="domcontentloaded")
    title = "Lien d’équipe invalide" if status == 401 else "Équipe indisponible"
    await expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()
    await expect(page.get_by_role("alert").filter(has_text="invalide" if status == 401 else "Connexion indisponible")).to_be_visible()
    assert not api.puts
    await layout(page)
    api.read_status = 200
    await page.get_by_role("button", name="Réessayer", exact=True).click()
    await loaded(page)
    assert api.gets >= 2 and not api.puts
    await layout(page)


async def stale_read_flow(page, api):
    api.note("Ancienne version", 1)
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    draft = "Version sauvegardée avant la réponse GET retardée"
    await expect(editor(page).get_by_role("textbox").first).to_have_text("Ancienne version", use_inner_text=True)
    await editor(page).get_by_role("textbox").first.fill(draft)
    gate = asyncio.Event()
    api.read_gate = gate
    await page.get_by_role("button", name="Actualiser", exact=True).click()
    await asyncio.wait_for(api.read_started.wait(), 10)
    try:
        # Editor saves are allowed while GET is pending; save aborts that GET.
        await editor(page).get_by_role("button", name="Enregistrer la note", exact=True).click()
        await expect(editor(page).get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
        gate.set()
        await asyncio.wait_for(api.read_finished.wait(), 10)
        await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
        await expect(editor(page).get_by_role("button", name="Recharger pour comparer", exact=True)).to_have_count(0)
        await expect(notes_panel(page).locator("ul > li").first).to_contain_text(draft)
        assert api.puts == [{
            "participantId": "person-01", "hint": f"**Récemment**\n\n{draft}",
            "day": api.data["day"], "revision": 1,
        }]
        await layout(page)
        await page.reload(wait_until="domcontentloaded")
        await loaded(page)
        await open_editor(page)
        await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
        await editor(page).get_by_role("button", name="Fermer", exact=True).click()
    finally:
        gate.set()


async def home_flow(page, api):
    await page.goto(BASE, wait_until="domcontentloaded")
    await expect(page.get_by_role("heading", name="Votre équipe vous attend.", exact=True)).to_be_visible()
    await expect(page.get_by_role("heading", name="Un lien pour se retrouver.", exact=True)).to_be_visible()
    await page.get_by_role("link", name="Comment rejoindre mon équipe", exact=True).click()
    await expect(page).to_have_url(re.compile(r"/#rejoindre$"))
    await expect(page.get_by_role("heading", name="Un lien pour se retrouver.", exact=True)).to_be_in_viewport()
    await layout(page)
    await page.get_by_role("link", name="Consulter le guide", exact=True).click()
    await expect(page.get_by_role("heading", name="Des notes partagées, un daily bien préparé.", exact=True)).to_be_visible()
    await page.goto(BASE, wait_until="domcontentloaded")
    await page.get_by_role("link", name="En savoir plus : Le rythme de votre équipe.", exact=True).click()
    await expect(page).to_have_url(re.compile(r"/help#guide-statistiques$"))
    await expect(page.get_by_role("heading", name="Lire les statistiques", exact=True)).to_be_in_viewport()
    assert api.gets == 0 and not api.puts, "Homepage must not request team data"


async def guide_flow(page, api):
    await page.goto(BASE, wait_until="domcontentloaded")
    await page.get_by_role("link", name="Guide d’utilisation", exact=True).click()
    await expect(page.get_by_role("heading", name="Des notes partagées, un daily bien préparé.", exact=True)).to_be_visible()
    await expect(page.get_by_role("navigation", name="Sommaire du guide", exact=True).get_by_role("link")).to_have_count(6)
    await expect(page.get_by_role("heading", level=2)).to_have_count(6)
    await expect(page.get_by_role("link", name="Guide d’utilisation", exact=True)).to_have_attribute("aria-current", "page")
    await page.get_by_role("link", name="Lire les statistiques", exact=True).click()
    await expect(page).to_have_url(re.compile(r"/help#guide-statistiques$"))
    await expect(page.get_by_role("heading", name="Lire les statistiques", exact=True)).to_be_in_viewport()
    await layout(page)
    await page.reload(wait_until="domcontentloaded")
    await expect(page.get_by_role("heading", name="Lire les statistiques", exact=True)).to_be_visible()
    assert api.gets == 0 and not api.puts, "Guide must not request team data"


async def run_case(browser, viewport, motion, case):
    # Each case has fresh cookies, storage, document, mocks and in-memory state.
    context = await browser.new_context(viewport=viewport, reduced_motion=motion,
                                        timezone_id="Indian/Mauritius", locale="fr-FR",
                                        service_workers="block")
    now = datetime.now(timezone.utc)
    api = MockAPI(now)
    errors = []
    await context.route("**/*", api.route)
    page = await context.new_page()
    page.set_default_timeout(15000)
    page.on("pageerror", lambda error: errors.append(str(error)))
    # HTTP 401/409/502 resource messages are expected; JS console exceptions are not.
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" and not re.search(r"Failed to load resource.*(?:401|409|502)", msg.text) else None)
    await page.clock.set_fixed_time(now)
    try:
        if case == "main":
            await main_flow(page, api)
        elif case == "guide":
            await guide_flow(page, api)
        elif case == "home":
            await home_flow(page, api)
        elif case == "modal":
            await modal_flow(page, api)
        elif case == "rich-text":
            await rich_text_flow(page, api)
        elif case == "three-section":
            await three_section_flow(page, api)
        elif case == "no-midnight-refresh":
            await no_midnight_refresh_flow(page, api)
        elif case == "stale-read":
            await stale_read_flow(page, api)
        else:
            await error_flow(page, api, int(case))
        assert not api.violations, api.violations
        assert not errors, errors
        assert await context.cookies() == [], "Portal must not create cookies"
        print(f"PASS {viewport['width']}x{viewport['height']} {motion} {case}")
    finally:
        if api.initial_gate is not None:
            api.initial_gate.set()
        if api.read_gate is not None:
            api.read_gate.set()
        await context.close()


async def main():
    motions = ["reduce", "no-preference"] if os.environ.get("BROWSER_TEST_ALL_MOTIONS") == "1" else ["reduce"]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            for viewport in ({"width": 1366, "height": 768}, {"width": 320, "height": 568}):
                for motion in motions:
                    for case in ("main", "401", "502", "stale-read", "guide", "home", "modal", "rich-text", "three-section", "no-midnight-refresh"):
                        await run_case(browser, viewport, motion, case)
        finally:
            await browser.close()
    print("Portal smoke complete; all API traffic mocked, no live database reads/writes.")


if __name__ == "__main__":
    asyncio.run(main())