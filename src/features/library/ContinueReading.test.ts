import { describe, expect, it } from "vitest";
import { recentReading, type ReadingCandidate } from "./ContinueReading";

const chapter: ReadingCandidate = { chapterId: 1, mangaId: 10, title: "A book", chapterName: "Chapter one", lastPageRead: 3, readAt: 200, isRead: false };
describe("library continuation", () => {
  it("resumes the most recent unfinished book in this library", () => {
    expect(recentReading([chapter, { ...chapter, chapterId: 2, readAt: 300, isRead: true }], [], new Set([10]))).toEqual(chapter);
  });
  it("keeps newer local reading after an outage", () => {
    expect(recentReading([chapter], [{ ...chapter, lastPageRead: 7, readAt: 400 }], new Set([10]))?.lastPageRead).toBe(7);
  });
  it("does not offer progress that the user explicitly reset", () => {
    expect(recentReading([chapter], [{ ...chapter, isHidden: true, readAt: 100 }], new Set([10]))).toBeUndefined();
  });
  it("respects a pending mark-read even if the server clock is ahead", () => {
    expect(recentReading([chapter], [{ ...chapter, isRead: true, readAt: 100, authoritative: true }], new Set([10]))).toBeUndefined();
  });
  it("uses newer server progress when a local event is acknowledged", () => {
    expect(recentReading([chapter], [{ ...chapter, lastPageRead: 0, readAt: 100 }], new Set([10]))?.lastPageRead).toBe(3);
  });
  it("does not apply a reused chapter ID to a different book", () => {
    expect(recentReading([chapter], [{ ...chapter, title: "Another book", isHidden: true, authoritative: true }], new Set([10]))).toEqual(chapter);
  });
  it("does not expose removed books or empty activity", () => {
    expect(recentReading([chapter], [], new Set([20]))).toBeUndefined();
    expect(recentReading([{ ...chapter, readAt: 0 }], [], new Set([10]))).toBeUndefined();
  });
  it("retains the most recent completion when resolving the comic's next unread chapter", () => {
    const completed = { ...chapter, chapterId: 50, readAt: 400, isRead: true };
    expect(recentReading([chapter, completed], [], new Set([10]), true)).toEqual(completed);
  });
});
