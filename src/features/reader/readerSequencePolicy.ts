import { readingPolicy, selectChapters, type ChapterPolicy, type PolicyChapter } from "../manga/chapterPolicy";
export interface ReaderSequenceChoices { skipRead: boolean; skipFiltered: boolean; skipDuplicates: boolean }
export const DEFAULT_SEQUENCE_CHOICES: ReaderSequenceChoices = { skipRead: false, skipFiltered: true, skipDuplicates: false };
export function selectReaderSequence<T extends PolicyChapter>(chapters: T[], policy: ChapterPolicy, cachedIds: ReadonlySet<number>, anchorId: number, choices: ReaderSequenceChoices) {
  const anchor = chapters.find((chapter) => Number(chapter.id) === anchorId);
  const eligible = selectChapters(chapters, readingPolicy(choices.skipFiltered ? policy : { ...policy, filter: "all", scanlator: "all" }), cachedIds, anchorId)
    .filter((chapter) => Number(chapter.id) === anchorId || !choices.skipRead || chapter.isRead !== true);
  if (!choices.skipDuplicates) return eligible;
  const editions = new Map<string, T[]>();
  for (const chapter of eligible) {
    // Unnumbered chapters can be distinct extras. Keep them individually.
    const key = Number.isFinite(chapter.chapterNumber) && chapter.chapterNumber >= 0 ? `number:${chapter.chapterNumber}` : `id:${chapter.id}`;
    const group = editions.get(key) ?? []; group.push(chapter); editions.set(key, group);
  }
  return [...editions.values()].map((group) => group.find((chapter) => Number(chapter.id) === anchorId) ?? group.find((chapter) => chapter.scanlator === anchor?.scanlator) ?? group[0]);
}
