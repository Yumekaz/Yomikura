import { create } from "zustand";
import { cleanupUnreferencedCachedPages, clearBackendCache, deleteCachedChapter, deleteDownloadJob, getCachedChapter, getCachedChapters, getChapterCacheKey, getDownloadJobs, getStorageEstimate, releaseCachedPageClaims, reserveCachedPage, saveCachedChapter, saveDownloadJob, type CachedChapter } from "../api/suwayomi/offlineCache";
import { isTauri, useSettingsStore } from "./useSettingsStore";
import { createGraphqlClient } from "../api/graphql/client";
import { chapterIdentityMatches, progressBackend, type ProgressBackend } from "../api/suwayomi/backendIdentity";
import { buildSuwayomiPageUrl, resolveBackendUrl } from "../api/suwayomi/pageUrls";
import { getProgressHead } from "../api/suwayomi/progressStorage";

export interface DownloadProgress { progress: number; total: number; status: "queued" | "downloading" | "error" | "success"; attempts?: number; error?: string }
interface DownloadState {
  cachedChapters: CachedChapter[]; cachedChapterIds: Set<number>; activeDownloads: Record<number, DownloadProgress>; downloadControllers: Record<number, AbortController>;
  storageUsage: number; storageQuota: number; recoveryError: string;
  loadCachedChapters: () => Promise<void>; restoreDownloadJobs: () => Promise<void>;
  downloadChapter: (chapterId: number, mangaTitle?: string, backend?: ProgressBackend) => Promise<void>;
  retryDownload: (chapterId: number, mangaTitle?: string, backend?: ProgressBackend) => Promise<void>;
  cancelDownload: (chapterId: number, backend?: ProgressBackend) => void;
  cancelAllDownloads: (backend?: ProgressBackend) => void;
  pauseForShutdown: () => void;
  deleteChapter: (chapterId: number, backend?: ProgressBackend) => Promise<void>;
  clearAll: (backend?: ProgressBackend) => Promise<void>;
}
type Entry = { key: string; token: string; backend: ProgressBackend; chapterId: number; mangaTitle?: string; native: boolean; controller: AbortController;
  progress: DownloadProgress; running: boolean; reason?: "cancel" | "pause"; persist: Promise<void>; done: Promise<void>; settle: () => void; stopping?: Promise<void> };
const targetFor = (target?: ProgressBackend) => {
  const settings = useSettingsStore.getState(); return progressBackend(target?.serverBaseUrl ?? settings.serverBaseUrl, target?.isDemo ?? settings.mockMode);
};
const currentKey = () => { try { return targetFor().key; } catch { return ""; } };
const jobKey = (target: ProgressBackend, id: number) => JSON.stringify([target.key, id]);

async function fetchCachedPage(url: string, entry: Entry): Promise<Response> {
  if (entry.controller.signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  if (!entry.native || entry.backend.isDemo) return fetch(url, { mode: "cors", signal: entry.controller.signal });
  const { invoke } = await import("@tauri-apps/api/core");
  const page = await invoke<{ bytes: number[]; contentType: string }>("fetch_local_page", { url, serverBaseUrl: entry.backend.serverBaseUrl });
  if (entry.controller.signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  return new Response(new Uint8Array(page.bytes), { headers: { "content-type": page.contentType } });
}

/** The registry owns all profiles; the public numeric maps project only the selected backend. */
export function createDownloadStore() {
  const entries = new Map<string, Entry>(); const queue: Entry[] = [];
  const restored = new Set<string>(); const restoring = new Map<string, Promise<void>>();
  let paused = false, runningJobs = 0, cacheLoadRevision = 0, lifecycleRevision = 0;
  let publish = () => {}; let pump = () => {}; let stop: (entry: Entry, reason: "cancel" | "pause") => Promise<void>;
  const store = create<DownloadState>((set, get) => {
    publish = () => {
      const key = currentKey(); const activeDownloads: Record<number, DownloadProgress> = {}; const downloadControllers: Record<number, AbortController> = {};
      for (const entry of entries.values()) if (entry.backend.key === key && !entry.reason) {
        activeDownloads[entry.chapterId] = entry.progress;
        if (entry.progress.status !== "error") downloadControllers[entry.chapterId] = entry.controller;
      }
      set({ activeDownloads, downloadControllers });
    };
    const update = (entry: Entry, patch: Partial<DownloadProgress>) => { if (entries.get(entry.key) === entry) { entry.progress = { ...entry.progress, ...patch }; publish(); } };
    const persist = (entry: Entry, status: "queued" | "downloading" | "failed") => saveDownloadJob({ serverBaseUrl: entry.backend.serverBaseUrl, isDemo: entry.backend.isDemo,
      chapterId: entry.chapterId, mangaTitle: entry.mangaTitle, status, progress: entry.progress.progress, total: entry.progress.total, attempts: entry.progress.attempts ?? 0, error: entry.progress.error, updatedAt: Date.now() });
    const remove = (entry: Entry) => { if (entries.get(entry.key) === entry) entries.delete(entry.key); publish(); };
    const check = (entry: Entry) => { if (entry.controller.signal.aborted || entries.get(entry.key) !== entry) throw new DOMException("Download cancelled", "AbortError"); };
    const run = async (entry: Entry) => {
      entry.running = true; const created: string[] = [];
      try {
        check(entry); update(entry, { status: "downloading", attempts: (entry.progress.attempts ?? 0) + 1, error: undefined }); await persist(entry, "downloading"); check(entry);
        const sdk = createGraphqlClient(`${entry.backend.serverBaseUrl}/api/graphql`, { signal: entry.controller.signal }, entry.backend.isDemo ? "demo" : "live");
        const details = (await sdk.GetChapter({ id: entry.chapterId })).chapter; check(entry);
        if (!details || details.id !== entry.chapterId) throw new Error("The requested chapter metadata could not be confirmed.");
        const pages = (await sdk.FetchChapterPages({ input: { chapterId: entry.chapterId } })).fetchChapterPages?.pages ?? []; check(entry);
        if (!pages.length) throw new Error("No pages were returned for this chapter.");
        update(entry, { total: pages.length }); await persist(entry, "downloading"); check(entry);
        const cache = await caches.open("yomikura-page-cache"); const networkUrls: string[] = []; let totalSizeBytes = 0;
        for (let index = 0; index < pages.length; index += 1) {
          check(entry);
          const url = entry.backend.isDemo ? resolveBackendUrl(entry.backend.serverBaseUrl, pages[index]) : buildSuwayomiPageUrl({ serverBaseUrl: entry.backend.serverBaseUrl, mangaId: details.mangaId, chapterSourceOrder: details.sourceOrder, pageIndex: index });
          const response = await fetchCachedPage(url, entry); check(entry);
          if (!response.ok) throw new Error(`Chapter page could not be downloaded (HTTP ${response.status}).`);
          const blob = await response.blob(); check(entry);
          const headers = new Headers(response.headers); if (!headers.has("content-type")) headers.set("content-type", blob.type || "image/jpeg");
          // An incomplete retry cannot overwrite the bytes of an earlier complete copy.
          const storageUrl = new URL(url); storageUrl.searchParams.set("__yomi_cache_attempt", entry.token); storageUrl.searchParams.set("__yomi_cache_owner", entry.backend.key);
          const cachedUrl = storageUrl.toString(); reserveCachedPage(cachedUrl, entry.token); created.push(cachedUrl);
          await cache.put(cachedUrl, new Response(blob, { headers })); check(entry);
          networkUrls.push(url); totalSizeBytes += blob.size; update(entry, { progress: index + 1 });
          if (index === pages.length - 1 || (index + 1) % 5 === 0) await persist(entry, "downloading");
        }
        check(entry);
        const mangaTitle = details.manga?.title || entry.mangaTitle || "Unknown Manga";
        const identity = { chapterId: details.id, chapterName: details.name, chapterNumber: details.chapterNumber, mangaId: details.mangaId, mangaTitle, sourceOrder: details.sourceOrder, pageCount: pages.length };
        const head = await getProgressHead(entry.backend, entry.chapterId).catch(() => undefined);
        const progress = head && chapterIdentityMatches(head.chapter, identity) ? head.patch : details;
        const previous = await getCachedChapter(entry.backend.serverBaseUrl, entry.chapterId, entry.backend.isDemo); check(entry);
        await saveCachedChapter({ cacheKey: getChapterCacheKey(entry.backend.serverBaseUrl, entry.chapterId, entry.backend.isDemo), serverBaseUrl: entry.backend.serverBaseUrl, isDemo: entry.backend.isDemo,
          id: details.id, name: details.name, chapterNumber: details.chapterNumber, mangaId: details.mangaId, mangaTitle, sourceOrder: details.sourceOrder,
          pageCount: pages.length, pages, networkUrls, cachedUrls: created, totalSizeBytes, cachedAt: Date.now(), isRead: progress.isRead, lastPageRead: Math.max(0, Math.min(progress.lastPageRead, pages.length - 1)),
        }, entry.controller.signal);
        await deleteDownloadJob(entry.backend.serverBaseUrl, entry.chapterId, entry.backend.isDemo);
        if (previous) await cleanupUnreferencedCachedPages(previous.cachedUrls).catch(() => undefined);
        if (!entry.reason) remove(entry);
        await get().loadCachedChapters();
      } catch (error) {
        if (!entry.reason) {
          update(entry, { status: "error", error: error instanceof Error ? error.message : "Chapter download failed." });
          await persist(entry, "failed").catch(() => { update(entry, { error: "Download stopped, but its retry status could not be saved. Check device storage before retrying." }); });
        }
      } finally {
        releaseCachedPageClaims(entry.token);
        await cleanupUnreferencedCachedPages(created).catch(() => undefined);
        entry.running = false; entry.settle(); publish();
      }
    };
    pump = () => {
      if (paused) return;
      const limit = useSettingsStore.getState().downloadConcurrency;
      while (runningJobs < limit && queue.length) {
        const entry = queue.shift()!; if (entry.reason || entries.get(entry.key) !== entry) continue;
        runningJobs += 1;
        void run(entry).finally(() => { runningJobs -= 1; pump(); }).catch(() => undefined);
      }
    };
    stop = (entry, reason) => {
      if (entry.stopping) return entry.stopping;
      entry.reason = reason; entry.controller.abort(); const index = queue.indexOf(entry); if (index >= 0) queue.splice(index, 1); publish();
      const stopping = (async () => {
        await entry.persist.catch(() => undefined); if (!entry.running) entry.settle(); await entry.done;
        if (reason === "pause") await persist(entry, "queued"); else await deleteDownloadJob(entry.backend.serverBaseUrl, entry.chapterId, entry.backend.isDemo);
        remove(entry);
      })();
      entry.stopping = stopping;
      void stopping.catch(() => { entry.stopping = undefined; entry.reason = undefined; update(entry, { status: "error", error: "Download stopped, but its saved queue state could not be updated. Check storage and retry." }); });
      return stopping;
    };
    const enqueue = async (id: number, title?: string, provided?: ProgressBackend, attempts = 0, expectedLifecycle?: number) => {
      if (!Number.isSafeInteger(id) || id < 0) throw new Error("Choose a valid chapter to download.");
      const backend = targetFor(provided); const native = isTauri();
      if (!native && !backend.isDemo) {
        await createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, "live").EnqueueChapterDownload({ input: { id } }); return;
      }
      const key = jobKey(backend, id); const existing = entries.get(key);
      if (existing) {
        if (existing.stopping) await existing.stopping;
        else if (existing.progress.status !== "error") return;
        else await stop(existing, "cancel");
      }
      if (expectedLifecycle !== undefined && expectedLifecycle !== lifecycleRevision) return;
      let settle!: () => void; const done = new Promise<void>((resolve) => { settle = resolve; });
      const entry: Entry = { key, token: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, backend, chapterId: id, mangaTitle: title, native,
        controller: new AbortController(), progress: { progress: 0, total: 0, status: "queued", attempts }, running: false, persist: Promise.resolve(), done, settle };
      entries.set(key, entry); entry.persist = persist(entry, "queued"); publish();
      try { await entry.persist; }
      catch (error) { entry.settle(); update(entry, { status: "error", error: "The download could not be retained on this device. Check storage before retrying." }); throw error; }
      if (entry.reason || entry.controller.signal.aborted) { entry.settle(); return; }
      paused = false; queue.push(entry); pump();
    };
    const stopBackend = async (backend: ProgressBackend) => {
      const results = await Promise.allSettled([...entries.values()].filter((entry) => entry.backend.key === backend.key).map((entry) => stop(entry, "cancel")));
      const error = results.find((result): result is PromiseRejectedResult => result.status === "rejected"); if (error) throw error.reason;
    };
    return {
      cachedChapters: [], cachedChapterIds: new Set(), activeDownloads: {}, downloadControllers: {}, storageUsage: 0, storageQuota: 0, recoveryError: "",
      loadCachedChapters: async () => {
        const revision = ++cacheLoadRevision; let backend: ProgressBackend;
        try { backend = targetFor(); } catch { set({ cachedChapters: [], cachedChapterIds: new Set() }); return; }
        const chapters = await getCachedChapters(backend.serverBaseUrl, backend.isDemo); const estimate = await getStorageEstimate();
        if (revision !== cacheLoadRevision || currentKey() !== backend.key) return;
        set({ cachedChapters: chapters, cachedChapterIds: new Set(chapters.map((chapter) => chapter.id)), storageUsage: estimate.usage, storageQuota: estimate.quota });
      },
      restoreDownloadJobs: async () => {
        let backend: ProgressBackend; try { backend = targetFor(); } catch { return; }
        if (!isTauri() && !backend.isDemo) return;
        paused = false; publish(); const lifecycle = lifecycleRevision;
        if (restoring.has(backend.key)) return restoring.get(backend.key)!;
        if (restored.has(backend.key)) { pump(); return; }
        const restore = (async () => {
          try {
            for (const job of await getDownloadJobs(backend.serverBaseUrl, backend.isDemo)) {
              if (currentKey() !== backend.key || lifecycle !== lifecycleRevision) return;
              if (entries.has(jobKey(backend, job.chapterId))) {
                const existing = entries.get(jobKey(backend, job.chapterId))!;
                if (existing.stopping) await existing.stopping; else continue;
              }
              if (job.status === "failed") {
                let settle!: () => void; const done = new Promise<void>((resolve) => { settle = resolve; }); settle();
                entries.set(jobKey(backend, job.chapterId), { key: jobKey(backend, job.chapterId), token: "restored-error", backend, chapterId: job.chapterId, mangaTitle: job.mangaTitle, native: isTauri(), controller: new AbortController(),
                  progress: { progress: job.progress, total: job.total, attempts: job.attempts, status: "error", error: job.error || "Download was interrupted." }, running: false, persist: Promise.resolve(), done, settle }); publish();
              } else await enqueue(job.chapterId, job.mangaTitle, backend, job.attempts, lifecycle);
            }
            if (currentKey() === backend.key && lifecycle === lifecycleRevision && !paused) { restored.add(backend.key); set({ recoveryError: "" }); }
          } catch { if (currentKey() === backend.key) set({ recoveryError: "Saved download jobs could not be restored. Check device storage and retry." }); }
        })();
        restoring.set(backend.key, restore); try { await restore; } finally { if (restoring.get(backend.key) === restore) restoring.delete(backend.key); }
      },
      downloadChapter: (id, title, backend) => enqueue(id, title, backend),
      retryDownload: async (id, title, provided) => { const backend = targetFor(provided); const entry = entries.get(jobKey(backend, id)); const attempts = entry?.progress.attempts ?? 0; if (entry) await stop(entry, "cancel"); await enqueue(id, title, backend, attempts); },
      cancelDownload: (id, provided) => { const backend = targetFor(provided); const entry = entries.get(jobKey(backend, id)); if (entry) void stop(entry, "cancel").catch(() => undefined); else void deleteDownloadJob(backend.serverBaseUrl, id, backend.isDemo).catch(() => undefined); },
      cancelAllDownloads: (provided) => { void stopBackend(targetFor(provided)).catch(() => undefined); },
      pauseForShutdown: () => { paused = true; lifecycleRevision += 1; restored.clear(); for (const entry of entries.values()) if (entry.progress.status !== "error") void stop(entry, "pause").catch(() => undefined); },
      deleteChapter: async (id, provided) => { const backend = targetFor(provided); const entry = entries.get(jobKey(backend, id)); if (entry) await stop(entry, "cancel"); await deleteCachedChapter(backend.serverBaseUrl, id, backend.isDemo); await get().loadCachedChapters(); },
      clearAll: async (provided) => { const backend = targetFor(provided); await stopBackend(backend); await clearBackendCache(backend.serverBaseUrl, backend.isDemo); await get().loadCachedChapters(); },
    };
  });
  const unsubscribe = useSettingsStore.subscribe((next, previous) => {
    let nextKey = "", previousKey = "";
    try { nextKey = progressBackend(next.serverBaseUrl, next.mockMode).key; } catch { /* Incomplete connection input. */ }
    try { previousKey = progressBackend(previous.serverBaseUrl, previous.mockMode).key; } catch { /* Incomplete connection input. */ }
    if (nextKey !== previousKey) {
      cacheLoadRevision += 1; store.setState({ cachedChapters: [], cachedChapterIds: new Set(), recoveryError: "" }); publish();
      if (nextKey) void store.getState().loadCachedChapters().catch(() => undefined);
    }
    if (next.downloadConcurrency !== previous.downloadConcurrency) pump();
  });
  return Object.assign(store, { dispose: async () => { paused = true; lifecycleRevision += 1; restored.clear(); await Promise.allSettled([...entries.values()].filter((entry) => entry.progress.status !== "error").map((entry) => stop(entry, "pause"))); unsubscribe(); } });
}
export const useDownloadStore = createDownloadStore();
