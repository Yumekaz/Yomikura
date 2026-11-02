import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rememberLibrary } from "./librarySession";
import { deleteCachedChapter, getCachedChapter, getCachedChapters, saveCachedChapter, saveDownloadJob, getDownloadJobs, recordReadingActivity, getReadingHistory, type CachedChapter } from "./offlineCache";
import { progressBackend } from "./backendIdentity";
import { bookNoteScope, getBookNoteDraft, saveBookNoteDraft } from "../../features/manga/bookNoteStorage";
const server = "http://library.example", first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const values = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("caches", { open: async () => ({ delete: async () => true }) });
});
afterEach(() => vi.unstubAllGlobals());
const chapter = (libraryId?: string): CachedChapter => ({ cacheKey: "fixture", serverBaseUrl: server, libraryId, id: 12, name: "Chapter 1", chapterNumber: 1, mangaId: 42, mangaTitle: "Same title", sourceOrder: 1, pageCount: 1, pages: ["/page"], cachedUrls: [], totalSizeBytes: 1, cachedAt: Date.now() });
it("keeps two libraries and an unverified old copy with overlapping IDs in separate saved records", async () => {
  await saveCachedChapter(chapter());
  rememberLibrary(server, { marker: first }); await saveCachedChapter(chapter(first));
  rememberLibrary(server, { marker: second }); await saveCachedChapter(chapter(second));
  expect((await getCachedChapter(server, 12))?.libraryId).toBe(second);
  expect(await getCachedChapters(server)).toHaveLength(1);
  expect(await getCachedChapters()).toHaveLength(3);
  await deleteCachedChapter(server, 12);
  expect((await getCachedChapters()).map((item) => item.libraryId).sort()).toEqual([first, undefined].sort());
});
it("does not restore a download job or reading history from another library at the same address", async () => {
  rememberLibrary(server, { marker: first });
  await saveDownloadJob({ serverBaseUrl: server, chapterId: 12, status: "queued", progress: 0, total: 1, attempts: 0, updatedAt: Date.now() });
  await recordReadingActivity(server, { chapterId: 12, chapterName: "Chapter 1", chapterNumber: 1, mangaId: 42, mangaTitle: "Same title", lastPageRead: 0, pageCount: 1, isRead: false });
  rememberLibrary(server, { marker: second });
  expect(await getDownloadJobs(server)).toEqual([]); expect(await getReadingHistory(server)).toEqual([]);
  expect(await getDownloadJobs()).toHaveLength(1); expect(await getReadingHistory()).toHaveLength(1);
});
it("keeps the earlier device note without presenting it as the replacement library's draft", async () => {
  rememberLibrary(server, { marker: first }); const earlier = bookNoteScope(progressBackend(server), 42, "Same title");
  await saveBookNoteDraft({ key: earlier, value: "Earlier thought", base: null, revision: "fixture", pending: true });
  rememberLibrary(server, { marker: second }); const current = bookNoteScope(progressBackend(server), 42, "Same title");
  expect(await getBookNoteDraft(current)).toBeUndefined();
  expect((await getBookNoteDraft(earlier))?.value).toBe("Earlier thought");
});
