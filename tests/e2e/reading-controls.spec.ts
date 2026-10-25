import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chooseOption } from "./fixtures/themedSelect";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: true, readerMode: "LTR", pageSpread: "SINGLE", autoDownloadCount: 0, reducedMotion: true } }));
  });
});

test("chapter selection is deliberate, titles toggle selection, and Done returns to reading", async ({ page }) => {
  await page.goto("/manga/10002");
  const rows = page.locator(".yomi-chapter-row");
  await expect(rows.first().getByRole("link")).toBeVisible();
  await expect(rows.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Select chapters", exact: true }).click();
  await expect(rows.first().getByRole("checkbox")).toBeVisible();
  await expect(rows.getByRole("link")).toHaveCount(0);
  await rows.first().getByRole("button", { name: /^Toggle selection for/ }).click();
  await expect(rows.first().getByRole("checkbox")).toBeChecked();
  await expect(page.getByRole("button", { name: "Mark read", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(rows.getByRole("checkbox")).toHaveCount(0);
  await expect(rows.first().getByRole("link")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark read", exact: true })).toHaveCount(0);
});

test("dropdowns support typeahead, Escape, focus return and the empty collection choice", async ({ page }) => {
  await page.goto("/library");
  const sort = page.getByRole("combobox", { name: "Sort library", exact: true });
  await sort.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "Sort library", exact: true })).toBeVisible();
  await page.keyboard.press("u");
  await page.keyboard.press("Enter");
  await expect(sort).toHaveAttribute("data-value", "unread");
  await expect(sort).toBeFocused();
  await sort.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(sort).toBeFocused();
  const collection = page.getByRole("combobox", { name: "Collection", exact: true });
  await collection.click();
  await page.getByRole("option", { name: "Default", exact: true }).click();
  await chooseOption(collection, "");
  await expect(page.getByRole("link", { name: "[Demo] Moonlit Courier", exact: true })).toBeVisible();
});

test("themed popup remains inside its modal and Escape closes one layer at a time", async ({ page }) => {
  await page.goto("/manga/10002");
  await page.getByRole("button", { name: "Migrate Source", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Source migration", exact: true });
  const source = dialog.getByRole("combobox", { name: "Target source", exact: true });
  await source.click();
  await expect(dialog.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listbox")).toHaveCount(0);
  await expect(source).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("reader dropdown navigation never turns a page or exits the reader", async ({ page }) => {
  await page.goto("/reader/20002");
  await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  const transition = page.getByRole("combobox", { name: "Page transition", exact: true });
  await transition.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(transition).toBeFocused();
  await expect(page).toHaveURL(/\/reader\/20002$/);
  await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true })).toBeVisible();
});

for (const mode of ["dark", "light"]) {
  test(`opened menus and the sidebar caption remain clear in every ${mode} palette`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings/theme");
    await page.getByRole("button", { name: mode === "dark" ? "Dark" : "Light", exact: true }).click();
    for (const palette of ["Ink & Ember", "Sakura", "Forest", "Moonstone"]) {
      await page.getByRole("button", { name: palette, exact: true }).click();
      const gap = await page.locator(".yomi-sidebar-companion").evaluate((figure) => {
        const image = figure.querySelector(".yomi-sidebar-scene")!.getBoundingClientRect();
        const caption = figure.querySelector("figcaption")!.getBoundingClientRect();
        return caption.top - image.bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(6);
      const language = page.getByRole("combobox", { name: "Language", exact: true });
      await language.click();
      const popup = page.getByRole("listbox", { name: "Language", exact: true });
      await expect(popup).toBeVisible();
      const style = await popup.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius, right: element.getBoundingClientRect().right, bottom: element.getBoundingClientRect().bottom }));
      expect(style.radius).toBe("10px");
      expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(style.right).toBeLessThanOrEqual(1440);
      expect(style.bottom).toBeLessThanOrEqual(900);
      const violations = (await new AxeBuilder({ page }).include('[role="listbox"]').analyze()).violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
      expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${palette.replaceAll(/\W/g, "-")}-${mode}-menu.png`) });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1280, height: 640 });
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator(".yomi-sidebar-companion figcaption")).toBeVisible();
    await page.setViewportSize({ width: 360, height: 740 });
    await page.getByRole("combobox", { name: "Language", exact: true }).click();
    const rect = await page.getByRole("listbox").boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(360);
  });
}
