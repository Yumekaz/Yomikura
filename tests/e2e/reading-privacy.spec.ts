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
test("completing a chapter marks matching editions read without recording another reading event", async ({ page }) => {
  const state = trackerFixture({ linked: true }); await installTrackerFixture(page, [state]);
  const peer = { ...state.chapter, id: 13, name: "Tracker chapter · alternate edition", sourceOrder: 2, lastPageRead: 1 };
  await page.route("**/api/graphql", async (route) => {
    const request = route.request().postDataJSON(), variables = request.variables ?? {}; let data;
    if (request.operationName === "GetReadingChapters") data = { chapters: { totalCount: 2, pageInfo: { hasNextPage: false }, nodes: [state.chapter, peer] } };
    else if (request.operationName === "GetChapter" && variables.id === 13) data = { chapter: { ...peer, manga: { title: state.title } } };
    else if (request.operationName === "UpdateChapterProgress" && variables.input.id === 13) { Object.assign(peer, variables.input.patch); data = { updateChapter: { chapter: peer } }; }
    else return route.fallback();
    await route.fulfill({ json: { data } });
  });
  await page.goto("/settings/library"); await page.getByRole("checkbox", { name: "Mark existing duplicate editions read", exact: true }).click();
  await finishTrackerChapter(page); await expect.poll(() => peer.isRead).toBe(true); expect(peer.lastPageRead).toBe(1);
  await expect.poll(() => state.trackCalls).toBe(1);
  const heads = await trackingHeads(page); expect(heads.filter((head) => head.hasActivity).map((head) => head.chapter.chapterId)).toEqual([12]);
});
test("tracking preferences remain isolated when switching libraries", async ({ page }) => {
  const first = trackerFixture(), second = trackerFixture({ backend: "http://127.0.0.1:45678", title: "Other library" }); await installTrackerFixture(page, [first, second]); await page.goto("/settings/privacy");
  await page.getByRole("checkbox", { name: "Update linked trackers after reading", exact: true }).click();
  await page.getByRole("combobox", { name: "Server profile", exact: true }).click(); await page.getByRole("option", { name: "Second fixture", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Update linked trackers after reading", exact: true })).toBeChecked();
});
test("tracker account status handles expiry and sign-out requires a confirmed provider response", async ({ page }) => {
  const state = trackerFixture({ linked: true, expired: true }); await installTrackerFixture(page, [state]); let requests = 0;
  await page.route("**/api/graphql", async (route) => {
    const request = route.request().postDataJSON(); let data;
    if (request.operationName === "GetTrackers") data = { trackers: { nodes: state.providers } };
    else if (request.operationName === "LogoutTracker") { requests++; const tracker = state.providers.find((item) => item.id === request.variables.input.trackerId)!; tracker.isLoggedIn = false; tracker.isTokenExpired = false; data = { logoutTracker: { tracker } }; }
    else return route.fallback(); await route.fulfill({ json: { data } });
  });
  await page.goto("/settings/advanced"); await expect(page.getByText("Sign-in expired", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in again", exact: true })).toHaveAttribute("href", "https://tracker.example/login");
  await page.getByRole("button", { name: "Sign out of First tracker", exact: true }).click(); await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click(); expect(requests).toBe(0);
  await page.getByRole("button", { name: "Sign out of First tracker", exact: true }).click(); await page.getByRole("alertdialog").getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page.getByText("Not signed in", { exact: true })).toBeVisible(); expect(requests).toBe(1); expect(state.records).toHaveLength(1);
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
