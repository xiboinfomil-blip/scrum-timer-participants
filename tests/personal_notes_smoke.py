"""Focused person-note flow checks. Uses only the existing isolated mock API."""

import asyncio
from datetime import datetime, timezone
import os
import re

from playwright.async_api import async_playwright, expect
from portal_smoke import PORTAL, TEAM_ID, MockAPI, editor, layout, loaded


async def choose(page, participant):
    dialog = page.get_by_role("dialog", name="À qui appartient cette note ?")
    await expect(dialog.get_by_role("button", name="Continuer")).to_be_disabled()
    await dialog.get_by_label("Personne", exact=True).select_option(participant)
    await dialog.get_by_role("button", name="Continuer").click()
    await expect(editor(page)).to_be_visible()


async def scenario(browser, width, motion):
    context = await browser.new_context(viewport={"width": width, "height": 950}, reduced_motion=motion)
    page = await context.new_page()
    api = MockAPI(datetime.now(timezone.utc))
    api.note("PRIVATE OTHER PERSON MARKER", 2147483648, "person-03")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    await context.route("**/*", api.route)
    await page.goto(PORTAL)
    # The entrance dismisses automatically after two seconds, without an opt-out.
    await expect(page.get_by_role("dialog", name="MoodMeter.")).to_be_hidden(timeout=3500)
    await loaded(page)
    await expect(page.get_by_text("PRIVATE OTHER PERSON MARKER")).to_have_count(0)
    await page.get_by_role("button", name="Choisir une personne", exact=True).click()
    await choose(page, "person-01")
    dialog = editor(page)
    await expect(dialog.get_by_text("Élodie Martin", exact=True)).to_be_visible()
    await layout(page)
    if width <= 540:
        bounds = await dialog.bounding_box()
        assert bounds and bounds["x"] == 0 and bounds["y"] == 0
        assert bounds["width"] == width and bounds["height"] == 950
    field = dialog.locator('[contenteditable="true"]').first
    await expect(field).to_be_focused()
    await field.fill("Mes idées pour Élodie")
    await dialog.get_by_role("button", name="Guide d’utilisation", exact=True).click()
    guide = page.get_by_role("dialog", name="Guide de l’espace participants", exact=True)
    await expect(guide).to_be_visible()
    await guide.get_by_role("button", name="Fermer le guide", exact=True).click()
    await expect(dialog).to_be_visible()
    await expect(field).to_have_text("Mes idées pour Élodie")
    await expect(dialog.get_by_role("button", name="Guide d’utilisation", exact=True)).to_be_focused()
    page.once("dialog", lambda confirmation: confirmation.dismiss())
    await page.keyboard.press("Escape")
    await expect(dialog).to_be_visible()
    await dialog.locator('[contenteditable="true"]').nth(1).fill("Ma priorité actuelle")
    await dialog.locator('[contenteditable="true"]').nth(2).fill("Ma prochaine étape")
    await dialog.get_by_role("button", name="Enregistrer la note", exact=True).click()
    await expect(dialog.get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    await dialog.get_by_role("button", name="Fermer", exact=True).click()
    await expect(page.get_by_role("button", name="Écrire une note pour Élodie Martin", exact=True)).to_be_focused()
    await expect(page.get_by_role("heading", name="Élodie Martin", exact=True)).to_be_visible()
    await expect(page.get_by_text("Mes idées pour Élodie", exact=True)).to_be_visible()
    for option in ("Sombre", "Confortable", "Clair", "Compacte"):
        await page.get_by_role("button", name="Apparence", exact=True).click()
        await page.get_by_role("menuitemradio", name=option, exact=True).click()
        await expect(page.get_by_role("button", name="Apparence", exact=True)).to_be_focused()
        await layout(page)
    for viewport_width in (320, 390, 540, 600, 768, 820, 1024, 1440):
        await page.set_viewport_size({"width": viewport_width, "height": 950})
        await layout(page)
    await page.set_viewport_size({"width": width, "height": 950})
    await expect(page.get_by_role("region", name="Maintenant", exact=True)).to_contain_text("Ma priorité actuelle")
    await expect(page.get_by_role("region", name="Ensuite", exact=True)).to_contain_text("Ma prochaine étape")
    await expect(page.get_by_text("PRIVATE OTHER PERSON MARKER")).to_have_count(0)
    assert api.puts[-1]["participantId"] == "person-01"
    assert await page.evaluate("(key) => localStorage.getItem(key)", f"portal-note-person:{TEAM_ID}") == "person-01"
    stored = await page.evaluate("() => JSON.stringify(localStorage)")
    assert "Mes idées" not in stored and "PRIVATE OTHER" not in stored
    await page.reload()
    await loaded(page)
    await expect(page.get_by_role("heading", name="Élodie Martin", exact=True)).to_be_visible()
    await expect(page.get_by_text("Mes idées pour Élodie", exact=True)).to_be_visible()
    await page.get_by_role("button", name="Changer de personne").click()
    chooser = page.get_by_role("dialog", name="À qui appartient cette note ?")
    await chooser.get_by_label("Personne", exact=True).select_option("person-03")
    await chooser.get_by_role("button", name="Annuler").click()
    await expect(page.get_by_role("heading", name="Élodie Martin", exact=True)).to_be_visible()
    await page.get_by_role("button", name="Changer de personne").click()
    await chooser.get_by_label("Personne", exact=True).select_option("person-03")
    await chooser.get_by_role("button", name="Continuer").click()
    await expect(editor(page)).to_be_visible()
    await editor(page).get_by_role("button", name="Fermer", exact=True).click()
    await expect(page.get_by_text("PRIVATE OTHER PERSON MARKER", exact=True)).to_be_visible()
    await expect(page.get_by_text("Mes idées pour Élodie", exact=True)).to_have_count(0)
    await layout(page)
    await page.get_by_role("button", name="Écrire une note pour Participant 03", exact=True).click()
    second_editor = editor(page)
    await expect(second_editor.get_by_role("textbox").first).to_be_focused()
    await second_editor.get_by_role("textbox").first.fill("Révision compatible avec le maître")
    api.conflict_once = True
    await second_editor.get_by_role("textbox").first.press("Control+Enter")
    await expect(second_editor.get_by_role("button", name="Enregistrer la note", exact=True)).to_be_disabled()
    await second_editor.get_by_role("button", name="Recharger pour comparer", exact=True).click()
    await expect(second_editor.get_by_text("Version concurrente du serveur", exact=True)).to_be_visible()
    await expect(second_editor.get_by_role("textbox").first).to_have_text("Révision compatible avec le maître")
    await second_editor.get_by_role("button", name="Version examinée : conserver mon brouillon", exact=True).click()
    await second_editor.get_by_role("textbox").first.press("Control+Enter")
    await expect(second_editor.get_by_role("status")).to_have_text("Note enregistrée et partagée avec l’équipe.")
    assert api.puts[-2]["revision"] == 2147483648
    assert api.puts[-1]["revision"] == 2147483649
    await second_editor.get_by_role("button", name="Fermer", exact=True).click()
    await page.get_by_role("button", name="Statistiques", exact=True).click()
    await expect(page.get_by_role("heading", name="Participant 03", exact=True)).to_be_hidden()
    results = page.get_by_role("list", name="Classement sur cinq jours", exact=True)
    await expect(results.get_by_role("listitem")).to_have_count(8)
    search = page.get_by_role("searchbox", name="Rechercher dans les résultats", exact=True)
    await search.fill("Participant 03")
    await expect(results.get_by_role("listitem")).to_have_count(1)
    await expect(results).to_contain_text("Participant 03")
    await search.fill("")
    await page.get_by_role("button", name="Suivant", exact=True).click()
    await expect(results.get_by_role("listitem")).to_have_count(8)
    await page.get_by_role("button", name="Bilan du jour", exact=True).click()
    await expect(page.get_by_role("list", name="Résultats du jour", exact=True).get_by_role("listitem")).to_have_count(8)
    await layout(page)
    await page.get_by_role("button", name="Notes du jour", exact=True).click()
    await expect(page.get_by_text("Révision compatible avec le maître", exact=True)).to_be_visible()
    # A removed participant must not reveal another person's note as fallback.
    api.data["team"]["roster"] = [p for p in api.data["team"]["roster"] if p["id"] != "person-03"]
    api.data["hints"] = [h for h in api.data["hints"] if h["participantId"] != "person-03"]
    await page.get_by_role("button", name="Actualiser", exact=True).click()
    await expect(page.get_by_role("button", name="Choisir une personne", exact=True)).to_be_visible()
    await expect(page.get_by_text("Mes idées pour Élodie", exact=True)).to_have_count(0)
    await layout(page)
    assert not api.violations, api.violations
    assert not [e for e in errors if not re.search(r"_rsc|access control", e, re.I)], errors
    await context.close()
    print(f"PASS personal notes {width}px {motion}")


async def main():
    async with async_playwright() as playwright:
        browser = await getattr(playwright, os.environ.get("BROWSER_TEST_ENGINE", "chromium")).launch()
        for width in (1440, 320):
            for motion in ("no-preference", "reduce"):
                await scenario(browser, width, motion)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())