import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";
const first = "http://127.0.0.1:45677", second = "http://127.0.0.1:45678";
async function fixture(page: Page) {
  const chapters = [
    { id: 12, name: "Read chapter A", chapterNumber: 1, sourceOrder: 1, isRead: true, scanlator: "A", isBookmarked: false },
    { id: 13, name: "Duplicate chapter B", chapterNumber: 2, sourceOrder: 2, isRead: false, scanlator: "B", isBookmarked: false },
    { id: 14, name: "Selected chapter A", chapterNumber: 2, sourceOrder: 3, isRead: false, scanlator: "A", isBookmarked: true },
    { id: 15, name: "Special chapter A", chapterNumber: -1, sourceOrder: 4, isRead: false, scanlator: "A", isBookmarked: true },
  ].map((chapter) => ({ ...chapter, mangaId: 42, isDownloaded: false, lastPageRead: 0, pageCount: 2, uploadDate: "1000" }));
  const mangas = [42, 43, 44, 45].map((id, index) => ({ id, title: ["Device only", "Server only", "Both copies", "No downloads"][index], downloadCount: index === 1 || index === 2 ? 1 : 0, unreadCount: 4, lastReadChapter: null, thumbnailUrl: null, categories: { nodes: [] } }));
  await page.addInitScript(({ first, second }) => {
    if (localStorage.getItem("yomikura-settings")) return;
    localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: first, mockMode: false, connectionStatus: "connected", readerMode: "LTR", pageSpread: "SINGLE", autoDownloadCount: 0, autoDeleteReadChapters: false, infiniteChapterReading: false, pageTransition: "none", activeProfileId: "first", profiles: [{ id: "first", name: "First", url: first }, { id: "second", name: "Second", url: second }] } }));
  }, { first, second });
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON(); const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    const chapter = chapters.find((chapter) => chapter.id === (variables.id ?? variables.input?.id ?? variables.input?.chapterId));
    let data: unknown;
    if (name === "GetLibrary") data = { mangas: { nodes: mangas, pageInfo: { hasNextPage: false, endCursor: null } } };
    else if (name === "GetMangaDetails") { const original = await mockSdk.GetMangaDetails({ id: 42 }); data = { manga: { ...original.manga, title: "Device only", chapters: { edges: chapters.map((node) => ({ node })) } } }; }
    else if (name === "FetchChapters") data = { fetchChapters: { chapters } };
    else if (name === "GetReadingChapters") data = chapterConnection(42, chapters);
    else if (name === "GetChapter") data = { chapter: { ...chapter, manga: { title: "Device only", chapters: { edges: chapters.map((node) => ({ node })) } } } };
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: [0, 1].map((index) => `${new URL(route.request().url()).origin}/api/v1/manga/42/chapter/${chapter!.sourceOrder}/page/${index}`) } };
    else if (name === "UpdateChapterProgress") { Object.assign(chapter!, variables.input.patch); data = { updateChapter: { chapter } }; }
    else { const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name!]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  await page.route("**/api/v1/manga/*/chapter/*/page/*", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#31574e"/></svg>' }));
  await page.goto("/library"); await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await page.evaluate(async ({ first }) => {
    const open = indexedDB.open("yomikura-offline", 4);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("chapters", "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      for (const id of [42, 44]) tx.objectStore("chapters").put({ cacheKey: `${first}::${id + 100}`, serverBaseUrl: first, isDemo: false, id: id + 100, name: "Saved chapter", chapterNumber: 1, mangaId: id, mangaTitle: id === 42 ? "Device only" : "Both copies", sourceOrder: 1, pageCount: 1, pages: ["/0"], cachedUrls: [], totalSizeBytes: 0, cachedAt: Date.now() });
    }); } finally { db.close(); }
  }, { first });
  await page.reload(); await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  return { mangas, chapters };
}
test("library download views cover all four combinations with correct title counts", async ({ page }) => {
  const { mangas } = await fixture(page);
  await page.getByRole("button", { name: "On this device", exact: true }).click();
  await expect(page.getByText("2 titles ready to read", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Device only", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Server only", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "On server", exact: true }).click();
  await expect(page.getByText("2 titles ready to read", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Device only", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Downloaded", exact: true }).click();
  await expect(page.getByText("3 titles ready to read", { exact: true })).toBeVisible(); expect(mangas[0].downloadCount).toBe(0);
  await page.getByRole("combobox", { name: "Server profile", exact: true }).selectOption("second");
  await page.getByRole("button", { name: "On this device", exact: true }).click(); await expect(page.getByText("0 titles ready to read", { exact: true })).toBeVisible();
});
test("scanlator/unread policy is shared by Resume and next/previous and persists on reload", async ({ page }) => {
  const state = await fixture(page); await page.goto("/manga/42");
  await page.getByLabel("Filter chapter status").selectOption("unread"); await page.getByLabel("Filter scanlator").selectOption("A");
  await expect(page.getByRole("link", { name: /^Duplicate chapter B/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Resume", exact: true })).toHaveAttribute("href", "/reader/14");
  await page.reload(); await expect(page.getByLabel("Filter scanlator")).toHaveValue("A");
  await page.getByRole("link", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveAttribute("href", "/reader/15");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => state.chapters.find((chapter) => chapter.id === 14)!.isRead).toBe(true);
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveAttribute("href", "/reader/15");
  await page.getByRole("link", { name: "Next", exact: true }).click(); await expect(page.getByText("Special chapter A", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveCount(0);
});
test("descending policy uses the same equal-number tie-breaker in the list and reader", async ({ page }) => {
  await fixture(page); await page.goto("/manga/42");
  await page.getByRole("button", { name: "Ascending chapters", exact: true }).click();
  await expect(page.getByRole("link", { name: "Resume", exact: true })).toHaveAttribute("href", "/reader/14");
  await page.getByRole("link", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveAttribute("href", "/reader/13");
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveAttribute("href", "/reader/12");
});
