import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { finishTrackerChapter, installTrackerFixture, largeRemoteId, progressStatus, readerImage, trackerBackend, trackerFixture, trackingHeads } from "./fixtures/tracking";

test("linking searches one provider and binds the chosen work with its remote ID and privacy", async ({ page }, info) => {
  const state = trackerFixture(); await installTrackerFixture(page, [state]); await page.goto("/manga/42");
  const provider = page.getByRole("region", { name: "First tracker", exact: true });
  await provider.getByRole("button", { name: "Link First tracker", exact: true }).click();
  await provider.getByRole("textbox", { name: "Search tracker works", exact: true }).fill("Exact work");
  await provider.getByRole("button", { name: "Search tracker", exact: true }).click();
  await expect(provider.getByText("Another provider's work", { exact: true })).toHaveCount(0);
  await provider.getByRole("button", { name: /^Chosen work/ }).click();
  await expect(provider.getByRole("checkbox", { name: "Private tracker entry", exact: true })).toBeChecked();
  await provider.getByRole("button", { name: "Link selected work", exact: true }).click();
  await expect(provider.getByText("Linked", { exact: true })).toBeVisible();
  expect(state.searches).toEqual([{ trackerId: 1, query: "Exact work" }]);
  expect(state.bindings).toEqual([{ mangaId: 42, trackerId: 1, remoteId: largeRemoteId, private: true }]); expect(state.trackCalls).toBe(0);
  await page.reload(); await expect(provider.getByRole("link", { name: "Chosen work", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("tracker-binding-verified.png") });
});

test("manual tracker editing preserves zero and fractions and unlinking retains the remote entry", async ({ page }) => {
  const state = trackerFixture({ linked: true }); await installTrackerFixture(page, [state]); await page.goto("/manga/42");
  const provider = page.getByRole("region", { name: "First tracker", exact: true });
  await provider.getByRole("button", { name: "Edit", exact: true }).click();
  await provider.getByRole("combobox", { name: "Tracker score", exact: true }).selectOption("0");
  await provider.getByRole("spinbutton", { name: "Chapters read", exact: true }).fill("2.5");
  await provider.getByRole("checkbox", { name: "Private tracker entry", exact: true }).check();
  await provider.getByRole("button", { name: "Save tracker changes", exact: true }).click();
  await expect(provider.getByText("2.5 / 10", { exact: true })).toBeVisible();
  expect(state.edits).toEqual([{ recordId: 501, scoreString: "0", lastChapterRead: 2.5, private: true }]);
  expect(state.records[0]).toMatchObject({ score: 0, private: true, lastChapterRead: 2.5 });
  await provider.getByRole("button", { name: "Unlink First tracker", exact: true }).click();
  await expect(provider.getByRole("button", { name: "Link First tracker", exact: true })).toBeVisible();
  expect(state.unbindings).toEqual([{ recordId: 501, deleteRemoteTrack: false }]); expect(state.remote.get(501)).toBe(2.5);
});

test("a server-ignored tracker edit remains an error with its form available", async ({ page }) => {
  const state = trackerFixture({ linked: true }); state.ignoreEdits = true; await installTrackerFixture(page, [state]); await page.goto("/manga/42");
  const provider = page.getByRole("region", { name: "First tracker", exact: true }); await provider.getByRole("button", { name: "Edit", exact: true }).click();
  await provider.getByRole("combobox", { name: "Tracker score", exact: true }).selectOption("0");
  await provider.getByRole("button", { name: "Save tracker changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("not confirmed");
  await expect(provider.getByRole("button", { name: "Save tracker changes", exact: true })).toBeVisible(); expect(state.records[0].score).toBe(9);
});

test("acknowledged reader completion synchronizes once and rereading does not duplicate it", async ({ page }) => {
  const state = trackerFixture({ linked: true }); await installTrackerFixture(page, [state]); await finishTrackerChapter(page);
  await expect.poll(() => state.remote.get(501)).toBe(1); await expect(progressStatus(page)).toHaveCount(0); expect(state.trackCalls).toBe(1);
  await page.keyboard.press("ArrowLeft"); await expect(readerImage(page, 1)).toHaveCSS("opacity", "1");
  await expect.poll(() => state.chapter.lastPageRead).toBe(0); expect(state.trackCalls).toBe(1);
  expect((await trackingHeads(page))[0]).toMatchObject({ patch: { isRead: true }, trackingAcknowledgedSequence: expect.any(Number) });
});

test("HTTP success with stale provider progress retains a retry while reading remains saved", async ({ page }, info) => {
  const state = trackerFixture({ linked: true, failure: true }); await installTrackerFixture(page, [state]); await finishTrackerChapter(page);
  await expect(progressStatus(page)).toContainText("Tracker sync pending");
  await expect(progressStatus(page)).toContainText("not confirmed"); expect(state.chapter.isRead).toBe(true); expect(state.remote.get(501)).toBe(0);
  expect((await trackingHeads(page))[0].trackingAttempts).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("tracker-retry-reading-saved.png") });
  state.failure = false; await progressStatus(page).getByRole("button", { name: "Retry sync", exact: true }).click();
  await expect(progressStatus(page)).toHaveCount(0); expect(state.remote.get(501)).toBe(1);
});

test("expired tracker authentication retains completion without claiming external success", async ({ page }) => {
  const state = trackerFixture({ linked: true, expired: true }); await installTrackerFixture(page, [state]); await finishTrackerChapter(page);
  await expect(progressStatus(page)).toContainText("Sign in"); expect(state.trackCalls).toBe(0); expect(state.chapter.isRead).toBe(true);
  state.providers[0].isTokenExpired = false; await progressStatus(page).getByRole("button", { name: "Retry sync", exact: true }).click();
  await expect(progressStatus(page)).toHaveCount(0); expect(state.remote.get(501)).toBe(1);
});

for (const number of [2.5, 0, -1]) test(`automatic tracking handles chapter number ${number} without inventing progress`, async ({ page }) => {
  const state = trackerFixture({ linked: true, number }); await installTrackerFixture(page, [state]); await finishTrackerChapter(page);
  await expect.poll(() => state.chapter.isRead).toBe(true); await expect(progressStatus(page)).toHaveCount(0);
  expect(state.remote.get(501)).toBe(number > 0 ? number : 0); expect(state.trackCalls).toBe(number > 0 ? 1 : 0);
});

test("pending tracker synchronization survives a full Chrome restart", async ({}, info) => {
  const profile = await mkdtemp(resolve(".cache/tracker-profile-")); const state = trackerFixture({ linked: true, failure: true });
  const launch = () => chromium.launchPersistentContext(profile, { headless: true, baseURL: info.project.use.baseURL, serviceWorkers: "block", executablePath: process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined });
  let context = await launch();
  try {
    let page = context.pages()[0]; await installTrackerFixture(page, [state]); await finishTrackerChapter(page);
    await expect(progressStatus(page)).toContainText("not confirmed"); await context.close();
    context = await launch(); page = context.pages()[0]; await installTrackerFixture(page, [state]); await page.goto("/manga/42");
    await expect(progressStatus(page)).toContainText("Tracker sync pending");
    expect((await trackingHeads(page))[0].patch.isRead).toBe(true);
    state.failure = false; await progressStatus(page).getByRole("button", { name: "Retry sync", exact: true }).click();
    await expect(progressStatus(page)).toHaveCount(0); expect(state.remote.get(501)).toBe(1);
    const calls = state.trackCalls; await page.reload(); await expect(page.getByRole("heading", { name: state.title, exact: true })).toBeVisible();
    await expect(progressStatus(page)).toHaveCount(0); expect(state.trackCalls).toBe(calls);
  } finally { await context.close(); }
});

test("overlapping backend IDs retain separate tracker retries through profile switching", async ({ page }) => {
  const first = trackerFixture({ linked: true, failure: true }); const second = trackerFixture({ linked: true, backend: "http://127.0.0.1:45678", title: "Second tracker fixture" });
  await installTrackerFixture(page, [first, second]); await finishTrackerChapter(page); await expect(progressStatus(page)).toContainText("not confirmed");
  await page.goto("/settings/reader"); await page.getByRole("combobox", { name: "Server profile", exact: true }).selectOption("second");
  await finishTrackerChapter(page); await expect.poll(() => second.remote.get(501)).toBe(1); await expect(progressStatus(page)).toHaveCount(0);
  expect(first.remote.get(501)).toBe(0);
  await page.goto("/settings/reader"); await page.getByRole("combobox", { name: "Server profile", exact: true }).selectOption("first");
  await expect(progressStatus(page)).toContainText("Tracker sync pending"); first.failure = false;
  await progressStatus(page).getByRole("button", { name: "Retry sync", exact: true }).click(); await expect(progressStatus(page)).toHaveCount(0);
  expect(first.remote.get(501)).toBe(1); expect(second.remote.get(501)).toBe(1);
});

test("a manual tracker position edit wins over an earlier delayed reading acknowledgement", async ({ page }) => {
  const state = trackerFixture({ linked: true, remote: 3 }); state.holdCompletion = true; await installTrackerFixture(page, [state]);
  try {
    await finishTrackerChapter(page); await expect.poll(() => state.held).toBe(true);
    await page.getByRole("link", { name: "Back to manga details", exact: true }).click();
    const provider = page.getByRole("region", { name: "First tracker", exact: true });
    await provider.getByRole("button", { name: "Edit", exact: true }).click(); await provider.getByRole("spinbutton", { name: "Chapters read", exact: true }).fill("0");
    await provider.getByRole("button", { name: "Save tracker changes", exact: true }).click();
    await expect(provider.getByText("0 / 10", { exact: true })).toBeVisible();
    state.releaseCompletion!();
    await expect(progressStatus(page)).toHaveCount(0); expect(state.remote.get(501)).toBe(0); expect(state.trackCalls).toBe(0);
    expect((await trackingHeads(page))[0].trackingCancelledThrough).toBeGreaterThan(0);
  } finally { state.releaseCompletion?.(); }
});
