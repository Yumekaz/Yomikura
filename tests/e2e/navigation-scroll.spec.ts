import { expect, test } from "@playwright/test";
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: true, serverBaseUrl: "http://127.0.0.1:4567", connectionStatus: "connected", autoDeleteReadChapters: false, autoDownloadCount: 0 } })));
});
test("new settings navigation starts at the top and Back restores the prior book position", async ({ page }) => {
  await page.goto("/manga/10001"); await expect(page.getByText("My notes", { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(150);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const position = await page.evaluate(() => window.scrollY);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeInViewport(); await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack(); await expect(page.getByRole("heading", { name: "[Demo] The Paper Garden", exact: true })).toHaveCount(1);
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - position)).toBeLessThan(3);
});
test("switching settings sections starts at their heading after a long preferences page", async ({ page }) => {
  await page.goto("/settings/reader"); await expect(page.getByRole("combobox", { name: "Reader background", exact: true })).toBeVisible();
  await page.mouse.move(850, 500); await page.mouse.wheel(0, 2200); await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Appearance", exact: true })).toBeInViewport(); await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
