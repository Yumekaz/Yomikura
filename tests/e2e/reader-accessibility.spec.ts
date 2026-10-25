import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: true, serverBaseUrl: "http://127.0.0.1:4567", readerMode: "LTR", pageSpread: "SINGLE", autoDownloadCount: 0 } })));
  await page.route("https://images.unsplash.com/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#31574e"/></svg>' }));
});
test("category focus wraps, nested confirmation closes first, and Escape returns focus", async ({ page }) => {
  await page.goto("/library"); const manager = page.getByRole("button", { name: "Manage Categories", exact: true }); await manager.click();
  const dialog = page.getByRole("dialog", { name: "Manage Categories", exact: true }); const close = dialog.getByRole("button", { name: "Close category manager", exact: true });
  await expect(close).toBeFocused(); await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("textbox", { name: "New category name", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  await dialog.getByRole("button", { name: "Delete category Favorites", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible(); await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0); await expect(dialog).toBeVisible();
  const violations = (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical"); expect(violations).toEqual([]);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(manager).toBeFocused();
});
test("reader shortcuts leave controls and editable content alone; crop has a truthful label", async ({ page }) => {
  await page.goto("/reader/20002"); await expect(page.getByRole("button", { name: "Layout", exact: true })).toBeVisible();
  const layout = page.getByRole("button", { name: "Layout", exact: true }); await layout.focus();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings")!).state.fitMode);
  await page.keyboard.press("f"); expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings")!).state.fitMode)).toBe(before);
  await page.evaluate(() => { const editor = document.createElement("div"); editor.contentEditable = "plaintext-only"; editor.id = "editable-fixture"; document.body.append(editor); editor.focus(); });
  await page.keyboard.press("ArrowRight"); await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true })).toBeVisible();
  await page.evaluate(() => document.getElementById("editable-fixture")?.remove());
  await layout.focus(); const surface = page.getByRole("region", { name: "Reading surface", exact: true });
  for (let step = 0; step < 10 && !await surface.evaluate((element) => document.activeElement === element); step += 1) await page.keyboard.press("Tab");
  await expect(surface).toBeFocused(); await page.keyboard.press("ArrowRight"); await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fixed page crop", exact: true })).toBeVisible(); await expect(page.getByText("Magnifies every page by 12% and clips its edges. Turn it off to show the full artwork.", { exact: true })).toBeVisible();
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical"); expect(violations).toEqual([]);
});
