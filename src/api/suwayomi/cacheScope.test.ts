import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { deleteCachedChapter, getCachedChapter, getChapterCacheKey, getDownloadJobs, getOwnedCachedPage, openDB, saveCachedChapter, saveDownloadJob, type CachedChapter } from "./offlineCache";
const server = "http://cache.example";
const record = (isDemo: boolean): CachedChapter => ({ cacheKey: getChapterCacheKey(server, 12, isDemo), serverBaseUrl: server, isDemo, id: 12, name: "Chapter", chapterNumber: 1, mangaId: 42, mangaTitle: isDemo ? "[Demo] Sample" : "Live title", sourceOrder: 1, pageCount: 1, pages: ["https://images.example/shared"], networkUrls: ["https://images.example/shared"], cachedUrls: [`https://images.example/shared?attempt=${isDemo ? "demo" : "live"}`], cachedAt: 1, totalSizeBytes: 4 });
let objects: Map<string, Response>;
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory()); objects = new Map();
  vi.stubGlobal("caches", { open: async () => ({ match: async (key: string) => objects.get(key)?.clone(), delete: async (key: string) => objects.delete(key) }) });
});
afterEach(() => vi.unstubAllGlobals());
it("keeps live/demo metadata and byte lookup separate even for the same IDs and network URL", async () => {
  for (const demo of [false, true]) { const row = record(demo); await saveCachedChapter(row); objects.set(row.cachedUrls[0], new Response(demo ? "DEMO" : "LIVE")); }
  expect((await getCachedChapter(server, 12, false))!.mangaTitle).toBe("Live title"); expect((await getCachedChapter(server, 12, true))!.mangaTitle).toBe("[Demo] Sample");
  expect(await (await getOwnedCachedPage("https://images.example/shared", server, false))!.text()).toBe("LIVE");
  expect(await (await getOwnedCachedPage("https://images.example/shared", server, true))!.text()).toBe("DEMO");
  expect(await getOwnedCachedPage("https://images.example/shared", "http://other.example", false)).toBeUndefined();
});
it("preserves an older demo row before a live cache write reuses its former key", async () => {
  const db = await openDB(); const legacy = { ...record(true), cacheKey: getChapterCacheKey(server, 12), isDemo: undefined };
  await new Promise<void>((resolve) => { const tx = db.transaction("chapters", "readwrite"); tx.oncomplete = () => resolve(); tx.objectStore("chapters").put(legacy); }); db.close();
  await saveCachedChapter(record(false));
  expect((await getCachedChapter(server, 12, true))!.mangaTitle).toBe("[Demo] Sample"); expect((await getCachedChapter(server, 12, false))!.mangaTitle).toBe("Live title");
});
it("retains a shared page while another backend still references it", async () => {
  const url = "https://images.example/shared";
  await saveCachedChapter({ ...record(false), cachedUrls: [url] });
  await saveCachedChapter({ ...record(false), serverBaseUrl: "http://other.example", cachedUrls: [url] }); objects.set(url, new Response("SHARED"));
  await deleteCachedChapter(server, 12); expect(objects.has(url)).toBe(true); expect(await getCachedChapter("http://other.example", 12)).not.toBeNull();
});
it("isolates durable job mode while retaining existing URL-only keys", async () => {
  for (const isDemo of [false, true]) await saveDownloadJob({ serverBaseUrl: server, chapterId: 12, isDemo, status: "queued", progress: 0, total: 1, attempts: 0, updatedAt: 1 });
  expect(await getDownloadJobs(server, false)).toHaveLength(1); expect(await getDownloadJobs(server, true)).toHaveLength(1);
  expect(getChapterCacheKey(`${server}/`, 12, false)).toBe(`${server}::12`);
});
it("resolves legacy cached image URLs after equivalent endpoint spelling changes", async () => {
  const legacyUrl = "HTTP://LOCALHOST:80/api/v1/manga/42/chapter/1/page/0";
  await saveCachedChapter({ ...record(false), serverBaseUrl: "HTTP://LOCALHOST:80", pages: [legacyUrl], cachedUrls: [legacyUrl], networkUrls: undefined }); objects.set(legacyUrl, new Response("LEGACY"));
  expect(await (await getOwnedCachedPage("http://localhost/api/v1/manga/42/chapter/1/page/0", "http://localhost/", false))!.text()).toBe("LEGACY");
});
