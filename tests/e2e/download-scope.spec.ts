import { chooseOption } from "./fixtures/themedSelect";
import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";

const first = "http://127.0.0.1:45677", second = "http://127.0.0.1:45678";
const owner = (url: string, demo = false) => JSON.stringify([demo ? "demo" : "live", url]);
const pageUrl = (url: string) => `${url}/api/v1/manga/42/chapter/1/page/0`;
async function fixture(page: Page, failQueue = false) {
  await page.addInitScript(({ first, second }) => {
    if (localStorage.getItem("yomikura-settings")) return;
    localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: first, mockMode: false, connectionStatus: "connected", readerMode: "LTR", pageSpread: "SINGLE", autoDeleteReadChapters: false, autoDownloadCount: 0, activeProfileId: "first", profiles: [{ id: "first", name: "First fixture", url: first }, { id: "second", name: "Second fixture", url: second }] } }));
  }, { first, second });
  await page.route("**/api/graphql", async (route) => {
    const backend = new URL(route.request().url()).origin;
    if (![first, second].includes(backend)) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON(); const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const title = backend === first ? "First cached title" : "Second cached title"; let data: unknown;
    if (name === "GetDownloadStatus" && failQueue) return route.fulfill({ status: 503, json: { errors: [{ message: "Fixture server queue unavailable" }] } });
    if (name === "GetChapter") data = { chapter: { id: 12, name: "Shared chapter ID", chapterNumber: 1, mangaId: 42, sourceOrder: 1, pageCount: 1, isRead: true, lastPageRead: 0, manga: { title, chapters: { edges: [{ node: { id: 12, chapterNumber: 1 } }] } } } };
    else if (name === "GetReadingChapters") data = chapterConnection(42, [{ id: 12, chapterNumber: 1, name: "Shared chapter ID", isRead: true }]);
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: [pageUrl(backend)] } };
    else if (name === "UpdateChapterProgress") data = { updateChapter: { chapter: { id: 12, isRead: true, lastPageRead: variables.input.patch.lastPageRead ?? 0 } } };
    else { const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  await page.route("**/api/v1/manga/42/chapter/1/page/0", (route) => route.abort("connectionrefused"));
  await page.goto("/settings/offline"); await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.evaluate(async ({ first, second }) => {
    const open = indexedDB.open("yomikura-offline", 4);
    open.onupgradeneeded = () => {
      const db = open.result;
      const chapters = db.createObjectStore("chapters", { keyPath: "cacheKey" }); chapters.createIndex("serverBaseUrl", "serverBaseUrl"); chapters.createIndex("id", "id"); chapters.createIndex("mangaId", "mangaId");
      const history = db.createObjectStore("reading-history", { keyPath: "historyKey" }); history.createIndex("serverBaseUrl", "serverBaseUrl"); history.createIndex("readAt", "readAt"); history.createIndex("mangaId", "mangaId");
      const jobs = db.createObjectStore("download-jobs", { keyPath: "jobKey" }); jobs.createIndex("serverBaseUrl", "serverBaseUrl"); jobs.createIndex("updatedAt", "updatedAt");
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const cache = await caches.open("yomikura-page-cache");
    try {
      for (const backend of [first, second]) {
        const key = JSON.stringify(["live", backend]); const original = `${backend}/api/v1/manga/42/chapter/1/page/0`;
        const storage = new URL(original); storage.searchParams.set("__yomi_cache_attempt", "complete"); storage.searchParams.set("__yomi_cache_owner", key);
        const orphan = new URL(original); orphan.searchParams.set("__yomi_cache_attempt", "interrupted"); orphan.searchParams.set("__yomi_cache_owner", key);
        const label = backend === first ? "FIRST" : "SECOND";
        const image = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#31574e"/><text x="50" y="100" fill="white">${label}</text></svg>`;
        await cache.put(storage.toString(), new Response(image, { headers: { "content-type": "image/svg+xml" } })); await cache.put(orphan.toString(), new Response("orphan"));
        await new Promise<void>((resolve, reject) => { const tx = db.transaction("chapters", "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.objectStore("chapters").put({ cacheKey: `${backend}::12`, serverBaseUrl: backend, isDemo: false, id: 12, name: "Shared chapter ID", chapterNumber: 1, mangaId: 42, mangaTitle: backend === first ? "First cached title" : "Second cached title", sourceOrder: 1, pageCount: 1, pages: [original], networkUrls: [original], cachedUrls: [storage.toString()], cachedAt: Date.now(), totalSizeBytes: image.length, isRead: true, lastPageRead: 0 }); });
      }
    } finally { db.close(); }
  }, { first, second });
  await page.goto("/downloads");
}
async function cacheState(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open("yomikura-offline", 4); const db = await new Promise<IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
    try {
      const chapters = await new Promise<any[]>((resolve) => { const request = db.transaction("chapters", "readonly").objectStore("chapters").getAll(); request.onsuccess = () => resolve(request.result); });
      const keys = (await (await caches.open("yomikura-page-cache")).keys()).map((request) => request.url);
      return { chapters, keys };
    } finally { db.close(); }
  });
}

test("profile switching projects only the owning saved chapters and resolves its cache bytes", async ({ page }) => {
  await fixture(page); await expect(page.getByRole("link", { name: "First cached title", exact: true })).toBeVisible();
  await chooseOption(page.getByRole("combobox", { name: "Server profile", exact: true }), "second");
  await expect(page.getByRole("link", { name: "Second cached title", exact: true })).toBeVisible(); await expect(page.getByText("First cached title", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Read", exact: true }).click();
  const image = page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true }); await expect(image).toHaveAttribute("src", /^blob:/);
  expect(await image.evaluate(async (element: HTMLImageElement) => (await fetch(element.src)).text())).toContain("SECOND");
});

test("deleting one profile's overlapping chapter retains the other copy and page bytes", async ({ page }) => {
  await fixture(page); await chooseOption(page.getByRole("combobox", { name: "Server profile", exact: true }), "second");
  await expect(page.getByRole("link", { name: "Second cached title", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove offline download Shared chapter ID", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Remove saved chapter?", exact: true }).getByRole("button", { name: "Remove download", exact: true }).click();
  await expect(page.getByText("Second cached title", { exact: true })).toHaveCount(0);
  const state = await cacheState(page); expect(state.chapters.map((chapter) => chapter.serverBaseUrl)).toEqual([first]);
  expect(state.keys.some((key) => new URL(key).searchParams.get("__yomi_cache_owner") === owner(first))).toBe(true);
  await chooseOption(page.getByRole("combobox", { name: "Server profile", exact: true }), "first"); await expect(page.getByRole("link", { name: "First cached title", exact: true })).toBeVisible();
});

test("clearing a selected server removes its incomplete attempts and preserves other profiles", async ({ page }) => {
  await fixture(page); await chooseOption(page.getByRole("combobox", { name: "Server profile", exact: true }), "second"); await page.goto("/settings/offline");
  await expect(page.getByText("Second cached title", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear This Server's Offline Cache", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Clear this server's saved chapters?", exact: true }); await expect(dialog).toContainText("Other profiles");
  await dialog.getByRole("button", { name: "Clear saved chapters", exact: true }).click(); await expect(page.getByText("Second cached title", { exact: true })).toHaveCount(0);
  const state = await cacheState(page); expect(state.chapters.map((chapter) => chapter.serverBaseUrl)).toEqual([first]);
  expect(state.keys.some((key) => new URL(key).searchParams.get("__yomi_cache_owner") === owner(second))).toBe(false);
  expect(state.keys.filter((key) => new URL(key).searchParams.get("__yomi_cache_owner") === owner(first))).toHaveLength(2);
});

test("a failing server queue leaves local saved chapters accessible", async ({ page }) => {
  await fixture(page, true); await expect(page.getByRole("link", { name: "First cached title", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Server downloads could not load", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Read", exact: true })).toBeVisible();
});

test("leaving demo mode never presents its cached queue as a pending live response", async ({ page }) => {
  await page.addInitScript(({ first }) => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: first, mockMode: true, connectionStatus: "connected", autoDeleteReadChapters: false, autoDownloadCount: 0 } })), { first });
  await fixture(page);
  await expect(page.getByText("Server queue is clear", { exact: true })).toBeVisible();
  let release!: () => void; let requested = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/graphql", async (route) => {
    const { query, operationName } = route.request().postDataJSON();
    if ((operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1]) !== "GetDownloadStatus") return route.fallback();
    requested = true; await held;
    await route.fulfill({ json: { data: { downloadStatus: { state: "STOPPED", queue: [{ position: 1, progress: 0, state: "PENDING", tries: 0, chapter: { id: "12", name: "Live queue chapter", chapterNumber: 1 }, manga: { id: "42", title: "Live queue title", thumbnailUrl: null } }] } } } });
  });
  try {
    await page.getByRole("button", { name: "Connect your library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Downloads", exact: true }).click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByText("Loading the server queue…", { exact: true })).toBeVisible();
    await expect(page.getByText("Server queue is clear", { exact: true })).toHaveCount(0);
    release(); await expect(page.getByText("Live queue title", { exact: true })).toBeVisible();
  } finally { release(); }
});
