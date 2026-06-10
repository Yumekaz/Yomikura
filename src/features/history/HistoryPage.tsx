import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, History, Play, RotateCcw, BookOpen } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { ChapterOrderBy, SortOrder } from "../../api/graphql/generated/graphql";

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

export default function HistoryPage() {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["history", serverBaseUrl],
    queryFn: () =>
      sdk.GetHistory({
        filter: {
          lastReadAt: { isNull: false },
        },
        order: [
          {
            by: ChapterOrderBy.LastReadAt,
            byType: SortOrder.Desc,
          },
        ],
        first: 100,
      }),
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
    if (!data?.chapters?.edges) return [];
    return data.chapters.edges
      .map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node != null) as unknown as HistoryItem[];
  }, [data]);

  // Group history items by read date
  const groupedHistory = useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {};

    historyItems.forEach((item) => {
      const rawTime = parseInt(item.lastReadAt);
      const time = !isNaN(rawTime) && rawTime < 30000000000 ? rawTime * 1000 : rawTime;
      if (isNaN(time)) {
        const key = "Unknown Date";
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
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
        <p>Server not configured.</p>
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
          Retry
        </button>
      </div>
    );
  }

  if (historyItems.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <History className="mb-4 h-12 w-12 opacity-50" />
        <p className="text-lg text-slate-300">No reading history</p>
        <p className="text-sm mt-1">Chapters you start reading will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <History className="h-6 w-6 text-yomi-jade" />
        Reading History
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
                            {new Date(parseInt(item.lastReadAt) < 30000000000 ? parseInt(item.lastReadAt) * 1000 : parseInt(item.lastReadAt)).toLocaleTimeString([], {
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
    </div>
  );
}
