import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { ChapterOrderBy, SortOrder } from "../../api/graphql/generated/graphql";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { readProgressHistory } from "../../api/suwayomi/progressSync";
import { getProgressHeads } from "../../api/suwayomi/progressStorage";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { historyCutoffs, historyTitleKey } from "../history/historyModel";
import { loadReadingSequence } from "../reader/readingSequence";
import { normalizeChapterPolicy } from "../manga/chapterPolicy";
import { mangaReaderSettingsKey } from "../../stores/mangaReaderSettings";

export interface ReadingCandidate {
  chapterId: number; mangaId: number; title: string; chapterName: string;
  lastPageRead: number; pageCount?: number; thumbnailUrl?: string | null;
  readAt: number; isRead: boolean; isHidden?: boolean; authoritative?: boolean;
}
export function recentReading(server: ReadingCandidate[], local: ReadingCandidate[], libraryIds: Set<number>, includeCompleted = false) {
  const merged = new Map(server.map((item) => [item.chapterId, item]));
  for (const item of local) {
    const previous = merged.get(item.chapterId);
    if (previous && (previous.mangaId !== item.mangaId || previous.title !== item.title || previous.chapterName !== item.chapterName)) continue;
    if (item.authoritative || item.isHidden || !previous || item.readAt >= previous.readAt) merged.set(item.chapterId, item);
  }
  return [...merged.values()].filter((item) => libraryIds.has(item.mangaId) && (includeCompleted || !item.isRead) && !item.isHidden && item.readAt > 0).sort((a, b) => b.readAt - a.readAt)[0];
}
function timestamp(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? (number < 30_000_000_000 ? number * 1000 : number) : Date.parse(String(value)) || 0;
}

export function ContinueReading({ books }: { books: { id: number; title: string }[] }) {
  const { serverBaseUrl, mockMode, chapterPolicies } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const sdk = useMemo(() => createGraphqlClient(`${serverBaseUrl.replace(/\/$/, "")}/api/graphql`, undefined, mockMode ? "demo" : "live"), [serverBaseUrl, mockMode]);
  const server = useQuery({
    queryKey: ["history", "continue", serverBaseUrl, mockMode],
    queryFn: () => sdk.GetHistory({ filter: { lastReadAt: { greaterThan: "0" } }, order: [{ by: ChapterOrderBy.LastReadAt, byType: SortOrder.Desc }, { by: ChapterOrderBy.Id, byType: SortOrder.Desc }], first: 20 }),
    retry: false, enabled: !!serverBaseUrl,
  });
  const local = useQuery({ queryKey: ["history", "local", serverBaseUrl, mockMode], queryFn: () => readProgressHistory(progressBackend(serverBaseUrl, mockMode)), enabled: !!serverBaseUrl });
  const heads = useQuery({ queryKey: ["progress-local", progressBackend(serverBaseUrl, mockMode).key], queryFn: () => getProgressHeads(progressBackend(serverBaseUrl, mockMode)), enabled: !!serverBaseUrl });
  const candidates = useMemo(() => {
    const titles = new Map(books.map((book) => [book.id, book.title]));
    const cutoffs = historyCutoffs(local.data ?? [], mockMode);
    const remote = (server.data?.chapters.nodes ?? []).filter((chapter) => titles.get(chapter.mangaId) === chapter.manga.title && timestamp(chapter.lastReadAt) > (cutoffs.get(historyTitleKey(chapter.mangaId, chapter.manga.title))?.serverBefore ?? 0)).map((chapter) => ({ chapterId: chapter.id, mangaId: chapter.mangaId, title: chapter.manga.title, chapterName: chapter.name, thumbnailUrl: chapter.manga.thumbnailUrl, lastPageRead: chapter.lastPageRead, readAt: timestamp(chapter.lastReadAt), isRead: chapter.isRead }));
    const saved = (local.data ?? []).filter((event) => !event.hideMangaBefore && (event.isDemo ?? event.mangaTitle.startsWith("[Demo]")) === mockMode && titles.get(event.mangaId) === event.mangaTitle && (event.isHidden || event.readAt > (cutoffs.get(historyTitleKey(event.mangaId, event.mangaTitle))?.localBefore ?? 0))).map((event) => ({ chapterId: event.chapterId, mangaId: event.mangaId, title: event.mangaTitle, chapterName: event.chapterName, thumbnailUrl: event.thumbnailUrl, lastPageRead: event.lastPageRead, pageCount: event.pageCount, readAt: event.readAt, isRead: event.isRead ?? false, isHidden: event.isHidden, authoritative: mockMode || server.isError || heads.data?.some((head) => head.chapter.chapterId === event.chapterId && head.chapter.mangaId === event.mangaId && head.chapter.mangaTitle === event.mangaTitle && head.chapter.chapterName === event.chapterName && head.sequence > head.acknowledgedSequence) }));
    const ids = new Set(titles.keys());
    return { latest: recentReading(remote, saved, ids, true), unfinished: recentReading(remote, saved, ids) };
  }, [books, local.data, heads.data, mockMode, server.data, server.isError]);
  const latest = candidates.latest;
  const policy = normalizeChapterPolicy(latest ? chapterPolicies[mangaReaderSettingsKey(backend, latest.mangaId)] : undefined);
  const nextUnread = useQuery({
    queryKey: ["history", "continue-target", backend.key, latest?.chapterId, latest?.readAt, policy.sort, policy.filter, policy.scanlator],
    enabled: !!latest?.isRead, retry: false,
    queryFn: async ({ signal }) => {
      const result = await loadReadingSequence(backend, latest!.mangaId, latest!.title, latest!.chapterId, policy, signal);
      return result.chapters.find((chapter) => chapter.isRead === false) ?? null;
    },
  });
  const item: ReadingCandidate | undefined = latest?.isRead ? nextUnread.data ? {
    ...latest, chapterId: nextUnread.data.id, chapterName: nextUnread.data.name || `Chapter ${nextUnread.data.chapterNumber}`,
    lastPageRead: nextUnread.data.lastPageRead ?? 0, pageCount: nextUnread.data.pageCount, isRead: false,
  } : candidates.unfinished : latest;
  if (!item) return null;
  const cover = item.thumbnailUrl ? (item.thumbnailUrl.startsWith("http") || item.thumbnailUrl.startsWith("blob:") ? item.thumbnailUrl : `${serverBaseUrl.replace(/\/$/, "")}${item.thumbnailUrl}`) : "/placeholder-cover.svg";
  const page = Math.max(1, item.lastPageRead + 1);
  return <section className="yomi-continue" aria-label="Continue reading">
    <div className="yomi-section-heading"><h2>Continue reading</h2><Link to="/history">View history<ChevronRight aria-hidden="true" /></Link></div>
    <div className="yomi-continue-card">
      <Link to={`/reader/${item.chapterId}`} className="yomi-continue-cover" aria-label={`Resume ${item.title}`}><img src={cover} alt="" onError={(event) => { if (!event.currentTarget.src.endsWith("/placeholder-cover.svg")) event.currentTarget.src = "/placeholder-cover.svg"; }} /></Link>
      <div className="yomi-continue-copy"><Link to={`/manga/${item.mangaId}`}>{item.title.replace(/^\[Demo\]\s*/, "")}</Link><p>{item.chapterName}</p><span>Page {page}{item.pageCount && item.pageCount >= page ? ` of ${item.pageCount}` : ""}</span>{!!item.pageCount && item.pageCount >= page && <div className="yomi-progress-line" aria-hidden="true"><span style={{ width: `${Math.min(100, page / item.pageCount * 100)}%` }} /></div>}</div>
      <Link className="yomi-button yomi-button-primary" to={`/reader/${item.chapterId}`}>Continue reading<ArrowRight aria-hidden="true" /></Link>
    </div>
  </section>;
}
