import { create } from "zustand";
import { 
  CachedChapter, 
  getCachedChapters, 
  getChapterCacheKey,
  normalizeCacheServerUrl,
  saveCachedChapter, 
  deleteCachedChapter, 
  clearAllCache, 
  getStorageEstimate 
} from "../api/suwayomi/offlineCache";
import { useSettingsStore, isTauri } from "./useSettingsStore";
import { createGraphqlClient } from "../api/graphql/client";
import { buildSuwayomiPageUrl, resolveBackendUrl } from "../api/suwayomi/pageUrls";

export interface DownloadProgress {
  progress: number;
  total: number;
  status: "downloading" | "error" | "success";
  error?: string;
}

interface DownloadState {
  cachedChapters: CachedChapter[];
  cachedChapterIds: Set<number>;
  activeDownloads: Record<number, DownloadProgress>;
  storageUsage: number;
  storageQuota: number;

  // Actions
  loadCachedChapters: () => Promise<void>;
  downloadChapter: (chapterId: number, mangaTitle?: string) => Promise<void>;
  deleteChapter: (chapterId: number) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  cachedChapters: [],
  cachedChapterIds: new Set<number>(),
  activeDownloads: {},
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

  downloadChapter: async (chapterId, mangaTitle) => {
    const { activeDownloads } = get();
    
    // If already downloading, do nothing
    if (activeDownloads[chapterId]?.status === "downloading") return;

    const serverBaseUrl = useSettingsStore.getState().serverBaseUrl;
    if (!serverBaseUrl) {
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [chapterId]: {
            progress: 0,
            total: 0,
            status: "error",
            error: "No server configured.",
          },
        },
      }));
      return;
    }

    // Set initial state
    set((state) => ({
      activeDownloads: {
        ...state.activeDownloads,
        [chapterId]: {
          progress: 0,
          total: 0,
          status: "downloading",
        },
      },
    }));

    try {
      // 1. Fetch chapter details dynamically to get sourceOrder, mangaId, chapterNumber, name, etc.
      const cleanUrl = serverBaseUrl.replace(/\/$/, "");
      const sdk = createGraphqlClient(`${cleanUrl}/api/graphql`);
      
      const chapterRes = await sdk.GetChapter({ id: chapterId });
      const chapterDetails = chapterRes?.chapter;
      
      if (!chapterDetails) {
        throw new Error("Failed to load chapter metadata from server.");
      }

      // 2. Fetch page URLs
      const pagesRes = await sdk.FetchChapterPages({ input: { chapterId } });
      const pages = pagesRes?.fetchChapterPages?.pages || [];
      
      if (pages.length === 0) {
        throw new Error("No page URLs returned for this chapter.");
      }

      // Update total pages in state
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [chapterId]: {
            progress: 0,
            total: pages.length,
            status: "downloading",
          },
        },
      }));

      // 3. Open Cache Storage
      const cache = await caches.open("yomikura-page-cache");
      const cachedUrls: string[] = [];
      let totalSizeBytes = 0;

      // Resolve the fetch function. In Tauri environment, we use native tauri fetch plugin to bypass CORS/PNA restrictions.
      let fetchFn: typeof fetch = fetch;
      if (isTauri()) {
        try {
          const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
          fetchFn = tauriFetch as any;
        } catch (err) {
          console.warn("Failed to load @tauri-apps/plugin-http fetch, falling back to browser fetch", err);
        }
      }

      // 4. Download pages sequentially or in small chunks
      for (let i = 0; i < pages.length; i++) {
        const pageUrl = buildSuwayomiPageUrl({
          serverBaseUrl,
          mangaId: chapterDetails.mangaId,
          chapterSourceOrder: chapterDetails.sourceOrder,
          pageIndex: i,
        });
        const fallbackUrl = resolveBackendUrl(serverBaseUrl, pages[i]);

        let response: Response | null = null;
        let blob: Blob | null = null;
        let errorMsg = "";

        // Try primary URL first
        try {
          response = await fetchFn(pageUrl, { mode: "cors" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          
          if (typeof response.blob === "function") {
            blob = await response.blob();
          } else {
            const buffer = await response.arrayBuffer();
            const contentType = response.headers.get("content-type") || "image/jpeg";
            blob = new Blob([buffer], { type: contentType });
          }
        } catch (err: any) {
          errorMsg = err instanceof Error ? err.message : String(err);
          // Try fallback URL
          try {
            response = await fetchFn(fallbackUrl, { mode: "cors" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            if (typeof response.blob === "function") {
              blob = await response.blob();
            } else {
              const buffer = await response.arrayBuffer();
              const contentType = response.headers.get("content-type") || "image/jpeg";
              blob = new Blob([buffer], { type: contentType });
            }
          } catch (fallbackErr: any) {
            const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            throw new Error(`Failed to download page ${i + 1}. Primary: ${errorMsg}, Fallback: ${fallbackMsg}`);
          }
        }

        if (blob && response) {
          // Cache the response file
          const headers = new Headers(response.headers);
          // Ensure content-type is set properly
          if (!headers.has("content-type")) {
            headers.set("content-type", blob.type || "image/jpeg");
          }
          
          await cache.put(pageUrl, new Response(blob, { headers }));
          cachedUrls.push(pageUrl);
          
          // Accumulate size
          totalSizeBytes += blob.size;
        }

        // Update progress
        set((state) => ({
          activeDownloads: {
            ...state.activeDownloads,
            [chapterId]: {
              progress: i + 1,
              total: pages.length,
              status: "downloading",
            },
          },
        }));
      }

      // 5. Save metadata to IndexedDB
      const normalizedServerBaseUrl = normalizeCacheServerUrl(serverBaseUrl);
      const cachedChapterData: CachedChapter = {
        cacheKey: getChapterCacheKey(serverBaseUrl, chapterId),
        serverBaseUrl: normalizedServerBaseUrl,
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
      };

      await saveCachedChapter(cachedChapterData);

      // Clean up from active downloads list
      set((state) => {
        const nextActive = { ...state.activeDownloads };
        delete nextActive[chapterId];
        return { activeDownloads: nextActive };
      });

      // Reload
      await get().loadCachedChapters();

    } catch (error: any) {
      console.error(`Failed to download chapter ${chapterId}:`, error);
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [chapterId]: {
            progress: state.activeDownloads[chapterId]?.progress || 0,
            total: state.activeDownloads[chapterId]?.total || 0,
            status: "error",
            error: error.message || "Failed to download chapter.",
          },
        },
      }));
    }
  },

  deleteChapter: async (chapterId) => {
    const serverBaseUrl = useSettingsStore.getState().serverBaseUrl;
    await deleteCachedChapter(serverBaseUrl, chapterId);
    await get().loadCachedChapters();
  },

  clearAll: async () => {
    await clearAllCache();
    await get().loadCachedChapters();
  },
}));
