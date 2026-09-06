import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Play, Pause, Trash2, CheckCircle2, RefreshCw } from "lucide-react";
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
  const { serverBaseUrl, connectionStatus, mockMode } = useSettingsStore();
  const queryClient = useQueryClient();
  const isUnconnected = (connectionStatus === "error" || connectionStatus === "disconnected") && !mockMode;

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch Download Queue and Downloader state
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["downloads", serverBaseUrl],
    queryFn: () => sdk.GetDownloadStatus(),
    enabled: !!serverBaseUrl && !isUnconnected,
    refetchInterval: isUnconnected ? undefined : 3000, // Poll every 3 seconds while active
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
      <div className="yomi-workspace"><div className="yomi-route-empty"><div>
        <Download /><h2>Downloads need a local engine</h2><p>Server not configured.</p>
      </div></div></div>
    );
  }

  if (isUnconnected) {
    return (
      <div className="yomi-workspace"><div className="yomi-route-empty"><div>
        <Download /><h2>Downloads queue offline</h2>
        <p>The live queue returns when Suwayomi is connected. Your completed local chapters stay available from the library.</p>
        <div className="mt-6 rounded-xl border border-white/5 bg-ink-900 p-5 text-left text-xs space-y-3">
          <p className="font-semibold text-slate-200 uppercase tracking-wider text-[10px]">Reading completed downloads</p>
          <ul className="list-disc list-inside text-slate-400 space-y-1.5 leading-relaxed">
            <li>Go to the <strong className="text-slate-300">Library</strong> tab in the sidebar.</li>
            <li>Click on any downloaded manga card in the grid (e.g. Chainsaw Man or Solo Leveling).</li>
            <li>Click on the chapter you saved (marked with a green cached badge).</li>
            <li>View all offline chapters registry under <strong className="text-slate-300">Settings &rarr; Offline</strong>.</li>
          </ul>
        </div></div></div></div>
    );
  }

  if (isLoading) {
    return (
      <div className="yomi-workspace flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="yomi-workspace"><div className="yomi-route-empty"><div>
        <Download /><h2>Downloads could not load</h2><p>{getErrorMessage(error)}</p>
        <button onClick={() => refetch()} className="yomi-button yomi-button-primary mt-5"><RefreshCw />Retry</button>
      </div></div></div>
    );
  }

  return (
    <div className="yomi-workspace space-y-7">
      <div className="yomi-workspace-head">
        <div>
          <span className="yomi-eyebrow">Offline reading</span>
          <h1 className="yomi-workspace-title"><Download />Download queue</h1>
          <p className="yomi-workspace-subtitle">Keep the local reader ready. This queue is owned by your Suwayomi engine.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {downloaderState === "STARTED" ? (
            <button
              onClick={() => stopDownloader()}
              disabled={isActionPending}
              className="yomi-button yomi-button-secondary text-red-200 disabled:opacity-50"
            >
              <Pause className="h-4 w-4" />
              Pause Downloader
            </button>
          ) : (
            <button
              onClick={() => startDownloader()}
              disabled={isActionPending}
              className="yomi-button yomi-button-primary disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-current" />
              Resume Downloader
            </button>
          )}

          <button
            onClick={() => clearDownloader()}
            disabled={isActionPending || queue.length === 0}
            className="yomi-button yomi-button-secondary disabled:opacity-50"
            title="Clear Queue"
          >
            Clear Completed
          </button>
        </div>
      </div>

      <div className="yomi-commandbar">
        <div className="yomi-commandbar-copy"><span className={`status ${downloaderState === "STARTED" ? "" : "is-idle"}`} />
          <div><strong>{downloaderState === "STARTED" ? "Downloader is working" : "Downloader is paused"}</strong><span>Suwayomi queue · {queue.length} item{queue.length === 1 ? "" : "s"}</span></div>
        </div>
        <span className={`yomi-chip ${downloaderState === "STARTED" ? "is-live" : ""}`}>{downloaderState}</span>
      </div>

      {/* Queue List */}
      {queue.length === 0 ? (
        <div className="yomi-route-empty"><div>
          <CheckCircle2 />
          <div>
            <h2>All downloads completed</h2>
            <p>Start a chapter download from a manga’s chapter list. It will remain available from your library when you are offline.</p>
          </div>
        </div>
        </div>
      ) : (
        <div className="yomi-surface">
          {queue.map((item) => {
            let coverUrl = "/placeholder-cover.svg";
            if (item.manga.thumbnailUrl) {
              coverUrl = item.manga.thumbnailUrl.startsWith("http")
                ? item.manga.thumbnailUrl
                : `${serverBaseUrl.replace(/\/$/, "")}${item.manga.thumbnailUrl}`;
            }

            return (
              <div
                key={item.chapter.id}
                className="yomi-surface-row"
              >
                {/* Cover */}
                <Link
                  to={`/manga/${item.manga.id}`}
                  className="yomi-cover-sm"
                >
                  <img src={coverUrl} alt={item.manga.title} className="h-full w-full object-cover" />
                </Link>

                {/* Info & Progress */}
                <div className="yomi-row-copy">
                  <div className="flex items-center justify-between gap-4">
                    <Link
                      to={`/manga/${item.manga.id}`}
                      className="yomi-row-title"
                    >
                      {item.manga.title}
                    </Link>
                    <span className={`yomi-chip ${item.state === "DOWNLOADING" ? "is-live" : ""}`}>
                      {item.state}
                    </span>
                  </div>

                  <p>{item.chapter.name}</p>

                  {/* Progress Bar */}
                  <div className="yomi-progress-line mt-3 w-full">
                    <div
                      className="bg-[rgb(var(--yomi-signature))] h-full rounded-full transition-[width] duration-300"
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
                  className="yomi-utility-button danger disabled:opacity-50"
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
