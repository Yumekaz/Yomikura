import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, History, Play, RotateCcw } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { ChapterOrderBy, SortOrder } from "../../api/graphql/generated/graphql";
import { useTranslation } from "../../hooks/useTranslation";

interface HistoryItem {
  id: string;
  name: string;
  chapterNumber: number;
  lastPageRead: number;
  lastReadAt: string;
  scanlator?: string | null;
  mangaId: number;
  manga: {
    id: number;
    title: string;
    thumbnailUrl?: string | null;
  };
}

function parseHistoryTimestamp(value: string): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "0") return 0;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric < 30_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function HistoryPage() {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["history", serverBaseUrl],
    queryFn: ({ pageParam }) =>
      sdk.GetHistory({
        filter: {
          // Suwayomi represents unread/default history metadata as "0", not null.
          lastReadAt: { greaterThan: "0" },
        },
        order: [
          {
            by: ChapterOrderBy.LastReadAt,
            byType: SortOrder.Desc,
          },
        ],
        first: 30,
        after: pageParam,
      }),
    initialPageParam: undefined as any,
    getNextPageParam: (lastPage) => {
      const pageInfo = lastPage.chapters?.pageInfo;
      return pageInfo?.hasNextPage ? pageInfo.endCursor : undefined;
    },
    enabled: !!serverBaseUrl,
  });

  // Suwayomi exposes progress reset here, not a true delete-history action.
  const { mutate: clearItemProgress } = useMutation({
    mutationFn: (chapterId: string) =>
      sdk.UpdateChapterProgress({
        input: {
          id: parseInt(chapterId),
          patch: {
            lastPageRead: 0,
            isRead: false,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["chapter"] });
    },
  });

  const historyItems = useMemo(() => {
    if (!data?.pages) return [];
    const seenChapterIds = new Set<string>();
    return data.pages.flatMap((page) => {
      if (!page?.chapters?.edges) return [];
      return page.chapters.edges
        .map((edge) => edge?.node)
        .filter((node): node is NonNullable<typeof node> => {
          if (!node) return false;
          const chapterId = String(node.id);
          if (seenChapterIds.has(chapterId)) return false;
          seenChapterIds.add(chapterId);
          return true;
        });
    }) as unknown as HistoryItem[];
  }, [data]);

  // Group history items by read date
  const groupedHistory = useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {};

    historyItems.forEach((item) => {
      const time = parseHistoryTimestamp(item.lastReadAt);
      
      // Banish Unix Epoch (0 / 1970-01-01) timestamps which represent unread/default metadata states
      if (isNaN(time) || time <= 0) {
        return;
      }

      const dateStr = new Date(time).toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(item);
    });

    return groups;
  }, [historyItems]);

  const sortedGroupKeys = useMemo(() => {
    return Object.keys(groupedHistory).sort((a, b) => {
      if (a === "Unknown Date") return 1;
      if (b === "Unknown Date") return -1;
      
      const timeA = new Date(a).getTime();
      const timeB = new Date(b).getTime();
      return timeB - timeA; // Descending order
    });
  }, [groupedHistory]);

  if (!serverBaseUrl) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <History className="mb-4 h-12 w-12 opacity-50" />
        <p>{t("no_server")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400 text-center max-w-md mx-auto p-4">
        <p className="text-red-400 font-semibold mb-2">Failed to load history</p>
        <p className="text-sm mb-4">{getErrorMessage(error)}</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-yomi-jade px-4 py-2 font-medium text-ink-950 hover:bg-yomi-jade/90"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (Object.keys(groupedHistory).length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <History className="mb-4 h-12 w-12 opacity-50" />
        <p className="text-lg text-slate-300">{t("no_history")}</p>
        <p className="text-sm mt-1">Chapters you start reading will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <History className="h-6 w-6 text-yomi-jade" />
        {t("history")}
      </h1>

      <div className="space-y-8">
        {sortedGroupKeys.map((groupDate) => {
          const groupItems = groupedHistory[groupDate] || [];

          return (
            <div key={groupDate} className="space-y-4">
              <h2 className="text-xs font-semibold text-yomi-jade uppercase tracking-wider border-b border-white/5 pb-2">
                {groupDate}
              </h2>
              <div className="flex flex-col gap-3">
                {groupItems.map((item) => {
                  let coverUrl = "/placeholder-cover.svg";
                  if (item.manga.thumbnailUrl) {
                    coverUrl = item.manga.thumbnailUrl.startsWith("http")
                      ? item.manga.thumbnailUrl
                      : `${serverBaseUrl.replace(/\/$/, "")}${item.manga.thumbnailUrl}`;
                  }

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 rounded-xl border border-white/5 bg-ink-900 p-3 sm:p-4 hover:border-white/10 transition"
                    >
                      <Link
                        to={`/manga/${item.manga.id}`}
                        className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-md bg-ink-950"
                      >
                        <img src={coverUrl} alt={item.manga.title} className="h-full w-full object-cover" />
                      </Link>

                      <div className="flex flex-col flex-1 min-w-0">
                        <Link
                          to={`/manga/${item.manga.id}`}
                          className="font-medium text-slate-200 hover:text-yomi-jade transition truncate text-sm sm:text-base"
                        >
                          {item.manga.title}
                        </Link>
                        <span className="text-xs sm:text-sm text-slate-300 truncate mt-0.5">
                          {item.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-500 mt-1">
                          <span>
                            Last read page: {item.lastPageRead + 1}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(parseHistoryTimestamp(item.lastReadAt)).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          to={`/reader/${item.id}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-300 hover:bg-yomi-jade hover:text-ink-950 transition"
                          title="Resume Reading"
                        >
                          <Play className="h-4 w-4 fill-current ml-0.5" />
                        </Link>
                        <button
                          onClick={() => {
                            if (window.confirm("Reset progress for this chapter? Suwayomi may keep it in history until the backend clears last-read metadata.")) {
                              clearItemProgress(item.id);
                            }
                          }}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-red-400 hover:bg-red-500/10 transition"
                          title="Reset progress"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 px-6 py-2.5 text-xs font-bold text-slate-200 transition disabled:opacity-50"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-4.5 w-4.5 animate-spin text-yomi-jade" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
