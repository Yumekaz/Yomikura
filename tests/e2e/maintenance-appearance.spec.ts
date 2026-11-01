import { expect, test } from "@playwright/test";
import { installTrackerFixture, trackerFixture } from "./fixtures/tracking";
import { chooseOption } from "./fixtures/themedSelect";
test.use({ serviceWorkers: "block" });
test("temporary image cleanup has a cancellable scope and confirmed results", async ({ page }) => {
  await installTrackerFixture(page, [trackerFixture()]); const writes: any[] = [];
  await page.route("**/api/graphql", async (route) => { const request = route.request().postDataJSON(); if (request.operationName !== "ClearTemporaryLibraryImages") return route.fallback(); writes.push(request.variables.input); await route.fulfill({ json: { data: { clearCachedImages: request.variables.input } } }); });
  await page.goto("/settings/advanced"); await page.getByRole("button", { name: "Clear temporary library images", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Clear temporary images?", exact: true }); await expect(dialog).toContainText("Downloaded chapter files and device copies stay saved"); await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Clear temporary library images", exact: true }).click(); await page.getByRole("alertdialog").getByRole("button", { name: "Clear temporary images", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Temporary library images cleared" })).toBeVisible(); expect(writes).toEqual([{ clientMutationId: expect.any(String), cachedPages: true, cachedThumbnails: true, downloadedThumbnails: false }]);
});
test("an unconfirmed cover refresh cannot report successful maintenance", async ({ page }) => {
  await installTrackerFixture(page, [trackerFixture()]); await page.route("**/api/graphql", async (route) => { const request = route.request().postDataJSON(); if (request.operationName !== "ClearTemporaryLibraryImages") return route.fallback(); await route.fulfill({ json: { data: { clearCachedImages: { ...request.variables.input, downloadedThumbnails: false } } } }); });
  await page.goto("/settings/advanced"); await page.getByRole("button", { name: "Refresh library covers", exact: true }).click(); await page.getByRole("alertdialog").getByRole("button", { name: "Refresh covers", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "couldn’t confirm the cleanup" })).toBeVisible();
});
test("pure black follows dark mode and chapter date choices survive reload", async ({ page }) => {
  await installTrackerFixture(page, [trackerFixture()]); await page.goto("/settings/appearance"); await page.getByRole("checkbox", { name: "Pure black in dark mode", exact: true }).click();
  await expect.poll(() => page.locator("html").evaluate((element) => element.style.getPropertyValue("--ink-950"))).toBe("#000000");
  await chooseOption(page.getByRole("combobox", { name: "Chapter date format", exact: true }), "iso"); await page.reload(); await expect(page.getByRole("combobox", { name: "Chapter date format", exact: true })).toHaveAttribute("data-value", "iso"); await page.goto("/manga/42"); await expect(page.getByText("2026-10-24", { exact: true })).toBeVisible();
});
