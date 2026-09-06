import { describe, expect, it } from "vitest";
import { createProgressSnapshot } from "./readerProgress";

describe("continuous reader progress", () => {
  it("keeps progress attached to each streamed chapter", () => {
    const first = createProgressSnapshot({ id: 10, name: "Chapter 10", chapterNumber: 10, mangaId: 1, pages: ["a", "b"] }, "Nano Machine", 1);
    const next = createProgressSnapshot({ id: 11, name: "Chapter 11", chapterNumber: 11, mangaId: 1, pages: ["c", "d", "e"] }, "Nano Machine", 2);
    expect(first.chapterId).toBe(10);
    expect(next.chapterId).toBe(11);
    expect(next.pageIndex).toBe(2);
  });

  it("clamps invalid page indexes", () => {
    expect(createProgressSnapshot({ id: 1, name: "One", chapterNumber: 1, mangaId: 1, pages: ["a"] }, "Manga", 99).pageIndex).toBe(0);
  });
});
