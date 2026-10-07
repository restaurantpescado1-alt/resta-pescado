import { expect, test, type Locator, type Page } from "@playwright/test";

import { createPng } from "../helpers/image-fixtures";
import {
  FISH_LABEL,
  goToAdminMenu,
  itemRow,
  loginAsOwner,
  newestAuditEntry,
  REMOVAL_TEST_ITEM_ID,
  REMOVAL_TEST_ITEM_NAME,
  REMOVAL_TEST_ITEM_WITHOUT_FISH_ID,
  useAnonymousSession,
} from "./helpers";

/**
 * Owner-initiated removal of a dish photograph.
 *
 * This is the operation where a wrong ordering destroys something. Replacement writes the
 * new object before touching the database; removal has nothing to write, so the database
 * goes first and the object second. Getting that backwards leaves a dish pointing at an
 * object that no longer exists, and the public menu shows a broken image on a dish the
 * owner was trying to tidy.
 *
 * The ordering itself is pinned in `tests/unit/image-remove.test.ts`, where the call log
 * is visible. These tests cover what only a real browser against the real Worker can show:
 * that the
 * object is genuinely gone afterwards, that the dish falls back to the right state, that
 * the owner is asked first, and that the action is audited.
 *
 * Unlike the upload specs, every test here restores the seeded state, so the suite does
 * not depend on these running before or after anything else.
 */

/** Uploads a photograph onto a dish, leaving `image_key` set. */
async function uploadPhoto(page: Page, itemId: string): Promise<void> {
  const row = itemRow(page, itemId);
  await row.locator('input[type="file"]').setInputFiles({
    name: "plat.png",
    mimeType: "image/png",
    buffer: Buffer.from(createPng({ width: 480, height: 360, colour: [0x33, 0x77, 0x99] })),
  });
  await row.getByRole("button", { name: "Téléverser" }).click();
  await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);
}

/** The `/api/media` URL of a dish's current photograph, or null when it has none. */
async function photoUrl(page: Page, itemId: string): Promise<string | null> {
  await goToAdminMenu(page);
  const image = itemRow(page, itemId).locator("img").first();
  if ((await image.count()) === 0) {
    return null;
  }
  return image.getAttribute("src");
}

function removeButton(row: Locator): Locator {
  return row.getByTestId("remove-image");
}

/**
 * Accepts the removal confirmation.
 *
 * Playwright dismisses dialogs when the page has no `dialog` listener, so without this
 * the click opens the confirmation, the dialog is dismissed, and no server action ever
 * runs. The removal tests then go on to assert against whatever message was already on
 * the page from `uploadPhoto`, which is how an earlier revision of this file passed the
 * audit test without removing a single photograph.
 */
function acceptRemoveConfirmation(page: Page): void {
  page.on("dialog", (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("Supprimer");
    void dialog.accept();
  });
}

/**
 * The newest audit entry.
 *
 * `listReadableAuditLogs` is capped at twenty rows and ordered newest first, so a count cannot
 * be used to prove a removal was recorded: once the journal is full, adding an entry leaves
 * the visible count unchanged. The top row is the one that was just written.
 */
test.describe("owner image removal", () => {
  test("the control only exists for a dish that has a photograph", async ({ page }) => {
    await goToAdminMenu(page);

    // Seeded state: no dish carries a photograph, so there is nothing to remove.
    await expect(itemRow(page, REMOVAL_TEST_ITEM_ID).getByTestId("remove-image-form")).toHaveCount(0);
  });

  test("removing a photograph restores the species illustration", async ({ page }) => {
    await goToAdminMenu(page);
    await uploadPhoto(page, REMOVAL_TEST_ITEM_ID);

    const uploaded = await photoUrl(page, REMOVAL_TEST_ITEM_ID);
    expect(uploaded).toBeTruthy();

    /*
     * The UI states the consequence before the owner commits to it, because on a mapped
     * dish the photograph is replaced by an illustration rather than by nothing, and that
     * could otherwise read as a failed removal.
     */
    const row = itemRow(page, REMOVAL_TEST_ITEM_ID);
    await expect(row.getByTestId("remove-image-form")).toContainText(
      "Le plat affichera son illustration de poisson",
    );

    await acceptRemoveConfirmation(page);
    await removeButton(row).click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

    await page.reload();
    const after = itemRow(page, REMOVAL_TEST_ITEM_ID);

    // The editor keeps only the owner's own photograph, so with it gone the row has none.
    await expect(after.getByTestId("remove-image-form")).toHaveCount(0);
    await expect(after.locator("img")).toHaveCount(0);

    /*
     * The fallback is asserted on the public menu rather than in the dashboard. What the
     * owner was promised when they confirmed is what a visitor sees, and the editor does
     * not render reference illustrations at all.
     */
    await page.goto("/menu");
    const publicRow = itemRow(page, REMOVAL_TEST_ITEM_ID);
    const image = publicRow.locator("img").first();
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", /\/images\/fish-guide\/merlan\.webp$/);
    await expect(publicRow.getByTestId("fish-reference-label")).toHaveText(FISH_LABEL);

    // And the object really is gone from the media store, not merely unreferenced.
    const media = await page.request.get(uploaded!);
    expect(media.status()).toBe(404);
  });

  test("removing a photograph leaves a dish with no species as a text row", async ({ page }) => {
    await goToAdminMenu(page);
    await uploadPhoto(page, REMOVAL_TEST_ITEM_WITHOUT_FISH_ID);

    const uploaded = await photoUrl(page, REMOVAL_TEST_ITEM_WITHOUT_FISH_ID);
    expect(uploaded).toBeTruthy();

    const row = itemRow(page, REMOVAL_TEST_ITEM_WITHOUT_FISH_ID);
    await expect(row.getByTestId("remove-image-form")).toContainText("en texte seul");
    await acceptRemoveConfirmation(page);
    await removeButton(row).click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

    await page.reload();
    const after = itemRow(page, REMOVAL_TEST_ITEM_WITHOUT_FISH_ID);

    /*
     * No photograph, no illustration, and no placeholder: a drink is text. A dashed
     * "Sans image" tile here would be nineteen identical grey squares on the menu.
     */
    await expect(after.locator("img")).toHaveCount(0);
    await expect(after.getByTestId("fish-reference-label")).toHaveCount(0);
    expect(await after.innerText()).not.toContain("Sans image");

    const media = await page.request.get(uploaded!);
    expect(media.status()).toBe(404);
  });

  test("the owner is asked to confirm, and cancelling changes nothing", async ({ page }) => {
    await goToAdminMenu(page);
    await uploadPhoto(page, REMOVAL_TEST_ITEM_ID);

    const uploaded = await photoUrl(page, REMOVAL_TEST_ITEM_ID);
    expect(uploaded).toBeTruthy();

    // There is no undo in the dashboard, so the confirmation is the only guard.
    page.once("dialog", (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("Supprimer");
      void dialog.dismiss();
    });
    await removeButton(itemRow(page, REMOVAL_TEST_ITEM_ID)).click();

    await page.reload();
    const row = itemRow(page, REMOVAL_TEST_ITEM_ID);

    // Dismissed, so the photograph is still there and still reachable.
    await expect(row.getByTestId("remove-image-form")).toBeVisible();
    await expect(row.locator("img").first()).toBeVisible();
    const media = await page.request.get(uploaded!);
    expect(media.status()).toBe(200);

    // Leave the seeded state behind.
    page.once("dialog", (dialog) => void dialog.accept());
    await removeButton(row).click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);
  });

  test("removal is audited against the dish it changed", async ({ page }) => {
    await goToAdminMenu(page);
    await uploadPhoto(page, REMOVAL_TEST_ITEM_ID);
    await acceptRemoveConfirmation(page);

    await removeButton(itemRow(page, REMOVAL_TEST_ITEM_ID)).click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

    /*
     * Checked against the newest row rather than the journal as a whole. The journal is
     * shared state that earlier tests write to and it only renders its twenty most recent
     * entries, so a page-wide containment check would pass on an entry from a previous
     * test and never notice a removal that was never recorded.
     *
     * The dish is named rather than identified by its id, because the journal is written for
     * the owner to read and `item-merlan` is not something they should ever see.
     */
    await page.goto("/admin");
    const entry = newestAuditEntry(page);
    await expect(entry).toContainText("Image supprimée");
    await expect(entry).toContainText(REMOVAL_TEST_ITEM_NAME);
  });
});

/**
 * Removal is destructive and irreversible, so the authorisation check is asserted from a
 * genuinely signed-out browser rather than inferred from the button being hidden. A hidden
 * control is a client-side courtesy; the server action has to refuse on its own.
 */
test.describe("image removal without a session", () => {
  useAnonymousSession();

  test("the dashboard is not reachable at all", async ({ page }) => {
    await page.goto("/admin/menu");

    // Redirected to the login screen, so no editor and no removal control is rendered.
    await expect(page.getByTestId("login-form")).toBeVisible();
    await expect(page.getByTestId("remove-image")).toHaveCount(0);
  });

  test("signing in afterwards still works", async ({ page }) => {
    await loginAsOwner(page);

    await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  });
});