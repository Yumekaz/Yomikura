import { expect, test } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";

test("bookmark and mark-unread refresh the source chapter list and saved copy", async ({ page }) => {
  const backend = "http://127.0.0.1:45679";
  const chapter = { id: 20002, name: "Chapter action fixture", chapterNumber: 1, isRead: true, isBookmarked: false, isDownloaded: false, lastPageRead: 2, uploadDate: String(Date.now()), scanlator: null };
  await page.addInitScript(({ backend }) => localStorage.setItem("yomikura-settings", JSON.stringify({ state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected" }, version: 0 })), { backend });
  await page.route("https://images.unsplash.com/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48"/>' }));
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "GetChapter") data = { chapter: { ...chapter, mangaId: 10002, sourceOrder: 1, pageCount: 3, manga: { title: "[Demo] Pepper & Carrot", chapters: { edges: [{ node: { id: chapter.id, chapterNumber: 1 } }] } } } };
    else if (name === "GetMangaDetails") {
      const result = await mockSdk.GetMangaDetails({ id: 10002 });
      data = { manga: { ...result.manga, chapters: { edges: [{ node: { ...chapter, pageCount: 3 } }] } } };
    } else if (name === "FetchChapters") data = { fetchChapters: { chapters: [{ ...chapter }] } };
    else if (name === "UpdateChapterProgress") {
      Object.assign(chapter, variables.input.patch);
      data = { updateChapter: { chapter: { ...chapter } } };
    } else {
      const method = (mockSdk as unknown as Record<string, (variables: unknown) => Promise<unknown>>)[name];
      if (!method) throw new Error(`Unhandled chapter fixture operation: ${name}`);
      data = await method(variables);
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto("/manga/10002");
  await expect(page.getByRole("link", { name: /^Chapter action fixture/ })).toBeVisible();
  // The app has initialized the real offline database. Seed only this fixture's saved copy.
  await page.evaluate(async ({ backend }) => {
    const request = indexedDB.open("yomikura-offline", 4);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("chapters", "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.objectStore("chapters").put({ cacheKey: `${backend}::20002`, serverBaseUrl: backend, id: 20002, name: "Chapter action fixture", chapterNumber: 1, mangaId: 10002, mangaTitle: "[Demo] Pepper & Carrot", sourceOrder: 1, pageCount: 3, pages: ["/0", "/1", "/2"], cachedUrls: [], totalSizeBytes: 0, cachedAt: Date.now(), isRead: true, lastPageRead: 2 });
      });
    } finally { db.close(); }
  }, { backend });

  await page.getByRole("checkbox", { name: "Select Chapter action fixture", exact: true }).check();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await expect.poll(() => chapter.isBookmarked).toBe(true);
  await page.getByLabel("Filter chapter status").selectOption("bookmarked");
  await expect(page.getByRole("link", { name: /^Chapter action fixture/ })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Chapter action fixture", exact: true }).check();
  await page.getByRole("button", { name: "Mark unread", exact: true }).click();
  await expect.poll(() => chapter.isRead).toBe(false);
  await page.getByLabel("Filter chapter status").selectOption("unread");
  await expect(page.getByRole("link", { name: /^Chapter action fixture/ })).toBeVisible();
  expect(chapter.lastPageRead).toBe(0);
  const cached = await page.evaluate(async ({ backend }) => {
    const open = indexedDB.open("yomikura-offline", 4);
    const db = await new Promise<IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
    try {
      return await new Promise<{ isRead: boolean; lastPageRead: number }>((resolve, reject) => {
        const request = db.transaction("chapters", "readonly").objectStore("chapters").get(`${backend}::20002`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, { backend });
  expect(cached.isRead).toBe(false);
  expect(cached.lastPageRead).toBe(0);
});
