import { parseChapterTimestamp } from "./chapterDate";

export type ChapterFilter = "all" | "unread" | "bookmarked" | "downloaded";
export interface ChapterPolicy { sort: "number" | "source" | "date"; descending: boolean; filter: ChapterFilter; scanlator: string }
export const DEFAULT_CHAPTER_POLICY: ChapterPolicy = { sort: "number", descending: false, filter: "all", scanlator: "all" };
export interface PolicyChapter { id: string | number; chapterNumber: number; sourceOrder?: number; uploadDate?: string | number; name?: string; isRead?: boolean; isBookmarked?: boolean; isDownloaded?: boolean; scanlator?: string | null; lastPageRead?: number; pageCount?: number }
export function normalizeChapterPolicy(value?: Partial<ChapterPolicy>): ChapterPolicy {
  return { sort: value?.sort === "source" || value?.sort === "date" ? value.sort : "number", descending: value?.descending === true,
    filter: value?.filter === "unread" || value?.filter === "bookmarked" || value?.filter === "downloaded" ? value.filter : "all", scanlator: typeof value?.scanlator === "string" ? value.scanlator : "all" };
}
/** Newest-first is a display preference; reading still proceeds forwards. */
export function readingPolicy(policy: ChapterPolicy): ChapterPolicy {
  return { ...policy, descending: false };
}

export function resumeChapter<T extends PolicyChapter>(chapters: T[], policy: ChapterPolicy, cachedIds: ReadonlySet<number>): T | undefined {
  return selectChapters(chapters, readingPolicy(policy), cachedIds).find((chapter) => chapter.isRead === false);
}
export function selectChapters<T extends PolicyChapter>(chapters: T[], policy: ChapterPolicy, cachedIds: ReadonlySet<number>, anchorId?: number): T[] {
  const value = (chapter: T) => policy.sort === "source" ? chapter.sourceOrder : policy.sort === "date" ? parseChapterTimestamp(chapter.uploadDate ?? "") ?? undefined : Number.isFinite(chapter.chapterNumber) && chapter.chapterNumber >= 0 ? chapter.chapterNumber : undefined;
  return chapters.filter((chapter) => Number(chapter.id) === anchorId || ((policy.scanlator === "all" || chapter.scanlator === policy.scanlator)
    && (policy.filter === "all" || policy.filter === "unread" && chapter.isRead === false || policy.filter === "bookmarked" && chapter.isBookmarked === true || policy.filter === "downloaded" && (chapter.isDownloaded || cachedIds.has(Number(chapter.id))))))
    .sort((a, b) => {
      const av = value(a), bv = value(b); const direction = policy.descending ? -1 : 1;
      if (av === undefined || bv === undefined) { if (av !== bv) return av === undefined ? 1 : -1; }
      else if (av !== bv) return (av - bv) * direction;
      return ((a.sourceOrder ?? 0) - (b.sourceOrder ?? 0)) * direction || Number(a.id) - Number(b.id);
    });
}
