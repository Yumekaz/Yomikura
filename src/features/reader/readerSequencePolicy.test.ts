import { expect, it } from "vitest";
import { DEFAULT_CHAPTER_POLICY } from "../manga/chapterPolicy";
import { DEFAULT_SEQUENCE_CHOICES, selectReaderSequence } from "./readerSequencePolicy";
const chapters = [
  { id: 1, chapterNumber: 1, sourceOrder: 1, scanlator: "A", isRead: true },
  { id: 2, chapterNumber: 1, sourceOrder: 2, scanlator: "B", isRead: false },
  { id: 3, chapterNumber: 2, sourceOrder: 3, scanlator: "A", isRead: false },
  { id: 4, chapterNumber: 2, sourceOrder: 4, scanlator: "B", isRead: false },
  { id: 5, chapterNumber: -1, sourceOrder: 5, scanlator: "A", isRead: false },
  { id: 6, chapterNumber: -1, sourceOrder: 6, scanlator: "A", isRead: false },
];
it("separates skip-read from list filters and preserves an explicitly opened anchor", () => {
  const policy = { ...DEFAULT_CHAPTER_POLICY, scanlator: "A", descending: true };
  const select = (choices: typeof DEFAULT_SEQUENCE_CHOICES) => selectReaderSequence(chapters, policy, new Set(), 1, choices).map((chapter) => chapter.id);
  expect(select(DEFAULT_SEQUENCE_CHOICES)).toEqual([1, 3, 5, 6]);
  expect(select({ ...DEFAULT_SEQUENCE_CHOICES, skipFiltered: false })).toEqual([1, 2, 3, 4, 5, 6]);
  expect(selectReaderSequence(chapters, DEFAULT_CHAPTER_POLICY, new Set(), 3, { ...DEFAULT_SEQUENCE_CHOICES, skipRead: true }).map((chapter) => chapter.id)).toEqual([2, 3, 4, 5, 6]);
});
it("keeps the anchor edition and prefers its scanlator for duplicate chapter numbers", () => {
  const selected = selectReaderSequence(chapters, DEFAULT_CHAPTER_POLICY, new Set(), 2, { ...DEFAULT_SEQUENCE_CHOICES, skipDuplicates: true });
  expect(selected.map((chapter) => chapter.id)).toEqual([2, 4, 5, 6]);
});
it("does not remove an opened chapter hidden by both filters and read status", () => {
  const selected = selectReaderSequence(chapters, { ...DEFAULT_CHAPTER_POLICY, scanlator: "B", filter: "bookmarked" }, new Set(), 1, { ...DEFAULT_SEQUENCE_CHOICES, skipRead: true });
  expect(selected.map((chapter) => chapter.id)).toEqual([1]);
});
