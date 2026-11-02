import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chooseOption } from "./fixtures/themedSelect";

async function captureBetaReview(page: Page, name: string) {
  await mkdir(".cache/beta-ui-review", { recursive: true });
  await page.screenshot({ path: `.cache/beta-ui-review/${name}.png` });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: true, readerMode: "LTR", pageSpread: "SINGLE", autoDownloadCount: 0, reducedMotion: true } }));
  });
});

test("chapter selection is deliberate, titles toggle selection, and Done returns to reading", async ({ page }) => {
  await page.goto("/manga/10002");
  await expect(page.getByText("By Yomikura", { exact: true })).toBeVisible();
  await expect(page.getByText("Art: Yomikura", { exact: true })).toHaveCount(0);
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

test("chapter actions remain inside the viewport and restore keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto("/manga/10002");
  const trigger = page.getByRole("button", { name: "Actions for Chapter 1: The Journey Begins", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.evaluate((element) => {
    window.scrollBy(0, element.getBoundingClientRect().bottom - (window.innerHeight - 16));
  });
  const anchor = await trigger.boundingBox();
  expect(anchor!.y).toBeGreaterThan(320);
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Actions for Chapter 1: The Journey Begins", exact: true });
  await expect(menu).toBeVisible();
  const rect = await menu.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(1280);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(640);
  try {
    await expect(menu.getByRole("menuitem", { name: "Mark read", exact: true })).toBeFocused();
  } catch (error) {
    const diagnostics = await menu.evaluate((element) => {
      const active = document.activeElement as HTMLElement | null;
      const item = element.querySelector<HTMLElement>('[role="menuitem"]');
      return { active: active?.outerHTML.slice(0, 500), item: item?.outerHTML, visibility: item && getComputedStyle(item).visibility, inert: item?.closest("[inert]")?.outerHTML.slice(0, 300) };
    });
    console.log("Chapter menu focus diagnostics:", JSON.stringify(diagnostics));
    throw error;
  }
  await expect(menu.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' yomi-privacy-content ')]")).toHaveCount(1);
  await expect(menu.getByRole("menuitem", { name: "Bookmark", exact: true })).toBeVisible();
  await captureBetaReview(page, "chapter-menu");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("search icons leave room for typed text on discovery screens", async ({ page }) => {
  for (const [path, label, capture] of [["/browse/search", "Search manga title globally", "global-search"], ["/browse/mock-source", "Search manga in source", "source-search"], ["/browse/extensions", "Search extensions", "extension-search"]]) {
    await page.goto(path);
    const input = page.getByRole("textbox", { name: label, exact: true });
    await expect(input).toBeVisible();
    await input.fill("Test query");
    const field = await input.boundingBox();
    const icon = await input.locator("..").locator("svg").first().boundingBox();
    const padding = await input.evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft));
    expect(field!.x + padding).toBeGreaterThanOrEqual(icon!.x + icon!.width + 4);
    await expect(input).toHaveValue("Test query");
    await captureBetaReview(page, capture);
  }
});

test("source names remain readable at desktop and narrow widths", async ({ page }) => {
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/browse/sources");
    const name = page.getByRole("link", { name: "Browse Yomikura Playground", exact: true }).first().locator("strong");
    await expect(name).toBeVisible();
    const overflow = await name.evaluate((element) => ({ horizontal: element.scrollWidth - element.clientWidth, vertical: element.scrollHeight - element.clientHeight }));
    expect(overflow.horizontal).toBeLessThanOrEqual(1);
    expect(overflow.vertical).toBeLessThanOrEqual(1);
    if (width === 1280) await captureBetaReview(page, "source-cards");
  }
});

test("dropdowns support typeahead, Escape, focus return and the empty collection choice", async ({ page }) => {
  await page.goto("/library");
  const sort = page.getByRole("combobox", { name: "Sort library", exact: true });
  await sort.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "Sort library", exact: true })).toBeVisible();
  await page.keyboard.press("u");
  await expect(page.getByRole("option", { name: "Unread", exact: true })).toBeFocused();
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
