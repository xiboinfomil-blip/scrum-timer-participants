"""Isolated portal browser smoke; every API request is mocked, never proxied.

Parent (from scrumParticipants, after starting the portal on port 3002):
    python -m pip install playwright
    python -m playwright install chromium
    python tests/portal_smoke.py
Optional environment: BROWSER_TEST_URL, BROWSER_TEST_ALL_MOTIONS=1,
BROWSER_TEST_ENGINE=chromium|firefox|webkit, BROWSER_TEST_CASES=case,case,
BROWSER_TEST_IPHONE=1 (adds an iPhone 13 touch context; unsupported in Firefox).
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
        self.write_status = 200
        self.write_updated_at = None
        self.write_gate = None
        self.write_started = asyncio.Event()
        self.token = TOKEN
        self.conflict_once = False
        self.abort_after_commit_once = False
        self.cas_conflicts = []
        self.lost_responses = 0
        self.gets = 0
        self.puts = []
        self.violations = []
        self.initial_gate = None
        self.read_gate = None
        self.read_started = asyncio.Event()
        self.read_finished = asyncio.Event()

    def note(self, text, revision, participant="person-01", updated_at=None):
        self.data["hints"] = [h for h in self.data["hints"] if h["participantId"] != participant]
        note = {"participantId": participant, "hint": text, "revision": revision}
        if updated_at is not None:
            note["updatedAt"] = updated_at
        self.data["hints"].append(note)

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
        if headers.get("x-team-link") != self.token or url.query:
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
        self.write_started.set()
        if self.write_gate is not None:
            await self.write_gate.wait()
        if not isinstance(body, dict) or set(body) != {"participantId", "hint", "day", "revision"}:
            self.violations.append("PUT body keys differ from strict contract")
            await route.fulfill(status=400, json={"error": "INVALID_REQUEST"})
            return
        current = next((h for h in self.data["hints"] if h["participantId"] == body["participantId"]), None)
        valid = (
            any(p["id"] == body["participantId"] for p in self.data["team"]["roster"])
            and isinstance(body["day"], str)
            and re.fullmatch(r"\d{4}-\d{2}-\d{2}", body["day"])
            and type(body["revision"]) is int
            and body["revision"] >= 0
            and isinstance(body["hint"], str) and body["hint"] == body["hint"].strip()
            and 1 <= len(body["hint"]) <= 600
            and not re.search(r"[\x00-\x09\x0b-\x1f\x7f-\x9f]", body["hint"])
        )
        if not valid:
            self.violations.append("Invalid participant or malformed note payload")
            await route.fulfill(status=400, json={"error": "INVALID_REQUEST"})
        elif body["day"] != self.data["day"] or body["revision"] != (current["revision"] if current else 0):
            # Well-formed stale CAS is an expected conflict, not a contract violation.
            self.cas_conflicts.append(deepcopy(body))
            await route.fulfill(status=409, json={"error": "CONFLICT"})
        elif self.conflict_once:
            self.conflict_once = False
            self.note("Version concurrente du serveur", body["revision"] + 1, body["participantId"])
            await route.fulfill(status=409, json={"error": "CONFLICT"})
        elif self.write_status != 200:
            await route.fulfill(status=self.write_status, json={"error": "UPSTREAM_UNAVAILABLE"})
        else:
            self.note(body["hint"], body["revision"] + 1, body["participantId"], updated_at=self.write_updated_at)
            if self.abort_after_commit_once:
                self.abort_after_commit_once = False
                self.lost_responses += 1
                await route.abort()
                return
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
    assert await page.locator('svg:not(.MuiSvgIcon-root)').count() == 0, 'All interface icons must use Material Icons'
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
    await expect(page.get_by_role("region", name="Équipe smoke · 40", exact=True).get_by_text("40 participants", exact=True)).to_be_visible()
    await expect(page.get_by_title(f"{api.data['day']} · Maurice", exact=True)).to_be_visible()
    for control in await page.locator('.favorite-toggle, .participant-action').all():
        bounds = await control.bounding_box()
        assert bounds and bounds['width'] >= 44 and bounds['height'] >= 44, 'Participant actions need touch-friendly targets'
    search = page.get_by_role('searchbox', name='Rechercher un participant')
    await search.fill('Participant 09')
    await expect(notes_panel(page).locator('ul > li')).to_have_count(1)
    await page.get_by_role('button', name='Effacer la recherche', exact=True).click()
    await expect(search).to_have_value('')
    await expect(search).to_be_focused()
    await expect(notes_panel(page).locator('ul > li')).to_have_count(8)
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
    field = editor(page).get_by_role("textbox").first
    await field.fill(draft.split("\n\n")[0])
    await field.press("End")
    await field.press("Enter")
    await page.keyboard.insert_text(draft.split("\n\n")[1])
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
    assert api.puts == [{"participantId": "person-01", "hint": f"**Récemment**\n\n{draft}", "day": api.data["day"], "revision": 0}], api.puts
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
    field = editor(page).get_by_role("textbox").first
    await field.fill(conflict_draft.split("\n\n")[0])
    await field.press("End")
    await field.press("Enter")
    await page.keyboard.insert_text(conflict_draft.split("\n\n")[1])
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
    if page.viewport_size['width'] > 540:
        page.once("dialog", lambda dialog: dialog.dismiss())
        await page.locator(".note-modal .MuiDialog-container").click(position={"x": 2, "y": 2}, force=True)
        await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    else:
        bounds = await editor(page).bounding_box()
        assert bounds and bounds['width'] == page.viewport_size['width'], 'Mobile editor should use the full screen'
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
    if await page.evaluate("() => /iPhone/.test(navigator.userAgent)"):
        # Desktop keyboard select-all is not modeled on iOS; create the same
        # DOM selection a touch selection gesture supplies to ProseMirror.
        await field.evaluate("element => { element.focus(); const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }")
    else:
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


async def favorites_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    panel = notes_panel(page)
    cards = panel.locator("li.participant-card")
    search = page.get_by_role("searchbox", name="Rechercher un participant", exact=True)
    pager = page.get_by_role("navigation", name="Participants", exact=True)
    pin = page.get_by_role("button", name="Épingler Participant 09 aux favoris", exact=True)
    unpin = page.get_by_role("button", name="Retirer Participant 09 des favoris", exact=True)
    key = f"portal-favorites:{TEAM_ID}"

    await search.fill("Participant 09")
    await expect(cards).to_have_count(1)
    await expect(pin).to_have_attribute("aria-pressed", "false")
    # Find via search first, then pin from page two to exercise the page reset.
    await search.fill("")
    await pager.get_by_role("button", name="Suivant", exact=True).click()
    await expect(pager.get_by_text("2 / 5", exact=True)).to_be_visible()
    await pin.click()
    await expect(pager.get_by_text("1 / 5", exact=True)).to_be_visible()
    await expect(cards.first.locator(".participant-name")).to_have_text("Participant 09")
    await expect(unpin).to_have_attribute("aria-pressed", "true")
    assert json.loads(await page.evaluate("key => localStorage.getItem(key)", key)) == ["person-09"]
    await page.reload(wait_until="domcontentloaded")
    await loaded(page)
    await expect(unpin).to_have_attribute("aria-pressed", "true")
    await expect(cards.first.locator(".participant-name")).to_have_text("Participant 09")

    # Same origin and participant IDs, but a distinct team capability/storage scope.
    other_id = "b" * 64
    other_token = b64url(json.dumps({"v": 1, "teamId": other_id}, separators=(",", ":")).encode()) + "." + b64url(bytes(32))
    api.data["team"]["id"] = other_id
    api.token = other_token
    await page.goto(f"{BASE}/t/{other_token}", wait_until="domcontentloaded")
    await loaded(page)
    await expect(cards.first.locator(".participant-name")).to_have_text("Élodie Martin")
    await search.fill("Participant 09")
    await expect(pin).to_have_attribute("aria-pressed", "false")
    assert await page.evaluate("key => localStorage.getItem(key)", f"portal-favorites:{other_id}") is None
    api.data["team"]["id"] = TEAM_ID
    api.token = TOKEN
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    await expect(unpin).to_have_attribute("aria-pressed", "true")
    await unpin.click()
    await expect(cards.first.locator(".participant-name")).to_have_text("Élodie Martin")
    assert json.loads(await page.evaluate("key => localStorage.getItem(key)", key)) == []
    await page.reload(wait_until="domcontentloaded")
    await loaded(page)
    await search.fill("Participant 09")
    await expect(pin).to_have_attribute("aria-pressed", "false")
    await layout(page)
    assert not api.puts, "Favorites must never write team data"


async def inline_note_flow(page, api):
    timestamp = "2026-10-18T08:34:56.000Z"
    api.note("**Récemment**\n\nDémo **préparée**\n\n**Maintenant**\n\n- Partager les avancées\n\n**Ensuite**\n\nVérifier *les retours*", 1, updated_at=timestamp)
    api.note("Une note sans horodatage serveur", 1, "person-03")
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    card = notes_panel(page).locator("li.participant-card").filter(has=page.get_by_text("Élodie Martin", exact=True))
    await expect(card.locator("time")).to_have_attribute("datetime", timestamp)
    await expect(card.locator("time")).to_contain_text("Maurice")
    undated = notes_panel(page).locator("li.participant-card").filter(has=page.get_by_text("Participant 03", exact=True))
    await expect(undated.locator("time")).to_have_count(0)
    toggle = card.get_by_role("button", name="Développer la note de Élodie Martin", exact=True)
    await expect(toggle).to_have_attribute("aria-expanded", "false")
    await toggle.click()
    collapse = card.get_by_role("button", name="Réduire la note de Élodie Martin", exact=True)
    await expect(collapse).to_have_attribute("aria-expanded", "true")
    expanded = card.locator(".expanded-note")
    await expect(expanded).to_be_visible()
    assert await collapse.get_attribute("aria-controls") == await expanded.get_attribute("id")
    await expect(expanded.locator("section")).to_have_count(3)
    for heading, text in (("Récemment", "Démo préparée"), ("Maintenant", "Partager les avancées"), ("Ensuite", "Vérifier les retours")):
        section = expanded.get_by_role("region", name=heading, exact=True)
        await expect(section.get_by_role("heading", name=heading, exact=True)).to_be_visible()
        await expect(section).to_contain_text(text)
    await expect(expanded.locator("strong")).to_have_text("préparée")
    await expect(expanded.locator("ul li")).to_have_text("Partager les avancées")
    await expect(expanded.locator("em")).to_have_text("les retours")
    await expect(page.get_by_role("dialog")).to_have_count(0)
    await layout(page)
    await collapse.click()
    await expect(toggle).to_have_attribute("aria-expanded", "false")
    await expect(expanded).to_be_hidden()
    await expect(card.locator(".note-preview")).to_be_visible()
    assert not api.puts, "Reading or collapsing a note must not save"

    # Ordinary legacy writes omit updatedAt; only timestamp tests opt in.
    api.write_updated_at = "2026-10-19T09:15:00.000Z"
    await open_editor(page)
    await editor(page).get_by_role("textbox").first.fill("Démo mise à jour")
    await editor(page).get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(editor(page).get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    await editor(page).get_by_role("button", name="Fermer", exact=True).click()
    await expect(card.locator("time")).to_have_attribute("datetime", api.write_updated_at)
    await page.reload(wait_until="domcontentloaded")
    await loaded(page)
    await expect(card.locator("time")).to_have_attribute("datetime", api.write_updated_at)
    await expect(undated.locator("time")).to_have_count(0)
    assert len(api.puts) == 1


async def appearance_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    for theme_label, theme, density_label, density in (("Sombre", "dark", "Confortable", "comfortable"), ("Clair", "light", "Compacte", "compact")):
        for label in (theme_label, density_label):
            await page.get_by_role("button", name="Apparence", exact=True).click()
            await page.get_by_role("menuitemradio", name=label, exact=True).click()
        await expect(page.locator("html")).to_have_attribute("data-theme", theme)
        await expect(page.locator("html")).to_have_attribute("data-density", density)
        await layout(page)
        await open_editor(page)
        await layout(page)
        await expect(editor(page).get_by_role("button", name="Enregistrer la note", exact=True)).to_be_visible()
        await editor(page).get_by_role("button", name="Fermer", exact=True).click()
        await page.reload(wait_until="domcontentloaded")
        await loaded(page)
        await expect(page.locator("html")).to_have_attribute("data-theme", theme)
        await expect(page.locator("html")).to_have_attribute("data-density", density)
        assert json.loads(await page.evaluate("() => localStorage.getItem('scrum-participants-appearance')")) == {"theme": theme, "density": density}
        for label in (theme_label, density_label):
            await page.get_by_role("button", name="Apparence", exact=True).click()
            await expect(page.get_by_role("menuitemradio", name=label, exact=True)).to_have_attribute("aria-checked", "true")
            await page.keyboard.press("Escape")
        await layout(page)
    assert not api.puts, "Appearance is a local preference, not a team write"


async def keyboard_connection_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    connection = page.locator(".connection-indicator")
    await expect(connection).to_have_text("À jour")
    await page.context.set_offline(True)
    await page.evaluate("() => window.dispatchEvent(new Event('offline'))")
    await expect(connection).to_have_text("Connexion indisponible")
    await page.context.set_offline(False)
    await page.evaluate("() => window.dispatchEvent(new Event('online'))")
    await expect(connection).to_have_text("À jour")
    await open_editor(page)
    box = editor(page)
    field = box.get_by_role("textbox").first
    save = box.get_by_role("button", name="Enregistrer la note", exact=True)
    hint = box.locator("#note-format-help")
    await expect(hint).to_be_visible()
    await expect(hint).to_contain_text("Ctrl / ⌘ + Entrée")

    for value in ("", "x" * 601):
        await field.fill(value)
        await expect(save).to_be_disabled()
        for shortcut in ("Control+Enter", "Meta+Enter"):
            await field.press(shortcut)
        assert not api.puts, "Invalid keyboard submissions must not write"

    for index, shortcut in enumerate(("Control+Enter", "Meta+Enter"), start=1):
        draft = f"Raccourci enregistré {index}"
        await expect(field).to_have_attribute("contenteditable", "true")
        await field.fill(draft)
        await expect(field).to_have_text(draft, use_inner_text=True)
        await expect(save).to_be_enabled()
        api.write_started.clear()
        gate = asyncio.Event()
        api.write_gate = gate
        try:
            await field.press(shortcut)
            await asyncio.wait_for(api.write_started.wait(), 10)
            await expect(connection).to_have_text("Enregistrement…")
            assert len(api.puts) == index, "Each shortcut must submit exactly once"
            gate.set()
            await expect(box.get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
            await expect(connection).to_have_text("Enregistré")
            await expect(save).to_be_disabled()
            await field.press(shortcut)
            assert len(api.puts) == index, "Unchanged notes must not be submitted again"
            assert api.puts[-1] == {"participantId": "person-01", "hint": f"**Récemment**\n\n{draft}", "day": api.data["day"], "revision": index - 1}, api.puts[-1]
        finally:
            gate.set()
            api.write_gate = None
    # A remote revision disables both shortcuts without attempting a write.
    await field.fill("Brouillon en conflit")
    api.note("Modification distante", 3)
    await box.get_by_role("button", name="Actualiser", exact=True).click()
    await expect(save).to_be_disabled()
    await expect(box.get_by_role("button", name="Recharger pour comparer", exact=True)).to_be_visible()
    for shortcut in ("Control+Enter", "Meta+Enter"):
        await field.press(shortcut)
    assert len(api.puts) == 2, "Conflicting shortcuts must not write"
    await layout(page)


async def failed_write_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    box = editor(page)
    draft = "Brouillon dont l’enregistrement reste incertain"
    await box.get_by_role("textbox").first.fill(draft)
    api.write_status = 502
    await box.get_by_role("button", name="Enregistrer la note", exact=True).click()
    connection = page.locator(".connection-indicator")
    await expect(connection).to_have_text("Enregistrement à vérifier")
    await expect(box.get_by_text("Note enregistrée et partagée avec l’équipe.", exact=True)).to_have_count(0)
    await expect(box.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()
    page.once("dialog", lambda dialog: dialog.accept())
    await box.get_by_role("button", name="Fermer", exact=True).click()
    await expect(box).to_have_count(0)
    await open_editor(page)
    await expect(box.get_by_role("textbox").first).to_have_text("", use_inner_text=True)
    await box.get_by_role("textbox").first.fill(draft)
    await expect(box.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()
    await expect(connection).to_have_text("Enregistrement à vérifier")
    await box.get_by_role("button", name="Recharger pour comparer", exact=True).click()
    await expect(box.get_by_text(re.compile(r"Version serveur .*révision 0$"))).to_be_visible()
    await expect(connection).to_have_text("Enregistrement à vérifier")
    await expect(box.get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    for shortcut in ("Control+Enter", "Meta+Enter"):
        await box.get_by_role("textbox").first.press(shortcut)
    await expect(box.get_by_text("Note enregistrée et partagée avec l’équipe.", exact=True)).to_have_count(0)
    assert len(api.puts) == 1 and not api.data["hints"], "Failed saves and refresh must not commit or retry"
    await box.get_by_role("button", name="Version examinée : conserver mon brouillon", exact=True).click()
    await expect(box.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_enabled()
    assert len(api.puts) == 1, "Accepting comparison must not retry automatically"
    api.write_status = 200
    await box.get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(box.get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    assert len(api.puts) == 2 and api.puts[-1] == api.puts[0]
    assert api.data["hints"][0]["revision"] == 1
    await layout(page)


async def save_then_edit_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    box = editor(page)
    await box.get_by_role("textbox").first.fill("Premier point partagé")
    await box.get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(box.get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    await box.get_by_role("textbox").first.fill("Nouvelle modification non enregistrée")
    await expect(box.locator(".note-modal-message")).to_have_text("")
    await expect(box.get_by_text("Note enregistrée et partagée avec l’équipe.", exact=True)).to_have_count(0)
    await expect(box.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_enabled()
    assert len(api.puts) == 1 and api.data["hints"][0]["hint"] == "**Récemment**\n\nPremier point partagé"


async def history_draft_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    # Create a same-document Forward destination using the actual Next link.
    await page.get_by_role("link", name="Accueil de l’espace participants Infomil Mauritius").click()
    await expect(page.get_by_role("heading", name="Votre équipe vous attend.", exact=True)).to_be_visible()
    await page.go_back()
    await loaded(page)
    await open_editor(page)
    draft = "Brouillon préservé après navigation dans l’historique"
    await editor(page).get_by_role("textbox").first.fill(draft)
    await page.go_forward()
    await expect(page.get_by_role("heading", name="Votre équipe vous attend.", exact=True)).to_be_visible()
    await expect(editor(page)).to_have_count(0)
    assert await page.evaluate("() => !window.dispatchEvent(new Event('beforeunload', {cancelable:true}))"), "Retained drafts need unload protection even away from the team route"
    await page.go_back()
    await loaded(page)
    await open_editor(page)
    await expect(editor(page).get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    await expect(editor(page).get_by_role("button", name="Enregistrer la note", exact=True)).to_be_enabled()
    assert not api.puts, "History navigation must retain drafts without saving"


async def two_tab_flow(page, api, prepare_page):
    api.note("Point initial partagé", 1)
    other = await page.context.new_page()
    await prepare_page(other)
    # Both pages use the context's SAME MockAPI, not independent fixtures.
    for tab in (page, other):
        await tab.goto(PORTAL, wait_until="domcontentloaded")
        await loaded(tab)
        await open_editor(tab)
        await expect(editor(tab).get_by_role("textbox").first).to_have_text("Point initial partagé", use_inner_text=True)
    first_draft = "Point enregistré dans l’onglet A"
    second_draft = "Brouillon conservé dans l’onglet B"
    await editor(page).get_by_role("textbox").first.fill(first_draft)
    await editor(other).get_by_role("textbox").first.fill(second_draft)
    await editor(page).get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(editor(page).get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    # Do not bring B to front or refresh: its accepted revision must remain stale.
    async with other.expect_response(lambda response: response.url == f"{BASE}/api/team" and response.request.method == "PUT") as response_info:
        await editor(other).get_by_role("button", name="Enregistrer la note", exact=True).click()
    assert (await response_info.value).status == 409, "Stale cross-tab CAS must return 409"
    assert len(api.puts) == 2 and [body["revision"] for body in api.puts] == [1, 1]
    assert api.cas_conflicts == [api.puts[-1]] and not api.violations
    assert api.data["hints"][0]["hint"] == f"**Récemment**\n\n{first_draft}"
    await compare_and_accept(other, second_draft, 2, first_draft)
    assert len(api.puts) == 2, "Review/acceptance must not save automatically"
    await editor(other).get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(editor(other).get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    assert len(api.puts) == 3 and api.puts[-1] == {
        "participantId": "person-01", "hint": f"**Récemment**\n\n{second_draft}",
        "day": api.data["day"], "revision": 2,
    }
    assert api.data["hints"][0]["revision"] == 3 and api.data["hints"][0]["hint"] == api.puts[-1]["hint"]


async def timeout_after_commit_flow(page, api):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await loaded(page)
    await open_editor(page)
    box = editor(page)
    draft = "Point validé malgré la réponse réseau perdue"
    await box.get_by_role("textbox").first.fill(draft)
    api.abort_after_commit_once = True
    await box.get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(page.locator(".connection-indicator")).to_have_text("Enregistrement à vérifier")
    await expect(box.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()
    await expect(box.get_by_text("Note enregistrée et partagée avec l’équipe.", exact=True)).to_have_count(0)
    assert api.lost_responses == 1 and not api.abort_after_commit_once
    assert len(api.puts) == 1 and api.data["hints"][0]["revision"] == 1
    assert api.data["hints"][0]["hint"] == f"**Récemment**\n\n{draft}"
    await box.get_by_role("button", name="Recharger pour comparer", exact=True).click()
    await expect(box.get_by_text(re.compile(r"Version serveur .*révision 1$"))).to_be_visible()
    await expect(box.locator(".note-modal-review").get_by_text(draft, exact=True)).to_be_visible()
    await expect(box.get_by_role("textbox").first).to_have_text(draft, use_inner_text=True)
    await expect(page.locator(".connection-indicator")).to_have_text("Enregistrement à vérifier")
    for shortcut in ("Control+Enter", "Meta+Enter"):
        await box.get_by_role("textbox").first.press(shortcut)
    assert len(api.puts) == 1, "A committed write with a lost response must never retry automatically"
    await box.get_by_role("button", name="Version examinée : conserver mon brouillon", exact=True).click()
    await expect(box.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()
    await expect(box.get_by_role("button", name="Recharger pour comparer", exact=True)).to_have_count(0)
    assert len(api.puts) == 1, "Accepting the already committed value must not create a new revision"


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


def assert_preference_storage(entries):
    for key, value in entries:
        if key == "scrum-participants-intro":
            assert value == "hidden", "Intro preference may persist only the explicit hidden value"
        elif key == "scrum-participants-appearance":
            preference = json.loads(value)
            assert isinstance(preference, dict) and set(preference) == {"theme", "density"}
            assert preference["theme"] in ("light", "dark")
            assert preference["density"] in ("compact", "comfortable")
        else:
            assert re.fullmatch(r"portal-favorites:[ab]{64}", key), f"Non-preference storage key: {key}"
            ids = json.loads(value)
            assert isinstance(ids, list) and all(isinstance(item, str) and re.fullmatch(r"person-\d{2}", item) for item in ids), "Favorites may store participant IDs only"
        assert TOKEN not in value and '"hint"' not in value, "Notes/capabilities must never be persisted"


async def welcome_flow(page, api):
    # Block hydration scripts: the intro must already exist in server HTML.
    first_paint = await page.context.new_page()
    await first_paint.route('**/*.js', lambda route: route.abort())
    await first_paint.goto(BASE, wait_until='domcontentloaded')
    await expect(first_paint.get_by_role('dialog', name='MoodMeter.', exact=True)).to_be_visible()
    await expect(first_paint.locator('#portal-content')).to_have_css('visibility', 'hidden')
    await first_paint.close()
    gate = asyncio.Event()
    api.initial_gate = gate
    await page.goto(PORTAL, wait_until="domcontentloaded")
    intro = page.get_by_role('dialog', name='MoodMeter.', exact=True)
    await expect(intro).to_be_visible()
    skip = intro.get_by_role('button', name='Fermer l’introduction')
    await expect(skip).to_be_focused()
    await layout(page)
    await page.clock.fast_forward(4000)
    await expect(intro).to_be_visible()
    await page.clock.fast_forward(1500)
    await expect(intro).to_have_count(0)
    await expect(page.get_by_role('status').filter(has_text='Chargement de votre équipe…')).to_be_visible()
    gate.set()
    await loaded(page)
    await page.get_by_role('link', name='Accueil de l’espace participants Infomil Mauritius').click()
    await expect(page.get_by_role('heading', name='Votre équipe vous attend.', exact=True)).to_be_visible()
    await expect(intro).to_have_count(0)
    await page.reload(wait_until='domcontentloaded')
    await expect(intro).to_be_visible()
    await intro.get_by_role('button', name='Fermer l’introduction').click()
    await expect(intro).to_have_count(0)
    await expect(page.locator('#contenu')).to_be_focused()
    await page.reload(wait_until='domcontentloaded')
    await expect(intro).to_be_visible()
    await expect(intro.get_by_role('button', name='Fermer l’introduction')).to_be_focused()
    await page.keyboard.press('Escape')
    await expect(intro).to_have_count(0)


async def intro_preference_flow(page, api):
    await page.goto(BASE, wait_until="domcontentloaded")
    intro = page.get_by_role("dialog", name="MoodMeter.", exact=True)
    await expect(intro).to_be_visible()
    skip = intro.get_by_role("button", name="Fermer l’introduction", exact=True)
    never = intro.get_by_role("button", name="Ne plus afficher l’introduction", exact=True)
    await expect(skip).to_be_focused()
    await page.keyboard.press("Tab")
    await expect(never).to_be_focused()
    await page.keyboard.press("Tab")
    await expect(skip).to_be_focused()
    await page.keyboard.press("Shift+Tab")
    await expect(never).to_be_focused()
    assert await page.evaluate("() => Object.entries(localStorage)") == []
    await intro.get_by_role("button", name="Ne plus afficher l’introduction", exact=True).click()
    await expect(intro).to_have_count(0)
    assert await page.evaluate("() => Object.entries(localStorage)") == [["scrum-participants-intro", "hidden"]]
    await page.reload(wait_until="domcontentloaded")
    await expect(page.get_by_role("heading", name="Votre équipe vous attend.", exact=True)).to_be_visible()
    await expect(intro).to_have_count(0)
    assert await page.evaluate("() => Object.entries(localStorage)") == [["scrum-participants-intro", "hidden"]]
    assert await page.evaluate("() => sessionStorage.length") == 0
    assert api.gets == 0 and not api.puts, "Opting out of the intro must not request team data"


async def run_case(browser, viewport, motion, case, device=None):
    # Each case has fresh cookies, storage, document, mocks and in-memory state.
    context = await browser.new_context(**({"viewport": viewport} if device is None else device), reduced_motion=motion,
                                        timezone_id="Indian/Mauritius", locale="fr-FR",
                                        service_workers="block")
    now = datetime.now(timezone.utc)
    api = MockAPI(now)
    errors = []
    storage_writes = []
    await context.expose_binding("recordPreferenceWrite", lambda source, key, value: storage_writes.append((key, value)))
    await context.add_init_script("""(() => {
        const original = Storage.prototype.setItem;
        window.preferenceWriteChecks = [];
        Storage.prototype.setItem = function(key, value) {
            if (this === window.localStorage) {
                window.preferenceWriteChecks.push(window.recordPreferenceWrite(String(key), String(value)));
            }
            return original.call(this, key, value);
        };
    })();""")
    await context.route("**/*", api.route)

    def console_message(message):
        if message.type != "error":
            return
        # Closing the deliberately script-blocked first-paint page can cancel
        # Next's same-origin prefetch; WebKit reports that teardown as CORS.
        if case == "welcome" and "_rsc=" in message.text and "due to access control checks" in message.text:
            return
        if re.search(r"Failed to load resource.*(?:401|409|502)", message.text):
            return
        # Only this case deliberately loses one PUT response after committing.
        if case == "timeout-after-commit" and api.lost_responses == 1 and message.text.startswith("Failed to load resource:"):
            return
        errors.append(message.text)

    async def prepare_page(tab):
        tab.set_default_timeout(15000)
        def page_error(error):
            text = str(error)
            if browser.browser_type.name == "webkit" and case in ("welcome", "intro-preference") and "_rsc=" in text and "due to access control checks" in text:
                return  # Next prefetch aborted by deliberate reload/teardown.
            errors.append(text)
        tab.on("pageerror", page_error)
        tab.on("console", console_message)
        await tab.clock.set_fixed_time(now)
        if case not in ("welcome", "intro-preference"):
            await tab.add_locator_handler(tab.get_by_role("button", name="Fermer l’introduction"), lambda locator: locator.click())

    page = await context.new_page()
    await prepare_page(page)
    try:
        if case == "welcome":
            await welcome_flow(page, api)
        elif case == "intro-preference":
            await intro_preference_flow(page, api)
        elif case == "main":
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
        elif case == "favorites":
            await favorites_flow(page, api)
        elif case == "inline-note":
            await inline_note_flow(page, api)
        elif case == "appearance":
            await appearance_flow(page, api)
        elif case == "keyboard-connection":
            await keyboard_connection_flow(page, api)
        elif case == "failed-write":
            await failed_write_flow(page, api)
        elif case == "save-then-edit":
            await save_then_edit_flow(page, api)
        elif case == "history-draft":
            await history_draft_flow(page, api)
        elif case == "two-tab":
            await two_tab_flow(page, api, prepare_page)
        elif case == "timeout-after-commit":
            await timeout_after_commit_flow(page, api)
        elif case == "no-midnight-refresh":
            await no_midnight_refresh_flow(page, api)
        elif case == "stale-read":
            await stale_read_flow(page, api)
        else:
            await error_flow(page, api, int(case))
        assert not api.violations, api.violations
        assert not errors, errors
        assert await context.cookies() == [], "Portal must not create cookies"
        for tab in context.pages:
            await tab.evaluate("() => Promise.all(window.preferenceWriteChecks)")
            assert_preference_storage(await tab.evaluate("() => Object.entries(localStorage)"))
            assert await tab.evaluate("() => sessionStorage.length") == 0, "Notes/capabilities must not be stored in sessionStorage"
        assert_preference_storage(storage_writes)
        profile = "iPhone 13" if device is not None else f"{viewport['width']}x{viewport['height']}"
        print(f"PASS {browser.browser_type.name} {profile} {motion} {case}")
    finally:
        if api.initial_gate is not None:
            api.initial_gate.set()
        if api.read_gate is not None:
            api.read_gate.set()
        if api.write_gate is not None:
            api.write_gate.set()
        await context.close()


async def main():
    motions = ["reduce", "no-preference"] if os.environ.get("BROWSER_TEST_ALL_MOTIONS") == "1" else ["reduce"]
    engine = os.environ.get("BROWSER_TEST_ENGINE", "chromium").strip().lower()
    if engine not in ("chromium", "firefox", "webkit"):
        raise ValueError("BROWSER_TEST_ENGINE must be chromium, firefox or webkit")
    cases = ("welcome", "main", "401", "502", "stale-read", "guide", "home", "modal", "rich-text", "three-section", "no-midnight-refresh", "favorites", "inline-note", "appearance", "keyboard-connection", "failed-write", "save-then-edit", "history-draft", "two-tab", "timeout-after-commit", "intro-preference")
    if "BROWSER_TEST_CASES" in os.environ:
        selected = tuple(dict.fromkeys(case.strip() for case in os.environ["BROWSER_TEST_CASES"].split(",") if case.strip()))
        if not selected or set(selected) - set(cases):
            raise ValueError(f"BROWSER_TEST_CASES must select known cases: {', '.join(cases)}")
        cases = selected
    iphone = os.environ.get("BROWSER_TEST_IPHONE") == "1"
    if iphone and engine == "firefox":
        raise ValueError("BROWSER_TEST_IPHONE requires chromium or webkit; Firefox does not support is_mobile")
    async with async_playwright() as playwright:
        profiles = [(viewport, None) for viewport in ({"width": 1366, "height": 768}, {"width": 320, "height": 568})]
        if iphone:
            device = dict(playwright.devices["iPhone 13"])
            device.pop("default_browser_type", None)
            profiles.append((device["viewport"], device))
        browser = await getattr(playwright, engine).launch()
        try:
            for viewport, device in profiles:
                for motion in motions:
                    for case in cases:
                        await run_case(browser, viewport, motion, case, device)
        finally:
            await browser.close()
    print("Portal smoke complete; all API traffic mocked, no live database reads/writes.")


if __name__ == "__main__":
    asyncio.run(main())