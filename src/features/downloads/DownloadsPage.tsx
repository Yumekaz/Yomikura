import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Play, Pause, Trash2, CheckCircle2 } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";

interface DownloadItem {
  position: number;
  progress: number;
  state: "PENDING" | "DOWNLOADING" | "COMPLETED" | "ERROR" | string;
  tries: number;
  chapter: {
    id: string;
    name: string;
    chapterNumber: number;
  };
  manga: {
    id: string;
    title: string;
    thumbnailUrl?: string | null;
  };
}

export default function DownloadsPage() {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch Download Queue and Downloader state
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["downloads", serverBaseUrl],
    queryFn: () => sdk.GetDownloadStatus(),
    enabled: !!serverBaseUrl,
    refetchInterval: 3000, // Poll every 3 seconds while active
  });

  const downloaderState = data?.downloadStatus?.state || "STOPPED";
  const queue = (data?.downloadStatus?.queue || []) as unknown as DownloadItem[];

  // Mutations to control downloader
  const { mutate: startDownloader, isPending: starting } = useMutation({
    mutationFn: () => sdk.StartDownloader({ input: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
  });

  const { mutate: stopDownloader, isPending: stopping } = useMutation({
    mutationFn: () => sdk.StopDownloader({ input: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
  });

  const { mutate: clearDownloader, isPending: clearing } = useMutation({
    mutationFn: () => sdk.ClearDownloader({ input: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
  });

  const { mutate: dequeueChapter, isPending: dequeuing } = useMutation({
    mutationFn: (chapterId: string) =>
      sdk.DequeueChapterDownload({
        input: { id: parseInt(chapterId) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
  });

  const isActionPending = starting || stopping || clearing || dequeuing;

  if (!serverBaseUrl) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <Download className="mb-4 h-12 w-12 opacity-50" />
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
        <p className="text-red-400 font-semibold mb-2">Failed to load downloads</p>
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

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Download className="h-6 w-6 text-yomi-jade" />
            Download Queue
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Expose and manage the Suwayomi server downloader status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {downloaderState === "STARTED" ? (
            <button
              onClick={() => stopDownloader()}
              disabled={isActionPending}
              className="flex items-center gap-2 rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/30 transition disabled:opacity-50"
            >
              <Pause className="h-4 w-4" />
              Pause Downloader
            </button>
          ) : (
            <button
              onClick={() => startDownloader()}
              disabled={isActionPending}
              className="flex items-center gap-2 rounded-lg bg-yomi-jade px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-yomi-jade/90 transition disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-current" />
              Resume Downloader
            </button>
          )}

          <button
            onClick={() => clearDownloader()}
            disabled={isActionPending || queue.length === 0}
            className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
            title="Clear Queue"
          >
            Clear Completed
          </button>
        </div>
      </div>

      {/* Downloader State Banner */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${
        downloaderState === "STARTED" 
          ? "border-yomi-jade/20 bg-yomi-jade/5 text-yomi-mint" 
          : "border-slate-500/20 bg-white/[0.02] text-slate-400"
      }`}>
        <div className="flex items-center gap-2 text-sm">
          <div className={`h-2.5 w-2.5 rounded-full ${downloaderState === "STARTED" ? "bg-yomi-jade animate-pulse" : "bg-slate-500"}`} />
          <span>Downloader Status: <strong className="font-semibold uppercase">{downloaderState}</strong></span>
        </div>
        <span className="text-xs">{queue.length} items in queue</span>
      </div>

      {/* Queue List */}
      {queue.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-ink-900/50 p-12 text-center text-slate-400 space-y-4">
          <CheckCircle2 className="h-12 w-12 text-yomi-jade/60 mx-auto" />
          <div>
            <p className="text-lg text-slate-300">All downloads completed</p>
            <p className="text-sm mt-1">Trigger chapter downloads from Manga Detail Pages.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {queue.map((item) => {
            let coverUrl = "/placeholder-cover.jpg";
            if (item.manga.thumbnailUrl) {
              coverUrl = item.manga.thumbnailUrl.startsWith("http")
                ? item.manga.thumbnailUrl
                : `${serverBaseUrl.replace(/\/$/, "")}${item.manga.thumbnailUrl}`;
            }

            return (
              <div
                key={item.chapter.id}
                className="flex items-center gap-4 rounded-xl border border-white/5 bg-ink-900 p-3 sm:p-4 transition"
              >
                {/* Cover */}
                <Link
                  to={`/manga/${item.manga.id}`}
                  className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-md bg-ink-950"
                >
                  <img src={coverUrl} alt={item.manga.title} className="h-full w-full object-cover" />
                </Link>

                {/* Info & Progress */}
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <Link
                      to={`/manga/${item.manga.id}`}
                      className="font-medium text-slate-200 hover:text-yomi-jade transition truncate text-sm sm:text-base"
                    >
                      {item.manga.title}
                    </Link>
                    <span className={`text-xs font-semibold rounded px-1.5 py-0.5 ${
                      item.state === "DOWNLOADING" ? "bg-yomi-jade/20 text-yomi-jade" :
                      item.state === "ERROR" ? "bg-red-500/20 text-red-400" :
                      "bg-white/5 text-slate-400"
                    }`}>
                      {item.state}
                    </span>
                  </div>

                  <span className="text-xs sm:text-sm text-slate-300 truncate mt-0.5">
                    {item.chapter.name}
                  </span>

                  {/* Progress Bar */}
                  <div className="w-full bg-white/5 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div
                      className="bg-yomi-jade h-full rounded-full transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-2">
                    <span>Progress: {Math.round(item.progress)}%</span>
                    {item.tries > 0 && <span>Tries: {item.tries}</span>}
                    {item.position > 0 && <span>Position: #{item.position}</span>}
                  </div>
                </div>

                {/* Dequeue Button */}
                <button
                  onClick={() => dequeueChapter(item.chapter.id)}
                  disabled={isActionPending}
                  className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition disabled:opacity-50 shrink-0"
                  title="Remove from Queue"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
