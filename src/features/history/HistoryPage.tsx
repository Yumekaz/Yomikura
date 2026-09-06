import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Clock3, History, Loader2, RotateCcw } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { deleteReadingHistoryItem, getReadingHistory } from "../../api/suwayomi/offlineCache";
import { ChapterOrderBy, SortOrder } from "../../api/graphql/generated/graphql";

interface HistoryItem {
  id: string;
  name: string;
  chapterNumber: number;
  lastPageRead: number;
  pageCount?: number;
  readAt: number;
  mangaId: number;
  isLocal: boolean;
  manga: { id: number; title: string; thumbnailUrl?: string | null };
}

export function parseHistoryTimestamp(value: unknown): number {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "0") return 0;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric < 30_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const sdk = useMemo(() => createGraphqlClient(`${serverBaseUrl.replace(/\/$/, "")}/api/graphql`), [serverBaseUrl]);

  const serverHistory = useInfiniteQuery({
    queryKey: ["history", "server", serverBaseUrl],
    queryFn: ({ pageParam }) => sdk.GetHistory({
      filter: { lastReadAt: { greaterThan: "0" } },
      order: [{ by: ChapterOrderBy.LastReadAt, byType: SortOrder.Desc }],
      first: 40,
      after: pageParam,
    }),
    initialPageParam: undefined as any,
    getNextPageParam: (lastPage) => {
      const info = lastPage.chapters?.pageInfo;
      return info?.hasNextPage ? info.endCursor : undefined;
    },
    enabled: !!serverBaseUrl,
    retry: 1,
  });

  const localHistory = useQuery({
    queryKey: ["history", "local", serverBaseUrl],
    queryFn: () => getReadingHistory(serverBaseUrl),
    enabled: !!serverBaseUrl,
  });

  const items = useMemo(() => {
    const merged = new Map<string, HistoryItem>();
    for (const page of serverHistory.data?.pages ?? []) {
      for (const edge of page.chapters?.edges ?? []) {
        const node = edge?.node;
        if (!node) continue;
        const readAt = parseHistoryTimestamp(node.lastReadAt);
        if (readAt <= 0) continue;
        merged.set(String(node.id), {
          id: String(node.id), name: node.name, chapterNumber: node.chapterNumber,
          lastPageRead: node.lastPageRead, readAt, mangaId: node.mangaId, isLocal: false, manga: node.manga,
        });
      }
    }
    for (const event of localHistory.data ?? []) {
      const key = String(event.chapterId);
      const existing = merged.get(key);
      if (!existing || event.readAt >= existing.readAt) {
        merged.set(key, {
          id: key, name: event.chapterName, chapterNumber: event.chapterNumber,
          lastPageRead: event.lastPageRead, pageCount: event.pageCount, readAt: event.readAt,
          mangaId: event.mangaId, isLocal: true,
          manga: { id: event.mangaId, title: event.mangaTitle, thumbnailUrl: event.thumbnailUrl },
        });
      }
    }
    return [...merged.values()].sort((a, b) => b.readAt - a.readAt);
  }, [localHistory.data, serverHistory.data]);

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
      await deleteReadingHistoryItem(serverBaseUrl, Number(item.id));
      await sdk.UpdateChapterProgress({ input: { id: Number(item.id), patch: { lastPageRead: 0, isRead: false } } }).catch(() => null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["chapter"] });
    },
  });

  if (!serverBaseUrl) return <EmptyHistory title="Connect your library" detail="Reading activity appears after Yomikura connects to Suwayomi." />;
  if ((serverHistory.isLoading || localHistory.isLoading) && items.length === 0) return <HistorySkeleton />;
  if (items.length === 0 && serverHistory.isError) {
    return <EmptyHistory title="History is unavailable" detail={getErrorMessage(serverHistory.error)} action={<button className="yomi-button yomi-button-primary" onClick={() => serverHistory.refetch()}>Try again</button>} />;
  }
  if (items.length === 0) return <EmptyHistory title="No reading history yet" detail="Open any chapter. Online and downloaded reading will collect here automatically." />;

  return (
    <section className="yomi-page yomi-history">
      <header className="yomi-page-header">
        <div><span className="yomi-eyebrow">Reading activity</span><h1>History</h1><p>{items.length} chapter{items.length === 1 ? "" : "s"} in your recent timeline</p></div>
        {serverHistory.isError && <div className="yomi-status-chip" title={getErrorMessage(serverHistory.error)}><span className="yomi-status-dot is-warning" /> Local history shown</div>}
      </header>

      <div className="yomi-timeline">
        {groups.map((group) => (
          <section key={localDateKey(group.timestamp)} className="yomi-timeline-group">
            <div className="yomi-timeline-date"><Clock3 aria-hidden="true" /><span>{dateLabel(group.timestamp)}</span></div>
            <div className="yomi-timeline-list">
              {group.items.map((item) => {
                const cover = item.manga.thumbnailUrl ? (item.manga.thumbnailUrl.startsWith("http") ? item.manga.thumbnailUrl : `${serverBaseUrl.replace(/\/$/, "")}${item.manga.thumbnailUrl}`) : "/placeholder-cover.svg";
                const percentage = item.pageCount && item.pageCount > 0 ? Math.min(100, Math.round(((item.lastPageRead + 1) / item.pageCount) * 100)) : undefined;
                return (
                  <article key={item.id} className="yomi-history-row">
                    <Link to={`/reader/${item.id}`} className="yomi-history-cover" aria-label={`Continue ${item.manga.title}`}><img src={cover} alt="" /><span><BookOpen /></span></Link>
                    <div className="yomi-history-copy">
                      <div className="yomi-history-meta"><time dateTime={new Date(item.readAt).toISOString()}>{new Date(item.readAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{item.isLocal && <span>saved locally</span>}</div>
                      <Link to={`/manga/${item.manga.id}`} className="yomi-history-title">{item.manga.title}</Link>
                      <p>{item.name || `Chapter ${item.chapterNumber}`}</p>
                      <div className="yomi-progress-line"><span style={{ width: `${percentage ?? 4}%` }} /></div>
                      <small>{percentage !== undefined ? `${percentage}% read` : `Last page ${item.lastPageRead + 1}`}</small>
                    </div>
                    <div className="yomi-history-actions"><Link to={`/reader/${item.id}`} className="yomi-icon-button" title="Continue reading"><ChevronRight /></Link><button className="yomi-icon-button danger" title="Reset chapter progress" onClick={() => resetProgress.mutate(item)}><RotateCcw /></button></div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {serverHistory.hasNextPage && <button className="yomi-button yomi-button-secondary mx-auto" disabled={serverHistory.isFetchingNextPage} onClick={() => serverHistory.fetchNextPage()}>{serverHistory.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null} Load older activity</button>}
    </section>
  );
}

function EmptyHistory({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <div className="yomi-empty-state"><div className="yomi-empty-icon"><History /></div><span className="yomi-eyebrow">Reading timeline</span><h1>{title}</h1><p>{detail}</p>{action}</div>;
}

function HistorySkeleton() {
  return <div className="yomi-page" aria-label="Loading reading history"><div className="yomi-page-header"><div><span className="yomi-skeleton w-24" /><span className="yomi-skeleton mt-3 h-10 w-48" /></div></div><div className="space-y-3">{[0, 1, 2, 3].map((item) => <div key={item} className="yomi-skeleton h-24 w-full rounded-2xl" />)}</div></div>;
}
