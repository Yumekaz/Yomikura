import { describe, expect, it } from "vitest";
import { mergeReadingHistory, type ServerHistoryChapter } from "./historyModel";
import type { ReadingHistoryEvent } from "../../api/suwayomi/offlineCache";
const now = 1_790_000_000_000;
const server = (id: number, mangaId = 1, readAt = now + id): ServerHistoryChapter => ({ id, mangaId, name: `Chapter ${id}`, chapterNumber: id, lastPageRead: 3, pageCount: 10, isRead: false, lastReadAt: String(readAt), manga: { id: mangaId, title: `Comic ${mangaId}` } });
const local = (id: number, patch: Partial<ReadingHistoryEvent> = {}): ReadingHistoryEvent => ({ historyKey: `server::${id}`, serverBaseUrl: "http://server", chapterId: id, chapterName: `Chapter ${id}`, chapterNumber: id, mangaId: 1, mangaTitle: "Comic 1", lastPageRead: 5, pageCount: 10, isRead: false, readAt: now + 100, ...patch });

describe("comic-level reading history", () => {
  it("shows one latest chapter per comic across overlapping backend pages", () => {
    const result = mergeReadingHistory([server(1), server(2), server(3, 2), server(2)], [], false);
    expect(result.map((item) => item.id)).toEqual(["3", "2"]);
  });
  it("uses the last-read time rather than the highest chapter number when rereading", () => {
    expect(mergeReadingHistory([server(50), server(2, 1, now + 200)], [], false)[0].id).toBe("2");
  });
  it("merges offline activity before choosing the comic's latest chapter", () => {
    const result = mergeReadingHistory([server(1), server(2)], [local(1)], false);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "1", lastPageRead: 5, isLocal: true });
  });
  it("hides earlier chapters of a removed comic, including pages loaded afterward", () => {
    const marker = local(2, { isHidden: true, hideMangaBefore: now + 200, readAt: now + 200 });
    expect(mergeReadingHistory([server(1), server(2)], [marker], false)).toEqual([]);
    expect(mergeReadingHistory([server(1), server(2)], [marker, local(3, { readAt: now + 201 })], false)[0].id).toBe("3");
  });
  it("a fresh local read can reappear even when the server clock was ahead at removal", () => {
    const marker = local(2, { isHidden: true, hideMangaBefore: now + 60_000, readAt: now + 200 });
    expect(mergeReadingHistory([server(2, 1, now + 60_000)], [marker, local(2, { readAt: now + 201 })], false)[0].id).toBe("2");
  });
  it("keeps demo removals separate from the live comic with the same numeric ID", () => {
    const marker = local(1, { isDemo: true, isHidden: true, hideMangaBefore: now + 500 });
    expect(mergeReadingHistory([server(1)], [marker], false)).toHaveLength(1);
  });
  it("does not let old local identity replace a reused chapter ID", () => {
    expect(mergeReadingHistory([server(1)], [local(1, { mangaId: 99, mangaTitle: "Old book" })], false)[0].manga.title).toBe("Comic 1");
  });
  it("ignores chapters that have no reading activity", () => {
    expect(mergeReadingHistory([server(1, 1, 0)], [], false)).toEqual([]);
  });
});
