import { expect, it } from "vitest";
import { DEFAULT_CHAPTER_POLICY, readingPolicy, resumeChapter, selectChapters } from "./chapterPolicy";
const chapters = [
  { id: 1, chapterNumber: 1, sourceOrder: 1, isRead: true, isBookmarked: false, scanlator: "A" },
  { id: 2, chapterNumber: 2, sourceOrder: 2, isRead: false, isBookmarked: true, scanlator: "B" },
  { id: 3, chapterNumber: 2, sourceOrder: 3, isRead: false, isBookmarked: true, scanlator: "A" },
  { id: 4, chapterNumber: -1, sourceOrder: 4, isRead: false, isBookmarked: false, scanlator: "A" },
];
it("orders equal numbers deterministically and retains unknown specials at the end", () => {
  expect(selectChapters(chapters, DEFAULT_CHAPTER_POLICY, new Set()).map((chapter) => chapter.id)).toEqual([1, 2, 3, 4]);
  expect(selectChapters(chapters, { ...DEFAULT_CHAPTER_POLICY, descending: true }, new Set()).map((chapter) => chapter.id)).toEqual([3, 2, 1, 4]);
});
it("shares scanlator and unread selection while keeping a manually opened anchor navigable", () => {
  const policy = { ...DEFAULT_CHAPTER_POLICY, filter: "unread" as const, scanlator: "A" };
  expect(selectChapters(chapters, policy, new Set()).map((chapter) => chapter.id)).toEqual([3, 4]);
  expect(selectChapters(chapters, policy, new Set(), 1).map((chapter) => chapter.id)).toEqual([1, 3, 4]);
});
it("uses either local or server downloads without inventing backend flags", () => {
  expect(selectChapters(chapters, { ...DEFAULT_CHAPTER_POLICY, filter: "downloaded" }, new Set([3])).map((chapter) => chapter.id)).toEqual([3]);
  expect(selectChapters(chapters, { ...DEFAULT_CHAPTER_POLICY, filter: "bookmarked" }, new Set()).map((chapter) => chapter.id)).toEqual([2, 3]);
});
it("resumes chapter 51 after 50 completed chapters in either display direction", () => {
  const hundred = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, chapterNumber: index + 1, isRead: index < 50 }));
  for (const descending of [false, true]) expect(resumeChapter(hundred, { ...DEFAULT_CHAPTER_POLICY, descending }, new Set())?.id).toBe(51);
});
it("continues an unfinished chapter and respects an explicit mark-unread", () => {
  const entries = [{ id: 50, chapterNumber: 50, isRead: false, lastPageRead: 7 }, { id: 51, chapterNumber: 51, isRead: false }];
  expect(resumeChapter(entries, { ...DEFAULT_CHAPTER_POLICY, descending: true }, new Set())?.id).toBe(50);
});
it("keeps scanlator and availability filters while separating list direction from reading direction", () => {
  const policy = { ...DEFAULT_CHAPTER_POLICY, descending: true, scanlator: "A" };
  expect(resumeChapter(chapters, policy, new Set())?.id).toBe(3);
  expect(selectChapters(chapters, readingPolicy(policy), new Set()).map((chapter) => chapter.id)).toEqual([1, 3, 4]);
  expect(resumeChapter(chapters.map((chapter) => ({ ...chapter, isRead: true })), policy, new Set())).toBeUndefined();
});
