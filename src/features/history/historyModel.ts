import type { ReadingHistoryEvent } from "../../api/suwayomi/offlineCache";

export interface HistoryItem {
  id: string; name: string; chapterNumber: number; lastPageRead: number; pageCount?: number;
  readAt: number; mangaId: number; isLocal: boolean; isRead: boolean;
  manga: { id: number; title: string; thumbnailUrl?: string | null };
}
export interface ServerHistoryChapter {
  id: number; name: string; chapterNumber: number; lastPageRead: number; pageCount?: number;
  lastReadAt: unknown; mangaId: number; isRead: boolean;
  manga: HistoryItem["manga"];
}
export function parseHistoryTimestamp(value: unknown): number {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "0") return 0;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric < 30_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}
export function shouldShowReadingEvent(event: { isDemo?: boolean; mangaTitle: string }, mockMode: boolean): boolean {
  return (event.isDemo === true || event.mangaTitle.startsWith("[Demo]")) === mockMode;
}
export const historyTitleKey = (mangaId: number, title: string) => JSON.stringify([mangaId, title]);

export function historyCutoffs(events: ReadingHistoryEvent[], mockMode: boolean) {
  const result = new Map<string, { localBefore: number; serverBefore: number }>();
  for (const event of events) {
    if (!event.hideMangaBefore || !shouldShowReadingEvent(event, mockMode)) continue;
    const key = historyTitleKey(event.mangaId, event.mangaTitle);
    const previous = result.get(key);
    result.set(key, { localBefore: Math.max(previous?.localBefore ?? 0, event.readAt), serverBefore: Math.max(previous?.serverBefore ?? 0, event.hideMangaBefore) });
  }
  return result;
}

/** Merge chapter state first, then project one most-recent activity per comic. */
export function mergeReadingHistory(server: ServerHistoryChapter[], local: ReadingHistoryEvent[], mockMode: boolean): HistoryItem[] {
  const scoped = local.filter((event) => shouldShowReadingEvent(event, mockMode));
  const chapterKey = (id: string | number, mangaId: number, title: string) => JSON.stringify([id, mangaId, title]);
  const hidden = new Set(scoped.filter((event) => event.isHidden && !event.hideMangaBefore).map((event) => chapterKey(event.chapterId, event.mangaId, event.mangaTitle)));
  const chapters = new Map<string, HistoryItem>();
  const cutoffs = historyCutoffs(scoped, mockMode);
  for (const chapter of server) {
    if (!shouldShowReadingEvent({ mangaTitle: chapter.manga.title }, mockMode)) continue;
    const readAt = parseHistoryTimestamp(chapter.lastReadAt);
    if (readAt <= 0 || hidden.has(chapterKey(chapter.id, chapter.mangaId, chapter.manga.title))) continue;
    const previous = chapters.get(String(chapter.id));
    if (!previous || readAt > previous.readAt) chapters.set(String(chapter.id), {
      id: String(chapter.id), name: chapter.name, chapterNumber: chapter.chapterNumber,
      lastPageRead: chapter.lastPageRead, pageCount: chapter.pageCount, isRead: chapter.isRead,
      readAt, mangaId: chapter.mangaId, isLocal: false, manga: chapter.manga,
    });
  }
  for (const event of scoped) {
    if (event.isHidden || event.hideMangaBefore) continue;
    const previous = chapters.get(String(event.chapterId));
    if (previous && (previous.mangaId !== event.mangaId || previous.manga.title !== event.mangaTitle || previous.name !== event.chapterName)) continue;
    const cutoff = cutoffs.get(historyTitleKey(event.mangaId, event.mangaTitle));
    const freshAfterRemoval = cutoff && event.readAt > cutoff.localBefore && previous && !previous.isLocal && previous.readAt <= cutoff.serverBefore;
    if (!previous || event.readAt >= previous.readAt || freshAfterRemoval) chapters.set(String(event.chapterId), {
      id: String(event.chapterId), name: event.chapterName, chapterNumber: event.chapterNumber,
      lastPageRead: event.lastPageRead, pageCount: event.pageCount, isRead: event.isRead,
      readAt: event.readAt, mangaId: event.mangaId, isLocal: true,
      manga: { id: event.mangaId, title: event.mangaTitle, thumbnailUrl: event.thumbnailUrl },
    });
  }
  const titles = new Map<number, HistoryItem>();
  for (const chapter of chapters.values()) {
    const cutoff = cutoffs.get(historyTitleKey(chapter.mangaId, chapter.manga.title));
    if (cutoff && chapter.readAt <= (chapter.isLocal ? cutoff.localBefore : cutoff.serverBefore)) continue;
    const previous = titles.get(chapter.mangaId);
    if (!previous || chapter.readAt > previous.readAt || chapter.readAt === previous.readAt && Number(chapter.id) > Number(previous.id)) titles.set(chapter.mangaId, chapter);
  }
  return [...titles.values()].sort((a, b) => b.readAt - a.readAt || b.mangaId - a.mangaId);
}
