import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Clock3, Play, BookOpen } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { ChapterOrderBy, SortOrder } from "../../api/graphql/generated/graphql";

interface UpdateItem {
  id: string;
  name: string;
  chapterNumber: number;
  uploadDate: string;
  scanlator?: string | null;
  mangaId: number;
  manga: {
    id: number;
    title: string;
    thumbnailUrl?: string | null;
  };
}

export default function UpdatesPage() {
  const { serverBaseUrl } = useSettingsStore();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["updates", serverBaseUrl],
    queryFn: () =>
      sdk.GetUpdates({
        filter: {
          inLibrary: { equalTo: true },
        },
        order: [
          {
            by: ChapterOrderBy.UploadDate,
            byType: SortOrder.Desc,
          },
        ],
        first: 100,
      }),
    enabled: !!serverBaseUrl,
  });

  const updates = useMemo(() => {
    if (!data?.chapters?.edges) return [];
    return data.chapters.edges
      .map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node != null) as unknown as UpdateItem[];
  }, [data]);

  // Group updates by date
  const groupedUpdates = useMemo(() => {
    const groups: Record<string, UpdateItem[]> = {};
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;

    updates.forEach((item) => {
      const time = parseInt(item.uploadDate);
      if (isNaN(time)) {
        const key = "Unknown Date";
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
        return;
      }

      let key = "Older";
      if (time >= startOfToday) {
        key = "Today";
      } else if (time >= startOfYesterday) {
        key = "Yesterday";
      } else if (time >= startOfWeek) {
        key = "This Week";
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return groups;
  }, [updates]);

  if (!serverBaseUrl) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <Clock3 className="mb-4 h-12 w-12 opacity-50" />
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
        <p className="text-red-400 font-semibold mb-2">Failed to load updates</p>
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

  if (updates.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <Clock3 className="mb-4 h-12 w-12 opacity-50" />
        <p className="text-lg text-slate-300">No recent updates</p>
        <p className="text-sm mt-1">Updates for manga in your library will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <Clock3 className="h-6 w-6 text-yomi-jade" />
        Recent Updates
      </h1>

      <div className="space-y-8">
        {["Today", "Yesterday", "This Week", "Older"].map((groupName) => {
          const groupItems = groupedUpdates[groupName] || [];
          if (groupItems.length === 0) return null;

          return (
            <div key={groupName} className="space-y-4">
              <h2 className="text-xs font-semibold text-yomi-jade uppercase tracking-wider border-b border-white/5 pb-2">
                {groupName}
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
                            {new Date(parseInt(item.uploadDate)).toLocaleDateString()}
                          </span>
                          {item.scanlator && (
                            <>
                              <span>•</span>
                              <span className="truncate">{item.scanlator}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          to={`/reader/${item.id}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-300 hover:bg-yomi-jade hover:text-ink-950 transition"
                          title="Read Chapter"
                        >
                          <Play className="h-4 w-4 fill-current ml-0.5" />
                        </Link>
                        <Link
                          to={`/manga/${item.manga.id}`}
                          className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-300 hover:bg-white/10 transition"
                          title="Manga Details"
                        >
                          <BookOpen className="h-4 w-4" />
                        </Link>
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
