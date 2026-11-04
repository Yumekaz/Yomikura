import { expect, test } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";

const backend = "http://127.0.0.1:45672";
const marker = "a66b358b-fd45-4c21-ad76-232a7e0d7c79";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#31574e"/></svg>';

test("a cold unavailable-library reload retains unsaved books, collections and chapter rows while only saved pages open", async ({ page }) => {
  test.setTimeout(60_000);
  let online = true;
  const chapters = [
    { id: 12, mangaId: 42, name: "Chapter 1: Saved locally", chapterNumber: 1, sourceOrder: 1, pageCount: 2, isRead: false, lastPageRead: 0, isBookmarked: false, isDownloaded: false, uploadDate: "1780272000000", scanlator: "Fixture" },
    { id: 13, mangaId: 42, name: "Chapter 2: Not downloaded", chapterNumber: 2, sourceOrder: 2, pageCount: 2, isRead: false, lastPageRead: 0, isBookmarked: false, isDownloaded: false, uploadDate: "1780272000001", scanlator: "Fixture" },
  ];
  const books = [
    { id: 42, title: "Downloaded shelf book", thumbnailUrl: `${backend}/cover/42`, unreadCount: 2, downloadCount: 0, sourceId: "fixture-source", status: "ONGOING", chapters: { totalCount: 2 }, lastReadChapter: null, categories: { nodes: [{ id: 6 }] } },
    { id: 43, title: "Unsaved shelf book", thumbnailUrl: `${backend}/cover/43`, unreadCount: 1, downloadCount: 0, sourceId: "fixture-source", status: "ONGOING", chapters: { totalCount: 1 }, lastReadChapter: null, categories: { nodes: [{ id: 7 }] } },
  ];
  await page.addInitScript(({ backend }) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "disconnected", themeMode: "light", colorPalette: "moonstone", readerMode: "LTR", pageSpread: "SINGLE", pageTransition: "none", infiniteChapterReading: false, autoDownloadCount: 0, autoDeleteReadChapters: false, backupIntervalHours: 0 } }));
  }, { backend });
  await page.route(`${backend}/**`, async (route) => {
    if (!online) return route.abort("connectionrefused");
    if (!route.request().url().endsWith("/api/graphql")) return route.fulfill({ contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" }, body: svg });
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    let data: unknown;
    if (name === "YomikuraLibraryIdentity") data = { metas: { nodes: [{ key: "yomikura.library.identity.v1", value: marker }] } };
    else if (name === "GetLibrary") data = { mangas: { nodes: books, pageInfo: { hasNextPage: false, endCursor: null } } };
    else if (name === "GetCategories") data = { categories: { nodes: [{ id: 6, name: "Wandering stories", order: 1 }, { id: 7, name: "To read", order: 2 }] } };
    else if (name === "GetHistory") data = { chapters: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
    else if (name === "GetMangaDetails") data = { manga: { ...books[0], initialized: true, inLibrary: true, author: "Fixture", artist: "Fixture", genre: [], description: "Metadata remains available independently of downloaded pages.", source: { name: "Fixture source" }, chapters: { nodes: chapters } } };
    else if (name === "FetchChapters") data = { fetchChapters: { chapters } };
    else if (name === "GetChapter") data = { chapter: { ...chapters.find((chapter) => chapter.id === variables.id), manga: { title: books[0].title } } };
    else if (name === "GetReadingChapters") data = chapterConnection(42, chapters);
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: [0, 1].map((index) => `${backend}/saved-pages/${variables.input.chapterId}/${index}`) } };
    else { const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    return route.fulfill({ json: { data }, headers: { "access-control-allow-origin": "*" } });
  });

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unsaved shelf book", exact: true })).toBeVisible();
  // Poll persisted metadata, not an in-memory React Query entry.
  await expect.poll(() => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((db) => db.name === "yomikura-library-metadata-v1")) return false;
    const open = indexedDB.open("yomikura-library-metadata-v1", 1);
    const db = await new Promise<IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
    try {
      const names = await new Promise<string[]>((resolve) => { const request = db.transaction("snapshots").objectStore("snapshots").getAll(); request.onsuccess = () => resolve(request.result.map((item) => JSON.parse(item.key)[1])); });
      const covers = await new Promise<number>((resolve) => { const request = db.transaction("covers").objectStore("covers").count(); request.onsuccess = () => resolve(request.result); });
      return names.includes("library") && names.includes("categories") && covers >= 2;
    } finally { db.close(); }
  })).toBe(true);
  await page.getByRole("link", { name: "Downloaded shelf book", exact: true }).click();
  await expect(page.locator('a.yomi-chapter-content[href="/reader/13"]')).toContainText("Chapter 2: Not downloaded");

  // A verified local page fixture supplements the metadata learned above.
  // No byte record exists for chapter 13 or the second library book.
  await page.evaluate(async ({ backend, marker, svg }) => {
    const urls = [0, 1].map((index) => `${backend}/saved-pages/12/${index}`);
    const pages = await caches.open("yomikura-page-cache");
    for (const url of urls) await pages.put(url, new Response(svg, { headers: { "content-type": "image/svg+xml" } }));
    const open = indexedDB.open("yomikura-offline", 4);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("chapters", "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.objectStore("chapters").put({ cacheKey: `${backend}::12::library:${marker}`, libraryId: marker, serverBaseUrl: backend, isDemo: false, id: 12, mangaId: 42, mangaTitle: "Downloaded shelf book", name: "Chapter 1: Saved locally", chapterNumber: 1, sourceOrder: 1, pageCount: 2, pages: urls, cachedUrls: urls, totalSizeBytes: svg.length * 2, cachedAt: Date.now(), lastPageRead: 0, isRead: false }); }); } finally { db.close(); }
  }, { backend, marker, svg });

  online = false;
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  for (const title of ["Downloaded shelf book", "Unsaved shelf book"]) await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue offline", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set up my library", exact: true })).toHaveCount(0);
  const unsavedCover = page.getByRole("link", { name: "Unsaved shelf book", exact: true }).locator("img");
  await expect(unsavedCover).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => unsavedCover.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);
  await page.getByRole("combobox", { name: "Collection", exact: true }).click();
  await page.getByRole("option", { name: "To read", exact: true }).click();
  await expect(page.getByRole("link", { name: "Unsaved shelf book", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Downloaded shelf book", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Collection", exact: true }).click();
  await page.getByRole("option", { name: "Wandering stories", exact: true }).click();
  await page.getByRole("link", { name: "Downloaded shelf book", exact: true }).click();
  await expect(page.locator('a.yomi-chapter-content[href="/reader/12"]')).toContainText("Chapter 1: Saved locally");
  const unsaved = page.locator('a.yomi-chapter-content[href="/reader/13"]');
  await expect(unsaved).toContainText("Chapter 2: Not downloaded");
  await unsaved.click();
  const error = page.getByRole("alert");
  await expect(error).toContainText("Your library couldn’t be reached", { timeout: 15000 });
  await expect(error.getByRole("link", { name: "Read saved chapters", exact: true })).toHaveAttribute("href", "/downloads");
  await expect(error).not.toContainText("127.0.0.1");
  await page.goto("/manga/42");
  await page.locator('a.yomi-chapter-content[href="/reader/12"]').click();
  const image = page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true });
  await expect(image).toHaveAttribute("src", /^blob:/, { timeout: 15000 });
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(320);
  await expect(page.getByText("1 of 2 pages", { exact: false })).toBeVisible();
});
