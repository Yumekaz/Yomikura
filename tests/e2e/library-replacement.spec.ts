import { expect, test } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";
const server = "http://127.0.0.1:45679", first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
test("replacement library quarantines offline progress and retains earlier pages and notes for device-only recovery", async ({ page }) => {
  let marker = first, online = true;
  const writes: unknown[] = []; let pageRequests = 0;
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#31574e"/></svg>';
  await page.addInitScript(({ server }) => { if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: server, mockMode: false, connectionStatus: "disconnected", readerMode: "LTR", pageSpread: "SINGLE", pageTransition: "none", backupIntervalHours: 0, autoDownloadCount: 0, autoDeleteReadChapters: false, infiniteChapterReading: false } })); }, { server });
  await page.route(`${server}/api/graphql`, async (route) => {
    if (!online) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    const chapter = { id: 12, name: "Shared chapter", chapterNumber: 1, mangaId: 42, sourceOrder: 1, pageCount: 2, isRead: false, lastPageRead: 0, isBookmarked: false, manga: { title: "Shared title" } };
    let data;
    if (name === "YomikuraLibraryIdentity") data = { metas: { nodes: [{ key: "yomikura.library.identity.v1", value: marker }] } };
    else if (name === "GetChapter") data = { chapter };
    else if (name === "GetReadingChapters") data = chapterConnection(42, [chapter]);
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: [`${server}/page/0`, `${server}/page/1`] } };
    else if (name === "UpdateChapterProgress") { writes.push(variables); data = { updateChapter: { chapter: { ...chapter, ...variables.input.patch } } }; }
    else if (name === "GetMangaDetails") { const fixture = await mockSdk.GetMangaDetails({ id: 42 }); data = { manga: { ...fixture.manga, id: 42, title: "Shared title", chapters: { edges: [{ node: chapter }] } } }; }
    else { const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    return route.fulfill({ json: { data } });
  });
  await page.route(`${server}/page/**`, (route) => { pageRequests += 1; return route.abort(); });
  await page.goto("/settings/offline");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-library-sessions-v1") ?? "{}")["http://127.0.0.1:45679"]?.marker)).toBe(first);
  await page.evaluate(async ({ server, first, image }) => {
    const open = (name: string, version: number) => new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name, version); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); request.onupgradeneeded = () => { if (name === "yomikura-book-notes") request.result.createObjectStore("notes", { keyPath: "key" }); }; });
    const pages = [`${server}/page/0`, `${server}/page/1`], cache = await caches.open("yomikura-page-cache");
    const tiles = [`${server}/saved/tile-0`, `${server}/saved/tile-1`];
    for (const url of [...pages, ...tiles]) await cache.put(url, new Response(image, { headers: { "content-type": "image/svg+xml" } }));
    const db = await open("yomikura-offline", 4);
    await new Promise<void>((resolve, reject) => { const tx = db.transaction("chapters", "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.objectStore("chapters").put({ libraryId: first, cacheKey: `${server}::12::library:${first}`, serverBaseUrl: server, id: 12, name: "Shared chapter", chapterNumber: 1, mangaId: 42, mangaTitle: "Shared title", sourceOrder: 1, pageCount: 2, pages, cachedUrls: pages, pageTiles: [{ index: 0, width: 320, height: 960, tiles: tiles.map((url) => ({ url, height: 480 })) }], totalSizeBytes: image.length * 4, cachedAt: Date.now(), isRead: false, lastPageRead: 0 }); }); db.close();
    const notes = await open("yomikura-book-notes", 1);
    await new Promise<void>((resolve, reject) => { const tx = notes.transaction("notes", "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.objectStore("notes").put({ key: JSON.stringify([JSON.stringify(["live", server]), 42, "Shared title", first]), value: "Earlier library thought", base: null, pending: true, revision: "fixture" }); }); notes.close();
  }, { server, first, image });
  online = false;
  await page.goto("/reader/12");
  await expect(page.getByText("1 of 2 pages", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(page.getByText("2 of 2 pages", { exact: false })).toBeVisible();
  marker = second; online = true;
  await page.goto("/settings/offline");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-library-sessions-v1") ?? "{}")["http://127.0.0.1:45679"]?.marker)).toBe(second);
  await expect(page.getByRole("status", { name: "Progress synchronization" })).toContainText("earlier or unverified library");
  await expect(page.getByRole("status", { name: "Progress synchronization" })).toBeInViewport();
  expect(writes).toHaveLength(0);
  await page.getByText("Earlier saved libraries", { exact: true }).click();
  await expect(page.getByText("Earlier library thought", { exact: true })).toBeVisible();
  const requestsBeforeRecovery = pageRequests;
  await page.getByRole("button", { name: "Read saved copy", exact: true }).click();
  const recovery = page.getByRole("dialog", { name: "Earlier saved chapter", exact: true });
  const previous = recovery.getByRole("button", { name: "Previous page", exact: true });
  if (await previous.isEnabled()) await previous.click();
  await expect(recovery.getByRole("img", { name: "Saved page 1 · part 1", exact: true })).toHaveAttribute("src", /^blob:/);
  await expect(recovery.getByRole("img", { name: "Saved page 1 · part 2", exact: true })).toHaveAttribute("src", /^blob:/);
  expect(pageRequests).toBe(requestsBeforeRecovery);
  await page.evaluate(async (server) => { await (await caches.open("yomikura-page-cache")).delete(`${server}/page/1`); }, server);
  await recovery.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(recovery.getByRole("alert")).toContainText("missing from device storage");
  expect(pageRequests).toBe(requestsBeforeRecovery);
  await page.keyboard.press("Escape"); await expect(recovery).toHaveCount(0);
  await page.goto("/manga/42"); await page.getByText("My notes", { exact: false }).click();
  await expect(page.getByRole("textbox", { name: "A note for Shared title", exact: true })).not.toHaveValue("Earlier library thought");
  expect(writes).toHaveLength(0);
});
