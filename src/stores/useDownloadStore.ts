import { create } from "zustand";
import { 
  CachedChapter, 
  getCachedChapters, 
  getChapterCacheKey,
  normalizeCacheServerUrl,
  saveCachedChapter, 
  deleteCachedChapter, 
  clearAllCache, 
  deleteDownloadJob,
  getDownloadJobs,
  getStorageEstimate,
  saveDownloadJob,
} from "../api/suwayomi/offlineCache";
import { useSettingsStore, isTauri } from "./useSettingsStore";
import { createGraphqlClient } from "../api/graphql/client";
import { buildSuwayomiPageUrl, resolveBackendUrl } from "../api/suwayomi/pageUrls";

export interface DownloadProgress {
  progress: number;
  total: number;
  status: "queued" | "downloading" | "error" | "success";
  attempts?: number;
  error?: string;
}

interface DownloadState {
  cachedChapters: CachedChapter[];
  cachedChapterIds: Set<number>;
  activeDownloads: Record<number, DownloadProgress>;
  downloadControllers: Record<number, AbortController>;
  storageUsage: number;
  storageQuota: number;

  // Actions
  loadCachedChapters: () => Promise<void>;
  restoreDownloadJobs: () => Promise<void>;
  downloadChapter: (chapterId: number, mangaTitle?: string) => Promise<void>;
  retryDownload: (chapterId: number, mangaTitle?: string) => Promise<void>;
  cancelDownload: (chapterId: number) => void;
  cancelAllDownloads: () => void;
  pauseForShutdown: () => void;
  deleteChapter: (chapterId: number) => Promise<void>;
  clearAll: () => Promise<void>;
}

type NativePageResponse = { bytes: number[]; contentType: string };
type QueueItem = { chapterId: number; mangaTitle?: string; serverBaseUrl: string; attempts: number };

async function fetchCachedPage(pageUrl: string, serverBaseUrl: string, signal: AbortSignal): Promise<Response> {
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  if (!isTauri()) return fetch(pageUrl, { mode: "cors", signal });

  const { invoke } = await import("@tauri-apps/api/core");
  const page = await invoke<NativePageResponse>("fetch_local_page", { url: pageUrl, serverBaseUrl });
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  return new Response(new Uint8Array(page.bytes), { headers: { "content-type": page.contentType } });
}

export const useDownloadStore = create<DownloadState>((set, get) => {
  const queue: QueueItem[] = [];
  const queuedIds = new Set<number>();
  let runningJobs = 0;
  let restoredServer = "";
  let paused = false;

  const removeActiveDownload = (chapterId: number) => {
    set((state) => {
      const activeDownloads = { ...state.activeDownloads };
      const downloadControllers = { ...state.downloadControllers };
      delete activeDownloads[chapterId];
      delete downloadControllers[chapterId];
      return { activeDownloads, downloadControllers };
    });
  };

  const runDownload = async (item: QueueItem) => {
    const { chapterId, mangaTitle, serverBaseUrl } = item;
    const attempts = item.attempts + 1;
    const controller = new AbortController();
    set((state) => ({
      downloadControllers: { ...state.downloadControllers, [chapterId]: controller },
      activeDownloads: {
        ...state.activeDownloads,
        [chapterId]: { progress: 0, total: 0, status: "downloading", attempts },
      },
    }));
    await saveDownloadJob({
      serverBaseUrl,
      chapterId,
      mangaTitle,
      status: "downloading",
      progress: 0,
      total: 0,
      attempts,
      updatedAt: Date.now(),
    });

    let cache: Cache | undefined;
    const cachedUrls: string[] = [];
    const newlyCachedUrls: string[] = [];

    try {
      const cleanUrl = serverBaseUrl.replace(/\/$/, "");
      const sdk = createGraphqlClient(`${cleanUrl}/api/graphql`);
      const chapterRes = await sdk.GetChapter({ id: chapterId });
      const chapterDetails = chapterRes?.chapter;
      if (!chapterDetails) throw new Error("Failed to load chapter metadata from server.");

      const pagesRes = await sdk.FetchChapterPages({ input: { chapterId } });
      const pages = pagesRes?.fetchChapterPages?.pages || [];
      if (pages.length === 0) throw new Error("No page URLs returned for this chapter.");

      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [chapterId]: { progress: 0, total: pages.length, status: "downloading", attempts },
        },
      }));
      await saveDownloadJob({
        serverBaseUrl,
        chapterId,
        mangaTitle,
        status: "downloading",
        progress: 0,
        total: pages.length,
        attempts,
        updatedAt: Date.now(),
      });

      cache = await caches.open("yomikura-page-cache");
      let totalSizeBytes = 0;
      for (let i = 0; i < pages.length; i++) {
        const pageUrl = useSettingsStore.getState().mockMode
          ? resolveBackendUrl(serverBaseUrl, pages[i])
          : buildSuwayomiPageUrl({
              serverBaseUrl,
              mangaId: chapterDetails.mangaId,
              chapterSourceOrder: chapterDetails.sourceOrder,
              pageIndex: i,
            });
        const response = await fetchCachedPage(pageUrl, serverBaseUrl, controller.signal);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const headers = new Headers(response.headers);
        if (!headers.has("content-type")) headers.set("content-type", blob.type || "image/jpeg");
        const wasAlreadyCached = await cache.match(pageUrl);
        await cache.put(pageUrl, new Response(blob, { headers }));
        cachedUrls.push(pageUrl);
        if (!wasAlreadyCached) newlyCachedUrls.push(pageUrl);
        totalSizeBytes += blob.size;

        const progress = i + 1;
        set((state) => ({
          activeDownloads: {
            ...state.activeDownloads,
            [chapterId]: { progress, total: pages.length, status: "downloading", attempts },
          },
        }));
        if (progress === pages.length || progress % 5 === 0) {
          await saveDownloadJob({
            serverBaseUrl,
            chapterId,
            mangaTitle,
            status: "downloading",
            progress,
            total: pages.length,
            attempts,
            updatedAt: Date.now(),
          });
        }
      }

      await saveCachedChapter({
        cacheKey: getChapterCacheKey(serverBaseUrl, chapterId),
        serverBaseUrl: normalizeCacheServerUrl(serverBaseUrl),
        id: chapterId,
        name: chapterDetails.name,
        chapterNumber: chapterDetails.chapterNumber,
        mangaId: chapterDetails.mangaId,
        mangaTitle: mangaTitle || chapterDetails.manga?.title || "Unknown Manga",
        sourceOrder: chapterDetails.sourceOrder,
        pageCount: pages.length,
        pages,
        cachedUrls,
        totalSizeBytes,
        cachedAt: Date.now(),
        lastPageRead: 0,
        isRead: false,
      });
      await deleteDownloadJob(serverBaseUrl, chapterId);
      removeActiveDownload(chapterId);
      await get().loadCachedChapters();
    } catch (error: any) {
      if (cache) await Promise.all(newlyCachedUrls.map((url) => cache!.delete(url)));
      if (error?.name === "AbortError") {
        if (paused) {
          const progress = get().activeDownloads[chapterId];
          await saveDownloadJob({
            serverBaseUrl,
            chapterId,
            mangaTitle,
            status: "queued",
            progress: progress?.progress || 0,
            total: progress?.total || 0,
            attempts,
            updatedAt: Date.now(),
          });
          set((state) => ({
            activeDownloads: {
              ...state.activeDownloads,
              [chapterId]: { ...state.activeDownloads[chapterId], status: "queued" },
            },
          }));
        } else {
          await deleteDownloadJob(serverBaseUrl, chapterId);
          removeActiveDownload(chapterId);
        }
        return;
      }
      const message = error?.message || "Failed to download chapter.";
      set((state) => {
        const downloadControllers = { ...state.downloadControllers };
        delete downloadControllers[chapterId];
        return {
          downloadControllers,
          activeDownloads: {
            ...state.activeDownloads,
            [chapterId]: {
              progress: state.activeDownloads[chapterId]?.progress || 0,
              total: state.activeDownloads[chapterId]?.total || 0,
              status: "error",
              attempts,
              error: message,
            },
          },
        };
      });
      const progress = get().activeDownloads[chapterId];
      await saveDownloadJob({
        serverBaseUrl,
        chapterId,
        mangaTitle,
        status: "failed",
        progress: progress?.progress || 0,
        total: progress?.total || 0,
        attempts,
        error: message,
        updatedAt: Date.now(),
      });
    }
  };

  const pumpQueue = () => {
    if (paused) return;
    const limit = useSettingsStore.getState().downloadConcurrency;
    while (runningJobs < limit && queue.length > 0) {
      const item = queue.shift()!;
      queuedIds.delete(item.chapterId);
      runningJobs += 1;
      void runDownload(item).finally(() => {
        runningJobs -= 1;
        pumpQueue();
      });
    }
  };

  const enqueue = async (chapterId: number, mangaTitle?: string, attempts = 0) => {
    const serverBaseUrl = useSettingsStore.getState().serverBaseUrl;
    if (!serverBaseUrl) {
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [chapterId]: { progress: 0, total: 0, status: "error", attempts, error: "No server configured." },
        },
      }));
      return;
    }
    if (!isTauri() && !useSettingsStore.getState().mockMode) {
      const cleanUrl = serverBaseUrl.replace(/\/$/, "");
      await createGraphqlClient(`${cleanUrl}/api/graphql`).EnqueueChapterDownload({ input: { id: chapterId } });
      return;
    }
    if (queuedIds.has(chapterId) || get().activeDownloads[chapterId]?.status === "downloading") return;
    queuedIds.add(chapterId);
    queue.push({ chapterId, mangaTitle, serverBaseUrl, attempts });
    set((state) => ({
      activeDownloads: {
        ...state.activeDownloads,
        [chapterId]: { progress: 0, total: 0, status: "queued", attempts },
      },
    }));
    await saveDownloadJob({
      serverBaseUrl,
      chapterId,
      mangaTitle,
      status: "queued",
      progress: 0,
      total: 0,
      attempts,
      updatedAt: Date.now(),
    });
    pumpQueue();
  };

  return ({
  cachedChapters: [],
  cachedChapterIds: new Set<number>(),
  activeDownloads: {},
  downloadControllers: {},
  storageUsage: 0,
  storageQuota: 0,

  loadCachedChapters: async () => {
    const serverBaseUrl = useSettingsStore.getState().serverBaseUrl;
    const chapters = await getCachedChapters(serverBaseUrl);
    const ids = new Set(chapters.map((c) => c.id));
    const estimate = await getStorageEstimate();
    set({
      cachedChapters: chapters,
      cachedChapterIds: ids,
      storageUsage: estimate.usage,
      storageQuota: estimate.quota,
    });
  },
  restoreDownloadJobs: async () => {
    const serverBaseUrl = useSettingsStore.getState().serverBaseUrl;
    if (!serverBaseUrl) return;
    paused = false;
    if (restoredServer === serverBaseUrl) {
      pumpQueue();
      return;
    }
    restoredServer = serverBaseUrl;
    const jobs = await getDownloadJobs(serverBaseUrl);
    for (const job of jobs) {
      if (job.status === "failed") {
        set((state) => ({
          activeDownloads: {
            ...state.activeDownloads,
            [job.chapterId]: {
              progress: job.progress,
              total: job.total,
              status: "error",
              attempts: job.attempts,
              error: job.error || "Download was interrupted.",
            },
          },
        }));
      } else {
        await enqueue(job.chapterId, job.mangaTitle, job.attempts);
      }
    }
  },
  downloadChapter: (chapterId, mangaTitle) => enqueue(chapterId, mangaTitle),
  retryDownload: async (chapterId, mangaTitle) => {
    const current = get().activeDownloads[chapterId];
    removeActiveDownload(chapterId);
    await enqueue(chapterId, mangaTitle, current?.attempts || 0);
  },

  cancelDownload: (chapterId) => {
    const queuedIndex = queue.findIndex((item) => item.chapterId === chapterId);
    if (queuedIndex >= 0) {
      const [item] = queue.splice(queuedIndex, 1);
      queuedIds.delete(chapterId);
      void deleteDownloadJob(item.serverBaseUrl, chapterId);
      removeActiveDownload(chapterId);
      return;
    }
    get().downloadControllers[chapterId]?.abort();
  },

  cancelAllDownloads: () => {
    paused = false;
    Object.values(get().downloadControllers).forEach((controller) => controller.abort());
    const queued = queue.splice(0);
    queuedIds.clear();
    for (const item of queued) void deleteDownloadJob(item.serverBaseUrl, item.chapterId);
    set({ activeDownloads: {}, downloadControllers: {} });
  },
  pauseForShutdown: () => {
    paused = true;
    Object.values(get().downloadControllers).forEach((controller) => controller.abort());
  },

  deleteChapter: async (chapterId) => {
    const serverBaseUrl = useSettingsStore.getState().serverBaseUrl;
    await deleteCachedChapter(serverBaseUrl, chapterId);
    await get().loadCachedChapters();
  },

  clearAll: async () => {
    get().cancelAllDownloads();
    await clearAllCache();
    await get().loadCachedChapters();
  },
  });
});
