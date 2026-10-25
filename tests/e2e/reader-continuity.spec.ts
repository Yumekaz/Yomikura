import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";

const backend = "http://127.0.0.1:45677";
const title = "Reader continuity fixture";
const fullPage = (page: Page, chapter: number, index: number) => page.locator(`[data-reader-chapter="${chapter}"][data-reader-page="${index}"]`).getByRole("img", { name: `Page ${index + 1}`, exact: true });
const picture = (chapter: number, index: number, height: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}"><rect width="600" height="${height}" fill="${chapter === 12 ? "#264653" : "#563d55"}"/><text x="35" y="100" font-size="30" fill="white">Chapter ${chapter} / Page ${index + 1}</text></svg>`;

async function fixture(page: Page, options: { saved?: number; single?: boolean; failNext?: boolean; offline?: boolean; delayed?: boolean } = {}) {
  const records = new Map([
    [12, { name: "First chapter", number: 1, heights: options.single ? [400] : [400, 900, 700, 500], page: options.saved ?? 0, read: false }],
    [13, { name: "Second chapter", number: 2, heights: [500, 1000], page: 0, read: false }],
    [14, { name: "Third chapter", number: 3, heights: [650, 550, 800], page: 0, read: false }],
  ]);
  const writes: { id: number; patch: { lastPageRead: number; isRead: boolean } }[] = [];
  const pageFetches: number[] = [];
  const metadataFetches: number[] = [];
  let allowNext = !options.failNext;
  let online = !options.offline;
  await page.addInitScript(({ backend }) => localStorage.setItem("yomikura-settings", JSON.stringify({ state: {
    serverBaseUrl: backend, mockMode: false, connectionStatus: "connected", readerMode: "WEBTOON", autoDownloadCount: 0,
    autoDeleteReadChapters: false, infiniteChapterReading: true, pageTransition: "none",
  }, version: 0 })), { backend });
  await page.route("**/api/graphql", async (route) => {
    if (new URL(route.request().url()).origin !== backend || !online) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const id = variables.id ?? variables.input?.chapterId ?? variables.input?.id;
    const record = records.get(id);
    let data: unknown;
    if (name === "GetChapter") {
      metadataFetches.push(id);
      if (id === 13 && !allowNext) return route.fulfill({ status: 503, json: { errors: [{ message: "Fixture next chapter is temporarily unavailable" }] } });
      if (!record) throw new Error(`Unknown continuity fixture chapter ${id}`);
      data = { chapter: { id, name: record.name, chapterNumber: record.number, mangaId: 42, sourceOrder: record.number, pageCount: record.heights.length, isRead: record.read, lastPageRead: record.page,
        manga: { title, chapters: { edges: [...records].map(([id, value]) => ({ node: { id, chapterNumber: value.number } })) } } } };
    } else if (name === "GetReadingChapters") {
      data = chapterConnection(42, [...records].map(([id, record]) => ({ id, chapterNumber: record.number, name: record.name, isRead: record.read })));
    } else if (name === "FetchChapterPages") {
      pageFetches.push(id);
      data = { fetchChapterPages: { pages: record!.heights.map((_height, index) => `${backend}/api/v1/manga/42/chapter/${record!.number}/page/${index}`) } };
    } else if (name === "UpdateChapterProgress") {
      writes.push(variables.input);
      Object.assign(record!, { read: variables.input.patch.isRead ?? record!.read, page: variables.input.patch.lastPageRead ?? record!.page });
      data = { updateChapter: { chapter: { id, isRead: record!.read, lastPageRead: record!.page } } };
    } else {
      const method = (mockSdk as unknown as Record<string, (variables: unknown) => Promise<unknown>>)[name];
      if (!method) throw new Error(`Unhandled continuity fixture operation ${name}`);
      data = await method(variables);
    }
    await route.fulfill({ json: { data } });
  });
  await page.route(`${backend}/api/v1/manga/42/chapter/*/page/*`, async (route) => {
    if (!online) return route.abort("connectionrefused");
    const match = /chapter\/(\d+)\/page\/(\d+)/.exec(route.request().url())!;
    const record = [...records].find(([, value]) => value.number === Number(match[1]))!;
    const index = Number(match[2]);
    if (options.delayed && record[0] === 12 && index === 1) await new Promise((resolve) => setTimeout(resolve, 850));
    await route.fulfill({ contentType: "image/svg+xml", body: picture(record[0], index, record[1].heights[index]) });
  });
  if (options.offline) {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await page.evaluate(async ({ backend, title, chapters }) => {
      const cache = await caches.open("yomikura-page-cache");
      const open = indexedDB.open("yomikura-offline", 4);
      open.onupgradeneeded = () => {
        const db = open.result;
        const cached = db.createObjectStore("chapters", { keyPath: "cacheKey" });
        cached.createIndex("serverBaseUrl", "serverBaseUrl"); cached.createIndex("id", "id"); cached.createIndex("mangaId", "mangaId");
        const history = db.createObjectStore("reading-history", { keyPath: "historyKey" });
        history.createIndex("serverBaseUrl", "serverBaseUrl"); history.createIndex("readAt", "readAt"); history.createIndex("mangaId", "mangaId");
        const jobs = db.createObjectStore("download-jobs", { keyPath: "jobKey" });
        jobs.createIndex("serverBaseUrl", "serverBaseUrl"); jobs.createIndex("updatedAt", "updatedAt");
      };
      const db = await new Promise<IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
      try {
        for (const chapter of chapters) {
          for (let i = 0; i < chapter.pages.length; i += 1) await cache.put(chapter.pages[i], new Response(chapter.images[i], { headers: { "content-type": "image/svg+xml" } }));
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("chapters", "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
            tx.objectStore("chapters").put({ cacheKey: `${backend}::${chapter.id}`, serverBaseUrl: backend, id: chapter.id, name: chapter.name, chapterNumber: chapter.number, mangaId: 42, mangaTitle: title, sourceOrder: chapter.number, pages: chapter.pages, cachedUrls: chapter.pages, pageCount: chapter.pages.length, cachedAt: Date.now(), totalSizeBytes: 1, lastPageRead: chapter.page, isRead: false });
          });
        }
      } finally { db.close(); }
    }, { backend, title, chapters: [...records].slice(0, 2).map(([id, value]) => ({ id, ...value,
      pages: value.heights.map((_height, index) => `${backend}/api/v1/manga/42/chapter/${value.number}/page/${index}`), images: value.heights.map((height, index) => picture(id, index, height)),
    })) });
  }
  await page.goto("/reader/12");
  await expect(page.getByText("First chapter", { exact: true })).toBeVisible({ timeout: 15_000 });
  return { records, writes, pageFetches, metadataFetches, allowNext: () => { allowNext = true; }, setOnline: (value: boolean) => { online = value; } };
}

test("cold webtoon restore and thumbnail jumps position real images with delayed, differing heights", async ({ page }, info) => {
  const data = await fixture(page, { saved: 2, delayed: true });
  await expect(fullPage(page, 12, 2)).toHaveCSS("opacity", "1");
  await expect.poll(() => fullPage(page, 12, 2).evaluate((image) => Math.round(image.getBoundingClientRect().top))).toBeGreaterThanOrEqual(70);
  await expect.poll(() => fullPage(page, 12, 2).evaluate((image) => Math.round(image.getBoundingClientRect().top))).toBeLessThan(180);
  await expect(page.getByText("3 of 4 pages", { exact: true })).toBeVisible();
  for (const index of [0, 2, 3]) {
    await page.getByRole("button", { name: `Go to page ${index + 1}`, exact: true }).click();
    await expect(fullPage(page, 12, index)).toHaveCSS("opacity", "1");
    await expect(fullPage(page, 12, index)).toBeInViewport({ ratio: 0.2 });
    await expect(page.getByText(`${index + 1} of 4 pages`, { exact: true })).toBeVisible();
  }
  await expect.poll(() => data.records.get(12)!.page).toBe(3);
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(fullPage(page, 12, 3)).toBeInViewport({ ratio: 0.2 });
  await expect(page.getByText("4 of 4 pages", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("webtoon-restored-and-resized.png") });
});

test("crossing an appended chapter updates controls, survives acknowledgement and reloads the active chapter", async ({ page }) => {
  const data = await fixture(page);
  await page.getByRole("button", { name: "Go to page 4", exact: true }).click();
  await expect(fullPage(page, 13, 0)).toHaveCSS("opacity", "1");
  await page.mouse.wheel(0, 1400);
  await fullPage(page, 13, 0).scrollIntoViewIfNeeded();
  await expect(page.getByText("Second chapter", { exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/reader\/13$/);
  await expect(page.getByText("1 of 2 pages", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prev", exact: true })).toHaveAttribute("href", "/reader/12");
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveAttribute("href", "/reader/14");
  await expect(page.getByRole("button", { name: /^Go to page \d+$/ })).toHaveCount(2);
  await expect.poll(() => data.writes.some((write) => write.id === 13)).toBe(true);
  expect(data.pageFetches.filter((id) => id === 12)).toHaveLength(1);
  await expect(page.locator('[data-reader-chapter="12"]')).toHaveCount(4);
  await expect(page.locator('[data-reader-chapter="13"]')).toHaveCount(2);
  await page.reload();
  await expect(page.getByText("Second chapter", { exact: true }).first()).toBeVisible();
  await expect(fullPage(page, 13, 0)).toHaveCSS("opacity", "1");
});

test("paged mode and thumbnails use the active appended chapter", async ({ page }) => {
  const data = await fixture(page);
  await page.getByRole("button", { name: "Go to page 4", exact: true }).click();
  await expect(fullPage(page, 13, 0)).toHaveCSS("opacity", "1");
  await page.mouse.wheel(0, 1400); await fullPage(page, 13, 0).scrollIntoViewIfNeeded();
  await expect(page).toHaveURL(/\/reader\/13$/);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "LTR", exact: true }).click();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  const first = page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true });
  await expect(first).toHaveAttribute("src", /chapter\/2\/page\/0/);
  const readingSurface = page.getByRole("region", { name: "Reading surface", exact: true });
  for (let step = 0; step < 8 && !await readingSurface.evaluate((element) => document.activeElement === element); step += 1) await page.keyboard.press("Tab");
  await expect(readingSurface).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const next = page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true });
  await expect(next).toHaveCSS("opacity", "1");
  await expect(next).toHaveAttribute("src", /chapter\/2\/page\/1/);
  await expect.poll(() => data.records.get(13)!.page).toBe(1);
});

test("an append failure remains retryable without collapsing the current chapter", async ({ page }) => {
  const data = await fixture(page, { single: true, failNext: true });
  await expect(page.getByRole("button", { name: "Retry next chapter", exact: true })).toBeVisible();
  expect(data.metadataFetches.filter((id) => id === 13)).toHaveLength(1);
  data.allowNext();
  await page.getByRole("button", { name: "Retry next chapter", exact: true }).click();
  await expect(page.locator('[data-reader-chapter="13"]')).toHaveCount(2);
  await expect(page.locator('[data-reader-chapter="12"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Retry next chapter", exact: true })).toHaveCount(0);
});

test("offline continuation resolves appended chapters from the device cache", async ({ page }) => {
  await fixture(page, { saved: 3, offline: true });
  await expect(fullPage(page, 12, 3)).toHaveCSS("opacity", "1", { timeout: 15_000 });
  await expect(fullPage(page, 13, 0)).toHaveCSS("opacity", "1");
  await page.mouse.wheel(0, 1400); await fullPage(page, 13, 0).scrollIntoViewIfNeeded();
  await expect(page).toHaveURL(/\/reader\/13$/);
  await expect(page.getByText("1 of 2 pages", { exact: true })).toBeVisible();
  await expect(fullPage(page, 13, 0)).toHaveAttribute("src", /^blob:/);
});

test("moving backward after completion stays read when synchronization becomes unavailable", async ({ page }) => {
  const data = await fixture(page, { saved: 3 });
  await expect(fullPage(page, 12, 3)).toHaveCSS("opacity", "1");
  await expect.poll(() => data.records.get(12)!.read).toBe(true);
  await expect(page.getByRole("status", { name: "Progress synchronization" })).toHaveCount(0);
  data.setOnline(false);
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(fullPage(page, 12, 1)).toBeInViewport({ ratio: 0.2 });
  await expect.poll(async () => page.evaluate(async () => {
    const open = indexedDB.open("yomikura-progress", 1);
    const db = await new Promise<IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
    try {
      return await new Promise((resolve) => { const read = db.transaction("heads", "readonly").objectStore("heads").getAll(); read.onsuccess = () => resolve(read.result.find((head) => head.chapter.chapterId === 12)?.patch); });
    } finally { db.close(); }
  })).toEqual({ isRead: true, lastPageRead: 1 });
});

test("auto-scroll crosses chapters and pauses on manual scrolling", async ({ page }) => {
  const data = await fixture(page, { single: true });
  await expect(fullPage(page, 12, 0)).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Scroll", exact: true }).click();
  await page.getByRole("slider").fill("10");
  await page.getByRole("button", { name: "Start Scroll", exact: true }).click();
  await expect(page).toHaveURL(/\/reader\/13$/);
  await expect(page.getByText("Second chapter", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause Scroll", exact: true })).toBeVisible();
  await expect.poll(() => data.writes.some((write) => write.id === 13)).toBe(true);
  await page.mouse.wheel(0, -120);
  await expect(page.getByRole("button", { name: "Start Scroll", exact: true })).toBeVisible();
});
