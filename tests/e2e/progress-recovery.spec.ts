import { chooseOption } from "./fixtures/themedSelect";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";

const first = "http://127.0.0.1:45679";
const second = "http://127.0.0.1:45678";
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#264653"/></svg>';
const fullPage = (page: Page, number: number) => page.locator('[id^="reader-page-"]').getByRole("img", { name: `Page ${number}`, exact: true });
type ServerState = { online: boolean; page: number; read: boolean; title: string; pause?: Promise<void> };
const states = () => ({ [first]: { online: false, page: 0, read: false, title: "Progress A" }, [second]: { online: true, page: 0, read: false, title: "Progress B" } }) as Record<string, ServerState>;

async function configure(context: BrowserContext, servers: Record<string, ServerState>, failStorage = false) {
  const writes: { server: string; patch: { lastPageRead: number; isRead: boolean } }[] = [];
  await context.addInitScript(({ first, second, failStorage }) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ state: {
      serverBaseUrl: first, mockMode: false, connectionStatus: "disconnected", readerMode: "LTR", pageSpread: "SINGLE", pageTransition: "none", autoDownloadCount: 0, autoDeleteReadChapters: false, infiniteChapterReading: false,
      profiles: [{ id: "a", name: "Server A", url: first }, { id: "b", name: "Server B", url: second }], activeProfileId: "a",
    }, version: 0 }));
    if (failStorage) {
      const original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (name, version) => {
        if (name === "yomikura-progress") throw new DOMException("Fixture full storage", "QuotaExceededError");
        return original(name, version);
      };
    }
  }, { first, second, failStorage });
  await context.route("**/api/graphql", async (route) => {
    const server = new URL(route.request().url()).origin;
    const state = servers[server];
    if (!state?.online) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    const chapter = () => ({ id: 12, name: "Progress chapter", chapterNumber: 1, sourceOrder: 1, mangaId: 42, pageCount: 4, lastPageRead: state.page, isRead: state.read, isBookmarked: false, isDownloaded: false, uploadDate: String(Date.now()), manga: { title: state.title, chapters: { edges: [{ node: { id: 12, chapterNumber: 1 } }] } } });
    if (name === "GetChapter") data = { chapter: chapter() };
    else if (name === "GetReadingChapters") data = chapterConnection(42, [chapter()]);
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: Array.from({ length: 4 }, (_, i) => `${server}/api/v1/manga/42/chapter/1/page/${i}`) } };
    else if (name === "UpdateChapterProgress") {
      const patch = variables.input.patch;
      writes.push({ server, patch });
      state.page = patch.lastPageRead ?? state.page;
      state.read = patch.isRead ?? state.read;
      if (state.pause) { const pending = state.pause; state.pause = undefined; await pending; }
      data = { updateChapter: { chapter: { id: 12, lastPageRead: state.page, isRead: state.read } } };
    } else if (name === "FetchChapters") data = { fetchChapters: { chapters: [chapter()] } };
    else if (name === "GetMangaDetails") {
      const result = await mockSdk.GetMangaDetails({ id: 42 });
      data = { manga: { ...result.manga, id: 42, title: state.title, thumbnailUrl: null, chapters: { edges: [{ node: chapter() }] } } };
    } else {
      const method = (mockSdk as unknown as Record<string, (variables: unknown) => Promise<unknown>>)[name];
      if (!method) throw new Error(`Unhandled progress fixture operation: ${name}`);
      data = await method(variables);
    }
    await route.fulfill({ json: { data } });
  });
  for (const backend of [first, second]) await context.route(`${backend}/api/v1/manga/*/chapter/*/page/*`, (route) => servers[backend].online ? route.fulfill({ contentType: "image/svg+xml", body: image }) : route.abort("connectionrefused"));
  return writes;
}

async function seedCache(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.evaluate(async ({ first, second, image }) => {
    const request = indexedDB.open("yomikura-offline", 4);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const cache = await caches.open("yomikura-page-cache");
      for (const [server, title] of [[first, "Progress A"], [second, "Progress B"]]) {
        const pages = Array.from({ length: 4 }, (_, i) => `${server}/api/v1/manga/42/chapter/1/page/${i}`);
        for (const url of pages) await cache.put(url, new Response(image, { headers: { "content-type": "image/svg+xml" } }));
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("chapters", "readwrite");
          tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
          tx.objectStore("chapters").put({ cacheKey: `${server}::12`, serverBaseUrl: server, id: 12, name: "Progress chapter", chapterNumber: 1, sourceOrder: 1, mangaId: 42, mangaTitle: title, pageCount: 4, pages, cachedUrls: pages, cachedAt: Date.now(), totalSizeBytes: image.length * 4, lastPageRead: 0, isRead: false });
        });
      }
    } finally { db.close(); }
  }, { first, second, image });
}

async function storedProgress(page: Page, server = first) {
  return page.evaluate(async (server) => {
    const request = indexedDB.open("yomikura-progress", 1);
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    try {
      return await new Promise<{ patch: { lastPageRead: number; isRead: boolean }; epoch: number } | null>((resolve) => {
        const read = db.transaction("heads", "readonly").objectStore("heads").getAll();
        read.onsuccess = () => resolve(read.result.find((head) => head.backend.serverBaseUrl === server && head.chapter.chapterId === 12) ?? null);
      });
    } finally { db.close(); }
  }, server);
}

test("offline progress survives Chrome restart and remains isolated through profile switching", async ({ baseURL }, info) => {
  test.setTimeout(75_000);
  await mkdir(join(process.cwd(), ".cache"), { recursive: true });
  const profile = await mkdtemp(join(process.cwd(), ".cache", "pr-"));
  const options = { ...info.project.use.launchOptions, headless: true, baseURL, serviceWorkers: "block" as const };
  const servers = states();
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    const originalWrites = await configure(context, servers);
    let page = await context.newPage();
    await seedCache(page);
    await page.goto("/reader/12");
    await expect(fullPage(page, 1)).toHaveCSS("opacity", "1", { timeout: 15_000 });
    await page.keyboard.press("ArrowRight");
    await expect(fullPage(page, 2)).toHaveCSS("opacity", "1");
    await expect.poll(async () => (await storedProgress(page))?.patch.lastPageRead).toBe(1);
    expect(originalWrites).toEqual([]);
    await context.close();

    context = await chromium.launchPersistentContext(profile, options);
    const writes = await configure(context, servers);
    page = await context.newPage();
    await page.goto("/reader/12");
    await expect(fullPage(page, 2)).toHaveCSS("opacity", "1", { timeout: 15_000 });
    await page.goto("/settings");
    await chooseOption(page.getByLabel("Server profile"), "b");
    await page.goto("/reader/12");
    await expect(page.getByText("Progress B", { exact: true })).toBeVisible();
    await expect(fullPage(page, 1)).toHaveCSS("opacity", "1");
    await page.keyboard.press("ArrowRight");
    await expect(fullPage(page, 2)).toHaveCSS("opacity", "1");
    await page.keyboard.press("ArrowRight");
    await expect(fullPage(page, 3)).toHaveCSS("opacity", "1");
    await expect.poll(() => servers[second].page).toBe(2);
    expect(servers[first].page).toBe(0);
    servers[first].online = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(1000);
    expect(writes.filter((write) => write.server === first)).toEqual([]);
    await page.goto("/settings");
    await chooseOption(page.getByLabel("Server profile"), "a");
    await expect.poll(() => servers[first].page).toBe(1);
    expect(servers[second].page).toBe(2);
    await page.goto("/reader/12");
    await expect(fullPage(page, 2)).toHaveCSS("opacity", "1");
    await page.screenshot({ path: info.outputPath("replayed-progress.png") });
  } finally { await context.close(); }
});

test("a reset from another tab survives a delayed completion acknowledgement", async ({ context, page }) => {
  const servers = states(); servers[first].online = true;
  const writes = await configure(context, servers);
  await seedCache(page);
  await page.goto("/reader/12");
  await expect(fullPage(page, 1)).toHaveCSS("opacity", "1");
  await expect.poll(() => writes.length).toBeGreaterThan(0);
  let release!: () => void;
  servers[first].pause = new Promise<void>((resolve) => { release = resolve; });
  await page.keyboard.press("End");
  // Use normal page navigation when End is not a configured reader shortcut.
  for (let i = 0; i < 3; i += 1) { await page.keyboard.press("ArrowRight"); }
  await expect(fullPage(page, 4)).toHaveCSS("opacity", "1");
  await expect.poll(() => writes.some((write) => write.patch.isRead)).toBe(true);
  const other = await context.newPage();
  await other.goto("/manga/42");
  await other.getByRole("checkbox", { name: "Select Progress chapter", exact: true }).check();
  await other.getByRole("button", { name: "Mark unread", exact: true }).click();
  await expect.poll(async () => (await storedProgress(other))?.epoch).toBe(1);
  expect((await storedProgress(other))?.patch).toEqual({ isRead: false, lastPageRead: 0 });
  release();
  await expect.poll(() => servers[first].read).toBe(false);
  await expect.poll(() => servers[first].page).toBe(0);
  await page.bringToFront();
  await page.keyboard.press("ArrowLeft");
  await expect(fullPage(page, 3)).toHaveCSS("opacity", "1");
  await expect(page.getByText(/Progress was reset in another view/)).toBeVisible();
  expect(servers[first].read).toBe(false);
});

for (const useSaved of [true, false]) test(`competing server progress requires an explicit choice (use saved=${useSaved})`, async ({ context, page }) => {
  const servers = states();
  const writes = await configure(context, servers);
  await seedCache(page);
  await page.goto("/reader/12");
  await expect(fullPage(page, 1)).toHaveCSS("opacity", "1", { timeout: 15_000 });
  await page.keyboard.press("ArrowRight");
  await expect(fullPage(page, 2)).toHaveCSS("opacity", "1");
  await expect.poll(async () => (await storedProgress(page))?.patch.lastPageRead).toBe(1);
  servers[first].page = 2; servers[first].online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status", { name: "Progress synchronization" })).toContainText("changed on the server");
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: useSaved ? "Use saved progress" : "Keep server progress", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: useSaved ? "Use saved progress" : "Keep server progress", exact: true }).click();
  await expect.poll(() => servers[first].page).toBe(useSaved ? 1 : 2);
  await expect(page.getByRole("status", { name: "Progress synchronization" })).toHaveCount(0);
});

test("failed local storage cannot report saved progress or send a server mutation", async ({ context, page }) => {
  const servers = states(); servers[first].online = true;
  const writes = await configure(context, servers, true);
  await seedCache(page);
  await page.goto("/reader/12");
  await expect(fullPage(page, 1)).toHaveCSS("opacity", "1");
  await expect(page.getByRole("alert")).toContainText("could not be saved on this device");
  expect(writes).toEqual([]);
});

test("mark-unread updates the filter while its server write is still pending", async ({ context, page }) => {
  const servers = states(); servers[first].online = true; servers[first].read = true; servers[first].page = 3;
  await configure(context, servers);
  await seedCache(page);
  await page.goto("/manga/42");
  await expect(page.getByRole("link", { name: /^Progress chapter/ })).toBeVisible();
  servers[first].online = false;
  await page.getByRole("checkbox", { name: "Select Progress chapter", exact: true }).check();
  await page.getByRole("button", { name: "Mark unread", exact: true }).click();
  await chooseOption(page.getByLabel("Filter chapter status"), "unread");
  await expect(page.getByRole("link", { name: /^Progress chapter/ })).toBeVisible();
  await expect.poll(async () => (await storedProgress(page))?.patch.isRead).toBe(false);
  expect(servers[first].read).toBe(true);
  servers[first].online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => servers[first].read).toBe(false);
});
