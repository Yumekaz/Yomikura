import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Play, Pause, Trash2, CheckCircle2, RefreshCw, BookOpen, X } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { useDownloadStore } from "../../stores/useDownloadStore";
import type { CachedChapter } from "../../api/suwayomi/offlineCache";

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
  const { confirm } = useFeedback();
  const { cachedChapters, activeDownloads, loadCachedChapters, deleteChapter, cancelDownload, storageUsage } = useDownloadStore();
  const { serverBaseUrl, connectionStatus, mockMode } = useSettingsStore();
  const queryClient = useQueryClient();
  const isUnconnected = (connectionStatus === "error" || connectionStatus === "disconnected") && !mockMode;

  useEffect(() => { void loadCachedChapters(); }, [loadCachedChapters, serverBaseUrl]);

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
      <div className="yomi-workspace space-y-7">
        <DownloadsHeader savedCount={cachedChapters.length} storageUsage={storageUsage} />
        <SavedDownloads chapters={cachedChapters} activeDownloads={activeDownloads} onCancel={cancelDownload} onDelete={async (chapter) => { if (await confirm({ title: "Remove saved chapter?", detail: `Delete the offline pages for “${chapter.name}”?`, confirmLabel: "Remove download", danger: true })) await deleteChapter(chapter.id); }} />
        <div className="yomi-commandbar"><div className="yomi-commandbar-copy"><span className="status is-idle" /><div><strong>Server queue unavailable</strong><span>Reconnect Suwayomi to resume queued downloads. Saved chapters remain readable.</span></div></div></div>
      </div>
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
        <div><span className="yomi-eyebrow">Offline reading</span><h1 className="yomi-workspace-title"><Download />Downloads</h1><p className="yomi-workspace-subtitle">Saved chapters and server activity, together in one workspace.</p></div>
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
            onClick={async () => {
              if (await confirm({ title: "Clear the server queue?", detail: "This asks Suwayomi to remove every item from its active download queue, including unfinished items.", confirmLabel: "Clear queue", danger: true })) clearDownloader();
            }}
            disabled={isActionPending || queue.length === 0}
            className="yomi-button yomi-button-secondary disabled:opacity-50"
            title="Clear server queue"
          >
            Clear queue
          </button>
        </div>
      </div>

      <SavedDownloads chapters={cachedChapters} activeDownloads={activeDownloads} onCancel={cancelDownload} onDelete={async (chapter) => { if (await confirm({ title: "Remove saved chapter?", detail: `Delete the offline pages for “${chapter.name}”?`, confirmLabel: "Remove download", danger: true })) await deleteChapter(chapter.id); }} />

      <div className="yomi-commandbar">
        <div className="yomi-commandbar-copy"><span className={`status ${downloaderState === "STARTED" ? "" : "is-idle"}`} />
          <div><strong>{downloaderState === "STARTED" ? "Downloader is working" : "Downloader is paused"}</strong><span>Suwayomi queue · {queue.length} item{queue.length === 1 ? "" : "s"}</span></div>
        </div>
        <span className={`yomi-chip ${downloaderState === "STARTED" ? "is-live" : ""}`}>{downloaderState}</span>
      </div>

      <section className="space-y-3" aria-labelledby="server-queue-title">
        <div className="flex items-end justify-between gap-4"><div><span className="yomi-eyebrow">Suwayomi engine</span><h2 id="server-queue-title" className="text-lg font-semibold text-slate-100">Server queue</h2></div><span className="text-sm text-slate-400">{queue.length} active item{queue.length === 1 ? "" : "s"}</span></div>
      {queue.length === 0 ? (
        <div className="yomi-surface p-5"><div className="flex items-center gap-4"><div className="yomi-catalog-icon"><CheckCircle2 /></div><div><h3 className="text-sm font-semibold text-slate-100">No queued chapters</h3><p className="mt-1 text-sm text-slate-400">Server-managed chapter downloads will appear here. Locally saved chapters stay above.</p></div></div></div>
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
                  onClick={async () => {
                    if (await confirm({ title: "Remove this download?", detail: `Remove “${item.chapter.name}” from the server queue?`, confirmLabel: "Remove", danger: true })) dequeueChapter(item.chapter.id);
                  }}
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
      )}</section>
    </div>
  );
}

function DownloadsHeader({ savedCount, storageUsage }: { savedCount: number; storageUsage: number }) {
  return <div className="yomi-workspace-head"><div><span className="yomi-eyebrow">Offline reading</span><h1 className="yomi-workspace-title"><Download />Downloads</h1><p className="yomi-workspace-subtitle">Saved chapters stay readable even when the local engine is unavailable.</p></div><span className="yomi-status-chip">{savedCount} saved · {formatBytes(storageUsage)}</span></div>;
}

function SavedDownloads({ chapters, activeDownloads, onCancel, onDelete }: { chapters: CachedChapter[]; activeDownloads: ReturnType<typeof useDownloadStore.getState>["activeDownloads"]; onCancel: (id: number) => void; onDelete: (chapter: CachedChapter) => Promise<void> }) {
  const active = Object.entries(activeDownloads);
  return <section className="space-y-3" aria-labelledby="saved-downloads-title">
    <div className="flex items-end justify-between gap-4"><div><span className="yomi-eyebrow">On this device</span><h2 id="saved-downloads-title" className="text-lg font-semibold text-slate-100">Saved chapters</h2></div><span className="text-sm text-slate-400">{chapters.length} available offline</span></div>
    {active.map(([id, progress]) => <div key={id} className="yomi-commandbar"><div className="yomi-commandbar-copy"><span className="status" /><div><strong>Saving chapter {id}</strong><span>{progress.total ? `${progress.progress} of ${progress.total} pages` : "Preparing pages"}{progress.error ? ` · ${progress.error}` : ""}</span></div></div><button className="yomi-icon-button danger" aria-label={`Cancel chapter ${id} download`} onClick={() => onCancel(Number(id))}><X /></button></div>)}
    {chapters.length === 0 && active.length === 0 ? <div className="yomi-route-empty"><div><BookOpen /><h2>No saved chapters yet</h2><p>Use the download action beside any chapter. Finished chapters will appear here and remain available offline.</p></div></div> : chapters.length > 0 && <div className="yomi-surface">{chapters.map((chapter) => <div className="yomi-surface-row" key={chapter.cacheKey}><div className="yomi-catalog-icon"><BookOpen /></div><div className="yomi-row-copy"><Link className="yomi-row-title" to={`/manga/${chapter.mangaId}`}>{chapter.mangaTitle}</Link><p>{chapter.name} · {chapter.pageCount} pages · {formatBytes(chapter.totalSizeBytes)}</p></div><Link className="yomi-button yomi-button-secondary" to={`/reader/${chapter.id}`}>Read</Link><button className="yomi-icon-button danger" aria-label={`Remove offline download ${chapter.name}`} onClick={() => void onDelete(chapter)}><Trash2 /></button></div>)}</div>}
  </section>;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
