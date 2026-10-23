import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { saveCachedChapter, type CachedChapter } from "../../api/suwayomi/offlineCache";
import { loadReaderChapter, loadReaderChapterDetails, loadReaderChapterPages } from "./readerChapter";

const transport = vi.hoisted(() => ({ get: vi.fn(), pages: vi.fn(), calls: [] as { endpoint: string; mode: string }[] }));
vi.mock("../../api/graphql/client", () => ({ createGraphqlClient: (endpoint: string, _options: unknown, mode: string) => {
  transport.calls.push({ endpoint, mode }); return { GetChapter: transport.get, FetchChapterPages: transport.pages };
} }));
const backend = progressBackend("http://reader.example:4567");
const cached = (id: number): CachedChapter => ({ cacheKey: `${backend.serverBaseUrl}::${id}`, serverBaseUrl: backend.serverBaseUrl, id, name: `Chapter ${id}`, chapterNumber: id, mangaId: 42, mangaTitle: "Fixture", sourceOrder: id, pageCount: 2, pages: [`/${id}/0`, `/${id}/1`], cachedUrls: [], cachedAt: 1, totalSizeBytes: 0, isRead: false, lastPageRead: 1 });
const remote = (id: number) => ({ id, name: `Chapter ${id}`, chapterNumber: id, mangaId: 42, sourceOrder: id, pageCount: 2, isRead: false, lastPageRead: 0, manga: { title: "Fixture", chapters: { edges: [{ node: { id, chapterNumber: id } }] } } });
beforeEach(() => { vi.resetAllMocks(); transport.calls.length = 0; vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => vi.unstubAllGlobals());

describe("shared reader chapter resolution", () => {
  it("resolves later chapters from the same backend cache during an outage", async () => {
    await saveCachedChapter(cached(1)); await saveCachedChapter(cached(2));
    transport.get.mockRejectedValue(new TypeError("offline")); transport.pages.mockRejectedValue(new TypeError("offline"));
    expect(await loadReaderChapter(backend, 2)).toMatchObject({ id: 2, pages: ["/2/0", "/2/1"], lastPageRead: 1, mangaTitle: "Fixture" });
    expect(transport.calls.every((call) => call.endpoint === "http://reader.example:4567/api/graphql" && call.mode === "live")).toBe(true);
  });

  it("does not use overlapping IDs from another endpoint", async () => {
    await saveCachedChapter(cached(1)); transport.get.mockRejectedValue(new TypeError("offline"));
    await expect(loadReaderChapter(progressBackend("http://other.example:4567"), 1)).rejects.toThrow("offline");
  });

  it("uses cached pages only when they still belong to the requested chapter", async () => {
    await saveCachedChapter({ ...cached(1), mangaTitle: "An older library" });
    transport.get.mockResolvedValue({ chapter: remote(1) }); transport.pages.mockRejectedValue(new Error("page server unavailable"));
    const details = await loadReaderChapterDetails(backend, 1);
    await expect(loadReaderChapterPages(backend, 1, details)).rejects.toThrow("page server unavailable");
  });

  it("can use an existing complete copy when a source returns no pages", async () => {
    await saveCachedChapter(cached(1)); transport.get.mockResolvedValue({ chapter: remote(1) }); transport.pages.mockResolvedValue({ fetchChapterPages: { pages: [] } });
    expect((await loadReaderChapter(backend, 1)).pages).toEqual(["/1/0", "/1/1"]);
  });

  it("does not turn cancellation into a successful offline chapter load", async () => {
    await saveCachedChapter(cached(1)); transport.get.mockRejectedValue(new Error("cancelled"));
    const controller = new AbortController(); controller.abort();
    await expect(loadReaderChapterDetails(backend, 1, controller.signal)).rejects.toThrow("cancelled");
  });
});
