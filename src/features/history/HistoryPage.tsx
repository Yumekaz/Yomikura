import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Clock3, History, Loader2, RotateCcw, Search, SkipForward, Trash2 } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { hideMangaReadingHistory } from "../../api/suwayomi/offlineCache";
import { ChapterOrderBy, SortOrder } from "../../api/graphql/generated/graphql";
import { invalidateChapterState } from "../../api/suwayomi/chapterState";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { isCurrentProgressBackend, readProgressHistory, writeChapterProgress } from "../../api/suwayomi/progressSync";
import { loadReadingSequence } from "../reader/readingSequence";
import { normalizeChapterPolicy } from "../manga/chapterPolicy";
import { mangaReaderSettingsKey } from "../../stores/mangaReaderSettings";
import { ReadingSpirit } from "../../components/Brand";
import { mergeReadingHistory, type HistoryItem } from "./historyModel";
export { parseHistoryTimestamp, shouldShowReadingEvent } from "./historyModel";

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(timestamp: number): string {
  const today = new Date();
  const target = new Date(timestamp);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const daysAgo = Math.round((startToday - startTarget) / 86_400_000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return target.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function HistoryPage() {
  const { confirm, notify } = useFeedback();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [openingNextId, setOpeningNextId] = useState<string | null>(null);
  const [pageBudget, setPageBudget] = useState(5);
  const [titleTarget, setTitleTarget] = useState(20);
  const { serverBaseUrl, mockMode, chapterPolicies } = useSettingsStore();
  const queryClient = useQueryClient();
  const sdk = useMemo(() => createGraphqlClient(`${serverBaseUrl.replace(/\/$/, "")}/api/graphql`, undefined, mockMode ? "demo" : "live"), [serverBaseUrl, mockMode]);

  const serverHistory = useInfiniteQuery({
    queryKey: ["history", "server", serverBaseUrl, mockMode],
    queryFn: async ({ pageParam, signal }) => {
      const result = await sdk.GetHistory({
      filter: { lastReadAt: { greaterThan: "0" } },
      order: [{ by: ChapterOrderBy.LastReadAt, byType: SortOrder.Desc }, { by: ChapterOrderBy.Id, byType: SortOrder.Desc }],
      first: 40,
      after: pageParam,
      }, undefined, signal);
      const info = result.chapters.pageInfo;
      if (info.hasNextPage && (!info.endCursor || info.endCursor === pageParam || !result.chapters.nodes.length)) throw new Error("History pagination did not advance. Try loading older activity again.");
      return result;
    },
    initialPageParam: undefined as any,
    getNextPageParam: (lastPage) => {
      const info = lastPage.chapters?.pageInfo;
      return info?.hasNextPage ? info.endCursor : undefined;
    },
    enabled: !!serverBaseUrl,
    retry: 1,
  });

  const localHistory = useQuery({
    queryKey: ["history", "local", serverBaseUrl, mockMode],
    queryFn: () => readProgressHistory(progressBackend(serverBaseUrl, mockMode)),
    enabled: !!serverBaseUrl,
  });

  const entries = useMemo(() => mergeReadingHistory(
    serverHistory.data?.pages.flatMap((page) => page.chapters?.nodes ?? []) ?? [], localHistory.data ?? [], mockMode,
  ), [localHistory.data, mockMode, serverHistory.data]);
  const items = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter((item) => !query || `${item.manga.title} ${item.name}`.toLowerCase().includes(query));
  }, [entries, searchQuery]);

  // A chapter-based backend page can contain one comic many times. Fill a
  // useful title list without an unbounded background crawl.
  useEffect(() => {
    if (entries.length < titleTarget && (serverHistory.data?.pages.length ?? 0) < pageBudget
      && serverHistory.hasNextPage && !serverHistory.isFetchingNextPage && !serverHistory.isFetchNextPageError) void serverHistory.fetchNextPage();
  }, [entries.length, pageBudget, titleTarget, serverHistory.data?.pages.length, serverHistory.hasNextPage, serverHistory.isFetchingNextPage, serverHistory.isFetchNextPageError, serverHistory.fetchNextPage]);

  const hideHistory = useMutation({
    mutationFn: async (item: HistoryItem) => {
      return hideMangaReadingHistory(serverBaseUrl, {
      chapterId: Number(item.id), chapterName: item.name, chapterNumber: item.chapterNumber,
      mangaId: item.mangaId, mangaTitle: item.manga.title, thumbnailUrl: item.manga.thumbnailUrl,
      lastPageRead: item.lastPageRead, pageCount: item.pageCount ?? 0, isRead: false,
      isDemo: mockMode,
      }, item.readAt);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history", "local", serverBaseUrl, mockMode] }),
    onError: () => notify("The history change could not be saved on this device. Check storage and retry.", "error"),
  });

  const groups = useMemo(() => {
    const result = new Map<string, { timestamp: number; items: HistoryItem[] }>();
    for (const item of items) {
      const key = localDateKey(item.readAt);
      const group = result.get(key) ?? { timestamp: item.readAt, items: [] };
      group.items.push(item);
      result.set(key, group);
    }
    return [...result.values()].sort((a, b) => b.timestamp - a.timestamp);
  }, [items]);

  const resetProgress = useMutation({
    mutationFn: async (item: HistoryItem) => {
      await writeChapterProgress(progressBackend(serverBaseUrl, mockMode), Number(item.id), { lastPageRead: 0, isRead: false }, { hideHistory: true,
        fallback: { chapterId: Number(item.id), chapterName: item.name, chapterNumber: item.chapterNumber, mangaId: item.mangaId, mangaTitle: item.manga.title, pageCount: item.pageCount ?? 0 },
      });
    },
    onSuccess: () => {
      void invalidateChapterState(queryClient);
    },
    onError: () => notify("The reset could not be saved on this device. Check storage and retry.", "error"),
  });

  const openNextChapter = async (item: HistoryItem, resume = false) => {
    const backend = progressBackend(serverBaseUrl, mockMode);
    setOpeningNextId(item.id);
    try {
      const policy = normalizeChapterPolicy(chapterPolicies[mangaReaderSettingsKey(backend, item.mangaId)]);
      const { chapters } = await loadReadingSequence(backend, item.mangaId, item.manga.title, Number(item.id), policy);
      if (!isCurrentProgressBackend(backend)) return;
      const index = chapters.findIndex((chapter) => chapter.id === Number(item.id));
      const next = resume ? chapters.find((chapter) => chapter.isRead === false) : index >= 0 ? chapters[index + 1] : undefined;
      if (!next) { notify(resume ? "You’re caught up with this comic. Open its details to read an earlier chapter again." : "No next chapter matches this title's order and filters.", "info"); return; }
      navigate(`/reader/${next.id}`);
    } catch (error) {
      if (isCurrentProgressBackend(backend)) notify(error instanceof Error && !("response" in error) ? error.message : getErrorMessage(error), "error");
    } finally {
      setOpeningNextId(null);
    }
  };

  if (!serverBaseUrl) return <EmptyHistory title="Connect your library" detail="Reading activity appears after Yomikura connects to Suwayomi." />;
  if ((serverHistory.isLoading || localHistory.isLoading) && entries.length === 0) return <HistorySkeleton />;
  if (entries.length === 0 && serverHistory.isError) {
    return <EmptyHistory title="History is unavailable" detail="Check your connection and try again." technical={getErrorMessage(serverHistory.error)} action={<button className="yomi-button yomi-button-primary" onClick={() => serverHistory.refetch()}>Try again</button>} />;
  }
  if (entries.length === 0 && !serverHistory.hasNextPage) return <EmptyHistory title="No reading history yet" detail="Open any chapter. Each comic appears here once, where you last stopped." />;

  return (
    <section className="yomi-page yomi-history">
      <header className="yomi-page-header">
        <div><span className="yomi-eyebrow">Reading activity</span><h1>History</h1><p>{items.length} comic{items.length === 1 ? "" : "s"} recently read</p></div>
        <div className="flex w-full max-w-xs flex-col gap-2"><label className="yomi-search !w-full"><Search aria-hidden="true" /><span className="sr-only">Search reading history</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search history…" /></label>{serverHistory.isError && <div className="yomi-status-chip" title={getErrorMessage(serverHistory.error)}><span className="yomi-status-dot is-warning" /> Local history shown</div>}</div>
      </header>

      <div className="yomi-timeline">
        {items.length === 0 && <div className="yomi-route-empty"><h2>No comics match your search</h2><p>Try a comic title or its most recently read chapter.</p><button className="yomi-button yomi-button-secondary" onClick={() => setSearchQuery("")}>Clear search</button></div>}
        {groups.map((group) => (
          <section key={localDateKey(group.timestamp)} className="yomi-timeline-group">
            <div className="yomi-timeline-date"><Clock3 aria-hidden="true" /><span>{dateLabel(group.timestamp)}</span></div>
            <div className="yomi-timeline-list">
              {group.items.map((item) => {
                const cover = item.manga.thumbnailUrl ? (item.manga.thumbnailUrl.startsWith("http") ? item.manga.thumbnailUrl : `${serverBaseUrl.replace(/\/$/, "")}${item.manga.thumbnailUrl}`) : "/placeholder-cover.svg";
                const percentage = item.isRead ? 100 : item.pageCount && item.pageCount > 0 ? Math.min(100, Math.round(((item.lastPageRead + 1) / item.pageCount) * 100)) : undefined;
                return (
                  <article key={item.mangaId} className="yomi-history-row">
                    {item.isRead ? <button type="button" className="yomi-history-cover" disabled={openingNextId === item.id} onClick={() => void openNextChapter(item, true)} aria-label={`Continue ${item.manga.title}`}><img src={cover} alt="" /><span><BookOpen /></span></button> : <Link to={`/reader/${item.id}`} className="yomi-history-cover" aria-label={`Continue ${item.manga.title}`}><img src={cover} alt="" /><span><BookOpen /></span></Link>}
                    <div className="yomi-history-copy">
                      <div className="yomi-history-meta"><time dateTime={new Date(item.readAt).toISOString()}>{new Date(item.readAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{item.isLocal && <span>saved locally</span>}</div>
                      <Link to={`/manga/${item.manga.id}`} className="yomi-history-title">{item.manga.title}</Link>
                      <p>{item.name || `Chapter ${item.chapterNumber}`}</p>
                      {percentage !== undefined && <div className="yomi-progress-line"><span style={{ width: `${percentage}%` }} /></div>}
                      <small>{item.isRead ? "Chapter read" : percentage !== undefined ? `${percentage}% read` : `Last page ${item.lastPageRead + 1}`}</small>
                    </div>
                    <div className="yomi-history-actions">
                      {item.isRead ? <button type="button" className="yomi-icon-button" title="Continue reading" disabled={openingNextId === item.id} aria-label={`Continue ${item.manga.title}`} onClick={() => void openNextChapter(item, true)}>{openingNextId === item.id ? <Loader2 className="animate-spin" /> : <ChevronRight />}</button> : <Link to={`/reader/${item.id}`} className="yomi-icon-button" title="Continue reading" aria-label={`Continue ${item.manga.title}`}><ChevronRight /></Link>}
                      <button className="yomi-icon-button" title="Open next chapter" aria-label={`Open next chapter after ${item.name}`} disabled={openingNextId === item.id} onClick={() => void openNextChapter(item)}><SkipForward /></button>
                      <button className="yomi-icon-button danger" title="Remove from history" aria-label={`Remove ${item.manga.title} from history`} onClick={async () => { if (await confirm({ title: "Remove from history?", detail: `Remove “${item.manga.title}” from recent activity on this device. Your reading progress will be kept.`, confirmLabel: "Remove", danger: true })) hideHistory.mutate(item); }}><Trash2 /></button>
                      <button className="yomi-icon-button danger" title="Reset chapter progress" aria-label={`Reset progress for ${item.name}`} onClick={async () => { if (await confirm({ title: "Reset reading progress?", detail: `This removes “${item.name}” from your recent activity and resets its saved position.`, confirmLabel: "Reset progress", danger: true })) resetProgress.mutate(item); }}><RotateCcw /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {serverHistory.hasNextPage && <button className="yomi-button yomi-button-secondary mx-auto" disabled={serverHistory.isFetchingNextPage} onClick={() => { setPageBudget((value) => value + 5); setTitleTarget((value) => value + 20); void serverHistory.fetchNextPage(); }}>{serverHistory.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null} Load older activity</button>}
    </section>
  );
}

function EmptyHistory({ title, detail, technical, action }: { title: string; detail: string; technical?: string; action?: React.ReactNode }) {
  return <div className="yomi-empty-state"><ReadingSpirit mood="resting" className="yomi-empty-spirit" /><h1>{title}</h1><p>{detail}</p>{action ?? <Link className="yomi-button yomi-button-primary" to="/library">Open library</Link>}{technical && <details className="yomi-error-details mt-5"><summary>Technical details</summary><pre>{technical}</pre></details>}</div>;
}

function HistorySkeleton() {
  return <div className="yomi-page" aria-label="Loading reading history"><div className="yomi-page-header"><div><span className="yomi-skeleton w-24" /><span className="yomi-skeleton mt-3 h-10 w-48" /></div></div><div className="space-y-3">{[0, 1, 2, 3].map((item) => <div key={item} className="yomi-skeleton h-24 w-full rounded-2xl" />)}</div></div>;
}
