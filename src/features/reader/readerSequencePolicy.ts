import { readingPolicy, selectChapters, type ChapterPolicy, type PolicyChapter } from "../manga/chapterPolicy";
export interface ReaderSequenceChoices { skipRead: boolean; skipFiltered: boolean; skipDuplicates: boolean }
export const DEFAULT_SEQUENCE_CHOICES: ReaderSequenceChoices = { skipRead: false, skipFiltered: true, skipDuplicates: false };

export function readerChapterOrder<T extends PolicyChapter>(chapters: T[], policy: ChapterPolicy, cachedIds: ReadonlySet<number>, skipDuplicates: boolean) {
  const fullPolicy = readingPolicy({ ...policy, filter: "all", scanlator: "all" });
  const editionIds = new Map<T["id"], T["id"]>();
  if (!skipDuplicates) return { ordered: selectChapters(chapters, fullPolicy, cachedIds), editionIds };

  const sourceOrder = selectChapters(chapters, { ...fullPolicy, sort: "source" }, cachedIds);
  const seenNumbers = new Set<number>();
  let repeatsAcrossRuns = false;
  let previousNumber: number | undefined;
  let previousVolume: string | undefined;
  let editionId: T["id"] | undefined;
  for (const chapter of sourceOrder) {
    const number = Number.isFinite(chapter.chapterNumber) && chapter.chapterNumber >= 0 ? chapter.chapterNumber : undefined;
    const section = chapter.name?.match(/\b(season|volume|vol\.?)\s*(\d+)\b/i);
    const volume = section ? `${section[1].toLowerCase() === "season" ? "season" : "volume"}:${Number(section[2])}` : undefined;
    // Work from the full source sequence, so filtering cannot merge distant releases.
    if (editionId === undefined || number === undefined || number !== previousNumber || previousVolume && volume && previousVolume !== volume) {
      editionId = chapter.id;
      previousVolume = undefined;
      if (number !== undefined) {
        repeatsAcrossRuns ||= seenNumbers.has(number);
        seenNumbers.add(number);
      }
    }
    editionIds.set(chapter.id, editionId);
    previousNumber = number;
    previousVolume = volume ?? previousVolume;
  }

  // Number sorting alone interleaves seasons whose numbering starts over.
  const ordered = fullPolicy.sort === "source" || fullPolicy.sort === "number" && repeatsAcrossRuns
    ? sourceOrder
    : selectChapters(chapters, fullPolicy, cachedIds);
  return { ordered, editionIds };
}

export function selectReaderSequence<T extends PolicyChapter>(chapters: T[], policy: ChapterPolicy, cachedIds: ReadonlySet<number>, anchorId: number, choices: ReaderSequenceChoices, order = readerChapterOrder(chapters, policy, cachedIds, choices.skipDuplicates)) {
  const eligibleIds = new Set(selectChapters(chapters, readingPolicy(choices.skipFiltered ? policy : { ...policy, filter: "all", scanlator: "all" }), cachedIds, anchorId)
    .filter((chapter) => Number(chapter.id) === anchorId || !choices.skipRead || chapter.isRead !== true).map((chapter) => chapter.id));
  const eligible = order.ordered.filter((chapter) => eligibleIds.has(chapter.id));
  if (!choices.skipDuplicates) return eligible;

  const anchor = chapters.find((chapter) => Number(chapter.id) === anchorId);
  const editions = new Map<T["id"], T>();
  for (const chapter of eligible) {
    const key = order.editionIds.get(chapter.id) ?? chapter.id;
    const chosen = editions.get(key);
    if (!chosen || Number(chapter.id) === anchorId || (
      Number(chosen.id) !== anchorId && chosen.scanlator !== anchor?.scanlator && chapter.scanlator === anchor?.scanlator
    )) editions.set(key, chapter);
  }
  return [...editions.values()];
}
