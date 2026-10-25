import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { enqueueProgress } from "../../api/suwayomi/progressStorage";
import { DEFAULT_CHAPTER_POLICY } from "../manga/chapterPolicy";
import { loadReadingSequence } from "./readingSequence";
const transport = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../api/graphql/client", () => ({ createGraphqlClient: () => ({ GetReadingChapters: transport.read }) }));
const backend = progressBackend("http://sequence.example");
const row = (id: number) => ({ id, mangaId: 42, name: `Chapter ${id}`, chapterNumber: id, sourceOrder: id, isRead: false, isBookmarked: true, isDownloaded: false, uploadDate: "1000", scanlator: "A" });
const connection = (ids: number[], next: string | null = null, total = ids.length) => ({ chapters: { totalCount: total, pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes: ids.map(row) } });
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => vi.unstubAllGlobals());
it("loads the complete paginated list before selecting eligible continuation", async () => {
  transport.read.mockResolvedValueOnce(connection([12], "after-12", 3)).mockResolvedValueOnce(connection([13, 14], null, 3));
  expect((await loadReadingSequence(backend, 42, "Fixture", 12, DEFAULT_CHAPTER_POLICY)).chapters.map((chapter) => chapter.id)).toEqual([12, 13, 14]);
  expect(transport.read.mock.calls[1][0]).toEqual({ mangaId: 42, after: "after-12" });
});
it("uses pending local unread/read intent when building the frozen entry sequence", async () => {
  await enqueueProgress(backend, { kind: "explicit", chapter: { chapterId: 13, chapterName: "Chapter 13", chapterNumber: 13, sourceOrder: 13, mangaId: 42, mangaTitle: "Fixture", pageCount: 1 }, baseline: { isRead: false, lastPageRead: 0 }, patch: { isRead: true, lastPageRead: 0 } });
  transport.read.mockResolvedValue(connection([12, 13, 14]));
  const result = await loadReadingSequence(backend, 42, "Fixture", 12, { ...DEFAULT_CHAPTER_POLICY, filter: "unread" });
  expect(result.chapters.map((chapter) => chapter.id)).toEqual([12, 14]);
});
it("rejects changed totals instead of exposing a truncated list", async () => {
  transport.read.mockResolvedValueOnce(connection([12], "next", 3)).mockResolvedValueOnce(connection([13], null, 2));
  await expect(loadReadingSequence(backend, 42, "Fixture", 12, DEFAULT_CHAPTER_POLICY)).rejects.toThrow("changed");
});
it("rejects duplicate IDs and repeated pagination cursors", async () => {
  transport.read.mockResolvedValueOnce(connection([12], "next", 3)).mockResolvedValueOnce(connection([13], "next", 3));
  await expect(loadReadingSequence(backend, 42, "Fixture", 12, DEFAULT_CHAPTER_POLICY)).rejects.toThrow("pagination");
});
