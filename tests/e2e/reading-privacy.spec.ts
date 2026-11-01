import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { finishTrackerChapter, installTrackerFixture, trackerFixture, trackingHeads } from "./fixtures/tracking";
import { mockSdk } from "../../src/api/graphql/mockSdk";
test.use({ serviceWorkers: "block" });

test("incognito reading leaves chapter progress, local activity and linked trackers untouched", async ({ page }) => {
  const state = trackerFixture({ linked: true }); await installTrackerFixture(page, [state]);
  await page.goto("/settings/privacy"); await page.getByRole("checkbox", { name: "Incognito reading", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Incognito reading", exact: true })).toBeChecked();
  await finishTrackerChapter(page); await expect(page.getByText(/Incognito · Reading progress/)).toBeVisible();
  await page.getByRole("link", { name: "Back to manga details", exact: true }).click();
  expect(await trackingHeads(page)).toEqual([]); expect(state.chapter).toMatchObject({ lastPageRead: 0, isRead: false }); expect(state.trackCalls).toBe(0);
  await page.getByRole("button", { name: "Actions for Tracker chapter", exact: true }).click(); await page.getByRole("menuitem", { name: "Bookmark", exact: true }).click();
  await expect.poll(() => state.chapter.isBookmarked).toBe(true); expect(state.chapter.isRead).toBe(false);
});
test("automatic tracker pause retains progress and a deliberate sync remains available", async ({ page }) => {
  const state = trackerFixture({ linked: true }); await installTrackerFixture(page, [state]); await page.goto("/settings/privacy");
  await page.getByRole("checkbox", { name: "Update linked trackers after reading", exact: true }).click(); await finishTrackerChapter(page);
  await expect.poll(() => state.chapter.isRead).toBe(true); await page.getByRole("link", { name: "Back to manga details", exact: true }).click();
  expect(state.trackCalls).toBe(0); await expect(page.getByText(/Tracker sync pending/)).toBeVisible();
  await page.getByRole("button", { name: "Sync linked trackers", exact: true }).click(); await expect.poll(() => state.remote.get(501)).toBe(1);
});
test("tracking preferences remain isolated when switching libraries", async ({ page }) => {
  const first = trackerFixture(), second = trackerFixture({ backend: "http://127.0.0.1:45678", title: "Other library" }); await installTrackerFixture(page, [first, second]); await page.goto("/settings/privacy");
  await page.getByRole("checkbox", { name: "Update linked trackers after reading", exact: true }).click();
  await page.getByRole("combobox", { name: "Server profile", exact: true }).click(); await page.getByRole("option", { name: "Second fixture", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Update linked trackers after reading", exact: true })).toBeChecked();
});
test("downloaded-only mode has an obvious exit and preserves unrelated library filters", async ({ page }) => {
  const state = trackerFixture(); await installTrackerFixture(page, [state]);
  await page.route("**/api/graphql", async (route) => {
    const request = route.request().postDataJSON(); if (request.operationName !== "GetLibrary") return route.fallback();
    const data = await mockSdk.GetLibrary({}); data.mangas.nodes[0].downloadCount = 1;
    await route.fulfill({ json: { data } });
  });
  await page.goto("/settings/privacy"); await page.getByRole("checkbox", { name: "Downloaded books only", exact: true }).click(); await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: "[Demo] The Paper Garden", exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: "[Demo] Moonlit Courier", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show all books", exact: true }).click(); await expect(page.getByRole("link", { name: "[Demo] Moonlit Courier", exact: true })).toBeVisible();
});
test("privacy curtain responds to focus lifecycle and keeps the hidden interface inert", async ({ page }) => {
  await installTrackerFixture(page, [trackerFixture()]); await page.goto("/settings/privacy");
  await page.getByRole("checkbox", { name: "Hide books when you switch away", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "A moment of quiet.", exact: true })).toBeVisible(); await expect(page.getByRole("heading", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.locator(".yomi-privacy-content")).toHaveAttribute("inert", "");
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});
test("privacy controls remain accessible and do not expose native options in the browser", async ({ page }) => {
  await installTrackerFixture(page, [trackerFixture()]); await page.goto("/settings/privacy");
  await expect(page.getByRole("heading", { name: "Read on your own terms", exact: true })).toBeVisible(); await expect(page.getByRole("checkbox", { name: "Protect screen captures", exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
