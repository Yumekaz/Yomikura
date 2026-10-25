import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const evidence = ".cache/identity-2026-10-25/screens";
async function demo(page: Page, palette = "ember", mode = "dark") {
  await page.addInitScript(({ palette, mode }) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: true, colorPalette: palette, themeMode: mode, autoDownloadCount: 0, pageTransition: "none" } }));
  }, { palette, mode });
  await page.route("**/api/graphql", (route) => route.abort());
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(page.locator(".yomi-logo-image").first()).toHaveAttribute("src", `/identity/logo-${palette}.webp`);
  await page.evaluate(() => document.fonts.ready);
  await mkdir(evidence, { recursive: true });
}
async function noSeriousViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")).map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))).toEqual([]);
}
for (const palette of ["ember", "sakura", "forest", "moonstone"]) for (const mode of ["dark", "light"]) {
  test(`${palette} ${mode} coordinates branding and readable library/settings controls`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await demo(page, palette, mode);
    await expect(page.locator("html")).toHaveAttribute("data-palette", palette);
    await expect(page.locator(".yomi-sidebar-companion img")).toHaveAttribute("src", `/identity/spirit-reading-${palette}.webp`);
    await expect.poll(() => page.locator(".yomi-sidebar-companion img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await noSeriousViolations(page);
    await page.screenshot({ path: `${evidence}/library-${palette}-${mode}.png` });
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Appearance and theme", exact: true })).toBeVisible();
    await noSeriousViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${evidence}/appearance-${palette}-${mode}.png` });
  });
}
test("palette and companion preferences persist after reload without changing the fixed app icon", async ({ page }) => {
  await demo(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Forest", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("checkbox", { name: "Show reading spirit", exact: true }).uncheck();
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "forest");
  await expect(page.locator("html")).toHaveClass(/light-theme/);
  await expect(page.getByRole("checkbox", { name: "Show reading spirit", exact: true })).not.toBeChecked();
  await expect(page.locator(".yomi-sidebar-companion img")).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", icon!);
  await expect(page.locator(".yomi-logo-image").first()).toHaveAttribute("src", "/identity/logo-forest.webp");
});
test("system mode follows changes in the preferred appearance", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await demo(page, "moonstone", "system");
  await expect(page.locator("html")).not.toHaveClass(/light-theme/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/light-theme/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).not.toHaveClass(/light-theme/);
});
test("identity remains usable on a phone with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await demo(page, "sakura", "light");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await noSeriousViolations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${evidence}/appearance-mobile.png` });
});
test.describe("enlarged desktop presentation", () => {
  test.use({ viewport: { width: 720, height: 512 }, deviceScaleFactor: 2 });
  test("a 200-percent equivalent viewport keeps navigation and controls reachable", async ({ page }) => {
    await demo(page, "forest", "light");
    await expect(page.getByRole("link", { name: "Add books", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("button", { name: "Forest", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${evidence}/appearance-equivalent-200-percent.png` });
  });
});
for (const mode of ["dark", "light"]) test(`first launch has a coherent ${mode} identity without visible technical setup`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.addInitScript((mode) => { localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: false, themeMode: mode, colorPalette: "ember" } })); }, mode);
  await page.route("**/api/graphql", (route) => route.abort());
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Explore Demo Library", exact: true })).toBeVisible();
  await expect(page.getByText(/localhost|127\.0\.0\.1|OpenJDK/).filter({ visible: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await noSeriousViolations(page);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/welcome-${mode}.png` });
});
