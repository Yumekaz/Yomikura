import { create } from "zustand";
import {
  cachedPageUrls, cleanupUnreferencedCachedPages, clearBackendCache, deleteCachedChapter, deleteDownloadJob,
  DownloadJobChangedError, getCachedChapter, getCachedChapters, getChapterCacheKey, getDownloadJobs, getStorageEstimate,
  normalizeCacheServerUrl, prepareDownloadCheckpoint, recordDownloadPage, releaseCachedPageClaims, reserveCachedPage,
  saveCachedChapter, saveDownloadJob, type CachedChapter, type CachedPageTiles, type DownloadJob,
} from "../api/suwayomi/offlineCache";
import { isTauri, useSettingsStore } from "./useSettingsStore";
import { createGraphqlClient } from "../api/graphql/client";
import { chapterIdentityMatches, progressBackend, type ProgressBackend } from "../api/suwayomi/backendIdentity";
import { buildSuwayomiPageUrl, resolveBackendUrl } from "../api/suwayomi/pageUrls";
import { getProgressHead } from "../api/suwayomi/progressStorage";
import { DEFAULT_DOWNLOAD_EXPERIENCE } from "./downloadExperience";
import { allowDeviceDownload, connectionInformation, waitForDownloadNetwork } from "../api/suwayomi/networkPolicy";
import { validatePageBlob } from "../api/suwayomi/validatePageBlob";
import { splitTallImage } from "../api/suwayomi/tallImageTiles";
import { assertLibrarySession, rememberedLibrary, LIBRARY_SESSION_EVENT } from "../api/suwayomi/librarySession";
import { downloadChecksum, readVerifiedDownloadPage } from "../api/suwayomi/downloadCheckpoint";
import { protectedResponse } from "../api/suwayomi/desktopAuth";

export interface DownloadProgress { progress: number; total: number; status: "queued" | "downloading" | "error" | "success"; mangaTitle?: string; chapterName?: string; attempts?: number; error?: string; waitingForNetwork?: boolean }
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
type StopReason = "cancel" | "pause" | "retry";
type Entry = { key: string; storageKey: string; token: string; backend: ProgressBackend; chapterId: number; mangaTitle?: string; native: boolean; controller: AbortController;
  progress: DownloadProgress; running: boolean; reason?: StopReason; persist: Promise<void>; done: Promise<void>; settle: () => void; stopping?: Promise<void> };
const targetFor = (target?: ProgressBackend) => {
  if (target) return target;
  const settings = useSettingsStore.getState(); return progressBackend(settings.serverBaseUrl, settings.mockMode);
};
const backendScope = (target: ProgressBackend) => JSON.stringify([target.key, target.libraryId ?? null]);
const currentKey = () => { try { return backendScope(targetFor()); } catch { return ""; } };
const jobKey = (target: ProgressBackend, id: number) => JSON.stringify([backendScope(target), id]);
let nativeCore: Promise<typeof import("@tauri-apps/api/core")> | undefined;

async function fetchCachedPage(url: string, entry: Entry): Promise<Response> {
  if (entry.controller.signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  if (!entry.native || entry.backend.isDemo) return fetch(url, { mode: "cors", signal: entry.controller.signal });
  const protectedPage = await protectedResponse(url, entry.backend.serverBaseUrl, entry.controller.signal);
  if (protectedPage) return protectedPage;
  const { invoke } = await (nativeCore ??= import("@tauri-apps/api/core"));
  const page = await invoke<{ bytes: number[]; contentType: string }>("fetch_local_page", { url, serverBaseUrl: entry.backend.serverBaseUrl });
  if (entry.controller.signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  return new Response(new Uint8Array(page.bytes), { headers: { "content-type": page.contentType } });
}

function attemptPageUrl(networkUrl: string, index: number, entry: Entry) {
  const url = new URL(networkUrl);
  url.hash = "";
  url.searchParams.set("__yomi_cache_attempt", entry.token);
  url.searchParams.set("__yomi_cache_owner", entry.backend.key);
  url.searchParams.set("__yomi_cache_page", String(index));
  if (entry.backend.libraryId) url.searchParams.set("__yomi_cache_library", entry.backend.libraryId);
  return url;
}

/** The registry owns all profiles; the public numeric maps project only the selected backend. */
export function createDownloadStore() {
  const preferences = () => useSettingsStore.getState().experience?.downloads ?? DEFAULT_DOWNLOAD_EXPERIENCE;
  const networkAllowed = (entry: Entry) => entry.backend.isDemo || allowDeviceDownload(preferences());
  const networkGate = (entry: Entry) => waitForDownloadNetwork(() => networkAllowed(entry), (changed) => useSettingsStore.subscribe(changed), entry.controller.signal);
  const entries = new Map<string, Entry>(); const queue: Entry[] = [];
  const restored = new Set<string>(); const restoring = new Map<string, Promise<void>>();
  let paused = false, runningJobs = 0, cacheLoadRevision = 0, lifecycleRevision = 0;
  let publish = () => {}; let pump = () => {}; let stop: (entry: Entry, reason: StopReason) => Promise<void>;
  const pause = () => {
    paused = true;
    lifecycleRevision += 1;
    restored.clear();
    restoring.clear();
    return Promise.allSettled([...entries.values()].filter((entry) => entry.progress.status !== "error").map((entry) => stop(entry, "pause")));
  };
  const store = create<DownloadState>((set, get) => {
    publish = () => {
      const key = currentKey(); const activeDownloads: Record<number, DownloadProgress> = {}; const downloadControllers: Record<number, AbortController> = {};
      for (const entry of entries.values()) if (backendScope(entry.backend) === key && !entry.reason) {
        activeDownloads[entry.chapterId] = { ...entry.progress, waitingForNetwork: entry.progress.status !== "error" && !networkAllowed(entry) };
        if (entry.progress.status !== "error") downloadControllers[entry.chapterId] = entry.controller;
      }
      set({ activeDownloads, downloadControllers });
    };
    const update = (entry: Entry, patch: Partial<DownloadProgress>) => { if (entries.get(entry.key) === entry) { entry.progress = { ...entry.progress, ...patch }; publish(); } };
    const persist = (entry: Entry, status: "queued" | "downloading" | "failed", claim?: { resumeFrom?: string }) => {
      const job = { serverBaseUrl: entry.backend.serverBaseUrl, isDemo: entry.backend.isDemo, libraryId: entry.backend.libraryId, chapterId: entry.chapterId, mangaTitle: entry.mangaTitle, chapterName: entry.progress.chapterName, status, progress: entry.progress.progress, total: entry.progress.total, attempts: entry.progress.attempts ?? 0, error: entry.progress.error, updatedAt: Date.now() };
      const saved = entry.persist.catch(() => undefined).then(() => saveDownloadJob(job, { token: entry.token, claim: !!claim, resumeFrom: claim?.resumeFrom }));
      entry.persist = saved;
      return saved;
    };
    const remove = (entry: Entry) => { if (entries.get(entry.key) === entry) entries.delete(entry.key); publish(); };
    const check = (entry: Entry) => { if (entry.controller.signal.aborted || entries.get(entry.key) !== entry || !entry.backend.isDemo && entry.backend.libraryId !== rememberedLibrary(entry.backend.serverBaseUrl)?.marker) throw new DOMException("Download cancelled", "AbortError"); };
    const run = async (entry: Entry) => {
      entry.running = true;
      const created: string[] = [], cachedUrls: string[] = [], pageTiles: CachedPageTiles[] = [];
      const { backend, chapterId, storageKey, token } = entry;
      const signal = entry.controller.signal;
      try {
        check(entry); await networkGate(entry); check(entry); update(entry, { status: "downloading", attempts: (entry.progress.attempts ?? 0) + 1, error: undefined }); await persist(entry, "downloading"); check(entry);
        if (!backend.isDemo) await assertLibrarySession(backend.serverBaseUrl, backend.libraryId);
        const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal, libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live");
        const details = (await sdk.GetChapter({ id: chapterId })).chapter; check(entry);
        if (!details || details.id !== chapterId) throw new Error("The requested chapter metadata could not be confirmed.");
        entry.mangaTitle = details.manga?.title || entry.mangaTitle;
        update(entry, { mangaTitle: entry.mangaTitle, chapterName: details.name });
        await persist(entry, "downloading"); check(entry);
        const pages = (await sdk.FetchChapterPages({ input: { chapterId } })).fetchChapterPages?.pages ?? []; check(entry);
        if (!pages.length) throw new Error("No pages were returned for this chapter.");
        const mangaTitle = entry.mangaTitle || "Unknown Manga";
        const identity = { chapterId: details.id, chapterName: details.name, chapterNumber: details.chapterNumber, mangaId: details.mangaId, mangaTitle, sourceOrder: details.sourceOrder, pageCount: pages.length };
        const networkUrls = pages.map((page, index) => backend.isDemo ? resolveBackendUrl(backend.serverBaseUrl, page) : buildSuwayomiPageUrl({ serverBaseUrl: backend.serverBaseUrl, mangaId: details.mangaId, chapterSourceOrder: details.sourceOrder, pageIndex: index }));
        update(entry, { total: pages.length });
        await persist(entry, "downloading"); check(entry);
        // A legacy live queue can still save full chapters when no library marker has been established.
        const resumable = !!globalThis.crypto?.subtle && (backend.isDemo || !!backend.libraryId);
        let savedPages: Awaited<ReturnType<typeof prepareDownloadCheckpoint>> | undefined;
        if (resumable) {
          // Demo timestamps are generated for display each time its metadata is read.
          const uploadDate = backend.isDemo ? "" : String(details.uploadDate ?? "");
          const manifest = await downloadChecksum(new TextEncoder().encode(JSON.stringify([identity, uploadDate, details.scanlator, pages])));
          if (!backend.isDemo) await assertLibrarySession(backend.serverBaseUrl, backend.libraryId);
          check(entry);
          savedPages = await prepareDownloadCheckpoint(storageKey, token, manifest);
        }
        const cache = await caches.open("yomikura-page-cache");
        let totalSizeBytes = 0;
        const writePage = async (index: number) => {
          check(entry);
          const url = networkUrls[index], storageUrl = attemptPageUrl(url, index, entry);
          const prior = savedPages?.[index];
          let blob = prior ? await readVerifiedDownloadPage(cache, prior) : undefined;
          check(entry);
          if (prior && blob) {
            cachedUrls[index] = prior.url;
          } else {
            if (prior) await recordDownloadPage(storageKey, token, index);
            await networkGate(entry);
            check(entry);
            const response = await fetchCachedPage(url, entry);
            check(entry);
            if (!response.ok) throw new Error(`Chapter page could not be downloaded (HTTP ${response.status}).`);
            blob = await response.blob();
            await validatePageBlob(blob, signal);
            const checksum = savedPages ? await downloadChecksum(await blob.arrayBuffer()) : undefined;
            if (checksum && !backend.isDemo) await assertLibrarySession(backend.serverBaseUrl, backend.libraryId);
            check(entry);
            const headers = new Headers(response.headers);
            if (!headers.has("content-type")) headers.set("content-type", blob.type || "image/jpeg");
            const cachedUrl = storageUrl.toString();
            reserveCachedPage(cachedUrl, token);
            created.push(cachedUrl);
            await cache.put(cachedUrl, new Response(blob, { headers }));
            check(entry);
            if (checksum) await recordDownloadPage(storageKey, token, index, { url: cachedUrl, size: blob.size, checksum });
            cachedUrls[index] = cachedUrl;
          }
          totalSizeBytes += blob.size;
          if (!preferences().splitTallImages) return;
          const tileUrls: string[] = [];
          try {
            const split = await splitTallImage(blob, signal);
            check(entry);
            if (!split) return;
            const tiles: CachedPageTiles["tiles"] = [];
            let tileSize = 0;
            for (const [part, tile] of split.tiles.entries()) {
              const address = new URL(storageUrl);
              address.searchParams.set("__yomi_tile", String(part));
              const tileUrl = address.toString();
              reserveCachedPage(tileUrl, token);
              created.push(tileUrl);
              tileUrls.push(tileUrl);
              await cache.put(tileUrl, new Response(tile.blob, { headers: { "content-type": "image/png" } }));
              check(entry);
              tileSize += tile.blob.size;
              tiles.push({ url: tileUrl, height: tile.height });
            }
            pageTiles.push({ index, width: split.width, height: split.height, tiles });
            totalSizeBytes += tileSize;
          } catch {
            releaseCachedPageClaims(token, tileUrls);
            await cleanupUnreferencedCachedPages(tileUrls).catch(() => undefined);
            check(entry); // Optional tiling may fail while the verified original remains usable.
          }
        };
        let nextIndex = 0, completed = 0, failure: unknown;
        const pageWorker = async () => { while (nextIndex < pages.length && failure === undefined) {
          const index = nextIndex++;
          try {
            await writePage(index);
            completed += 1;
            update(entry, { progress: completed });
            if (completed === pages.length || completed % 5 === 0) await persist(entry, "downloading");
          } catch (error) { if (failure === undefined) failure = error; entry.controller.abort(); }
        } };
        const pageLimit = Math.min(preferences().pageConcurrency, pages.length);
        await Promise.allSettled(Array.from({ length: pageLimit }, pageWorker));
        if (failure !== undefined) throw failure;
        if (completed !== pages.length) throw new Error("Not every page was saved. Retry this chapter.");
        await entry.persist;
        check(entry);
        if (!backend.isDemo) await assertLibrarySession(backend.serverBaseUrl, backend.libraryId);
        const head = await getProgressHead(backend, chapterId).catch(() => undefined);
        const progress = head && (head.libraryId ?? undefined) === backend.libraryId && chapterIdentityMatches(head.chapter, identity) ? head.patch : details;
        const previous = await getCachedChapter(backend.serverBaseUrl, chapterId, backend.isDemo, backend.libraryId ?? ""); check(entry);
        await saveCachedChapter({ cacheKey: storageKey, serverBaseUrl: backend.serverBaseUrl, isDemo: backend.isDemo, libraryId: backend.libraryId,
          id: details.id, name: details.name, chapterNumber: details.chapterNumber, mangaId: details.mangaId, mangaTitle, sourceOrder: details.sourceOrder,
          isBookmarked: progress.isBookmarked ?? details.isBookmarked, scanlator: details.scanlator, uploadDate: String(details.uploadDate ?? ""),
          pageCount: pages.length, pages, networkUrls, cachedUrls, pageTiles: pageTiles.sort((a, b) => a.index - b.index), totalSizeBytes, cachedAt: Date.now(), isRead: progress.isRead, lastPageRead: Math.max(0, Math.min(progress.lastPageRead, pages.length - 1)),
        }, signal, token);
        if (previous) await cleanupUnreferencedCachedPages(cachedPageUrls(previous)).catch(() => undefined);
        if (!entry.reason) remove(entry);
        await get().loadCachedChapters();
      } catch (error) {
        if (error instanceof DownloadJobChangedError && !entry.reason) remove(entry);
        else if (!entry.reason) {
          const message = error instanceof Error && error.name === "QuotaExceededError"
            ? "Device storage is full. Free up space, then retry this chapter."
            : error instanceof Error ? error.message : "Chapter download failed.";
          update(entry, { status: "error", error: message });
          await persist(entry, "failed").catch((failure) => {
            if (failure instanceof DownloadJobChangedError) remove(entry);
            else update(entry, { error: "Download stopped, but its retry status could not be saved. Check device storage before retrying." });
          });
        }
      } finally {
        releaseCachedPageClaims(token);
        await cleanupUnreferencedCachedPages(created).catch(() => undefined);
        entry.running = false; entry.settle(); publish();
      }
    };
    pump = () => {
      if (paused) return;
      const limit = useSettingsStore.getState().downloadConcurrency;
      while (runningJobs < limit && queue.length) {
        const index = queue.findIndex((entry) => networkAllowed(entry)); if (index < 0) { publish(); break; }
        const [entry] = queue.splice(index, 1); if (entry.reason || entries.get(entry.key) !== entry) continue;
        runningJobs += 1;
        void run(entry).finally(() => { runningJobs -= 1; pump(); }).catch(() => undefined);
      }
    };
    stop = (entry, reason) => {
      if (entry.stopping) return entry.stopping;
      entry.reason = reason; entry.controller.abort(); const index = queue.indexOf(entry); if (index >= 0) queue.splice(index, 1); publish();
      const stopping = (async () => {
        await entry.persist.catch(() => undefined); if (!entry.running) entry.settle(); await entry.done;
        if (reason === "pause") await persist(entry, "queued").catch((error) => { if (!(error instanceof DownloadJobChangedError)) throw error; });
        else if (reason === "cancel") await deleteDownloadJob(entry.backend.serverBaseUrl, entry.chapterId, entry.backend.isDemo, entry.backend.libraryId ?? "");
        remove(entry);
      })();
      entry.stopping = stopping;
      void stopping.catch(() => { entry.stopping = undefined; entry.reason = undefined; update(entry, { status: "error", error: "Download stopped, but its saved queue state could not be updated. Check storage and retry." }); });
      return stopping;
    };
    const enqueue = async (id: number, title?: string, provided?: ProgressBackend, restoredJob?: DownloadJob, expectedLifecycle?: number) => {
      if (!Number.isSafeInteger(id) || id < 0) throw new Error("Choose a valid chapter to download.");
      const backend = targetFor(provided); const native = isTauri();
      if (!native && !backend.isDemo) {
        await createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, "live").EnqueueChapterDownload({ input: { id } }); return;
      }
      const key = jobKey(backend, id); const existing = entries.get(key);
      let attempts = restoredJob?.attempts ?? 0, chapterName = restoredJob?.chapterName;
      if (existing) {
        if (existing.stopping) await existing.stopping;
        else if (existing.progress.status !== "error") return;
        else {
          attempts = existing.progress.attempts ?? 0;
          chapterName = existing.progress.chapterName;
          title ??= existing.mangaTitle;
          await stop(existing, "retry");
        }
        if (entries.has(key)) return;
      }
      if (expectedLifecycle !== undefined && expectedLifecycle !== lifecycleRevision) return;
      let settle!: () => void; const done = new Promise<void>((resolve) => { settle = resolve; });
      const storageKey = getChapterCacheKey(backend.serverBaseUrl, id, backend.isDemo, backend.libraryId ?? "");
      const entry: Entry = { key, storageKey, token: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, backend, chapterId: id, mangaTitle: title, native,
        controller: new AbortController(), progress: { progress: 0, total: 0, status: "queued", attempts, mangaTitle: title, chapterName }, running: false, persist: Promise.resolve(), done, settle };
      entries.set(key, entry); entry.persist = persist(entry, "queued", { resumeFrom: restoredJob?.jobKey }); publish();
      try { await entry.persist; }
      catch (error) {
        entry.settle();
        if (error instanceof DownloadJobChangedError) { remove(entry); return; }
        update(entry, { status: "error", error: "The download could not be retained on this device. Check storage before retrying." });
        throw error;
      }
      if (entry.reason || entry.controller.signal.aborted) { entry.settle(); return; }
      paused = false; queue.push(entry); pump();
    };
    const stopBackend = async (backend: ProgressBackend) => {
      const results = await Promise.allSettled([...entries.values()].filter((entry) => backendScope(entry.backend) === backendScope(backend)).map((entry) => stop(entry, "cancel")));
      const error = results.find((result): result is PromiseRejectedResult => result.status === "rejected"); if (error) throw error.reason;
    };
    return {
      cachedChapters: [], cachedChapterIds: new Set(), activeDownloads: {}, downloadControllers: {}, storageUsage: 0, storageQuota: 0, recoveryError: "",
      loadCachedChapters: async () => {
        const revision = ++cacheLoadRevision; let backend: ProgressBackend;
        try { backend = targetFor(); } catch { set({ cachedChapters: [], cachedChapterIds: new Set() }); return; }
        const chapters = await getCachedChapters(backend.serverBaseUrl, backend.isDemo, backend.libraryId ?? ""); const estimate = await getStorageEstimate();
        if (revision !== cacheLoadRevision || currentKey() !== backendScope(backend)) return;
        set({ cachedChapters: chapters, cachedChapterIds: new Set(chapters.map((chapter) => chapter.id)), storageUsage: estimate.usage, storageQuota: estimate.quota });
      },
      restoreDownloadJobs: async () => {
        let backend: ProgressBackend; try { backend = targetFor(); } catch { return; }
        if (!isTauri() && !backend.isDemo) return;
        const scope = backendScope(backend);
        paused = false; publish(); const lifecycle = lifecycleRevision;
        if (restoring.has(scope)) return restoring.get(scope)!;
        if (restored.has(scope)) { pump(); return; }
        const restore = (async () => {
          try {
            for (const job of await getDownloadJobs(backend.serverBaseUrl, backend.isDemo, backend.libraryId ?? "")) {
              if (currentKey() !== scope || lifecycle !== lifecycleRevision) return;
              if (entries.has(jobKey(backend, job.chapterId))) {
                const existing = entries.get(jobKey(backend, job.chapterId))!;
                if (existing.stopping) await existing.stopping; else continue;
                if (currentKey() !== scope || lifecycle !== lifecycleRevision) return;
              }
              if (job.status === "failed") {
                let settle!: () => void; const done = new Promise<void>((resolve) => { settle = resolve; }); settle();
                entries.set(jobKey(backend, job.chapterId), { key: jobKey(backend, job.chapterId), storageKey: job.jobKey, token: job.attempt ?? "restored-error", backend, chapterId: job.chapterId, mangaTitle: job.mangaTitle, native: isTauri(), controller: new AbortController(),
                  progress: { progress: job.progress, total: job.total, attempts: job.attempts, mangaTitle: job.mangaTitle, chapterName: job.chapterName, status: "error", error: job.error || "Download was interrupted." }, running: false, persist: Promise.resolve(), done, settle }); publish();
              } else await enqueue(job.chapterId, job.mangaTitle, backend, job, lifecycle);
            }
            if (currentKey() === scope && lifecycle === lifecycleRevision && !paused) { restored.add(scope); set({ recoveryError: "" }); }
          } catch { if (currentKey() === scope && lifecycle === lifecycleRevision) set({ recoveryError: "Saved download jobs could not be restored. Check device storage and retry." }); }
        })();
        restoring.set(scope, restore); try { await restore; } finally { if (restoring.get(scope) === restore) restoring.delete(scope); }
      },
      downloadChapter: (id, title, backend) => enqueue(id, title, backend),
      retryDownload: (id, title, backend) => enqueue(id, title, backend),
      cancelDownload: (id, provided) => { const backend = targetFor(provided); const entry = entries.get(jobKey(backend, id)); if (entry) void stop(entry, "cancel").catch(() => undefined); else void deleteDownloadJob(backend.serverBaseUrl, id, backend.isDemo, backend.libraryId ?? "").catch(() => undefined); },
      cancelAllDownloads: (provided) => { void stopBackend(targetFor(provided)).catch(() => undefined); },
      pauseForShutdown: () => { void pause(); },
      deleteChapter: async (id, provided) => { const backend = targetFor(provided); const entry = entries.get(jobKey(backend, id)); if (entry) await stop(entry, "cancel"); else await deleteDownloadJob(backend.serverBaseUrl, id, backend.isDemo, backend.libraryId ?? ""); await deleteCachedChapter(backend.serverBaseUrl, id, backend.isDemo, backend.libraryId ?? ""); await get().loadCachedChapters(); },
      clearAll: async (provided) => { const backend = targetFor(provided); await stopBackend(backend); await clearBackendCache(backend.serverBaseUrl, backend.isDemo, backend.libraryId ?? ""); await get().loadCachedChapters(); },
    };
  });
  const unsubscribe = useSettingsStore.subscribe((next, previous) => {
    let nextKey = "", previousKey = "";
    try { nextKey = backendScope(progressBackend(next.serverBaseUrl, next.mockMode)); } catch { /* Incomplete connection input. */ }
    try { previousKey = backendScope(progressBackend(previous.serverBaseUrl, previous.mockMode)); } catch { /* Incomplete connection input. */ }
    if (nextKey !== previousKey) {
      cacheLoadRevision += 1; store.setState({ cachedChapters: [], cachedChapterIds: new Set(), recoveryError: "" }); publish();
      if (nextKey) void store.getState().loadCachedChapters().catch(() => undefined);
    }
    if (next.downloadConcurrency !== previous.downloadConcurrency || next.experience?.downloads !== previous.experience?.downloads) { publish(); pump(); }
  });
  const connection = connectionInformation(); const networkChanged = () => { publish(); pump(); };
  const libraryChanged = (event: Event) => {
    const settings = useSettingsStore.getState(), server = (event as CustomEvent<string>).detail;
    if (settings.mockMode || typeof server === "string" && server !== normalizeCacheServerUrl(settings.serverBaseUrl)) return;
    cacheLoadRevision += 1; store.getState().pauseForShutdown();
    store.setState({ cachedChapters: [], cachedChapterIds: new Set(), recoveryError: "" });
    void store.getState().loadCachedChapters().catch(() => undefined);
  };
  connection?.addEventListener?.("change", networkChanged); if (typeof window !== "undefined") { window.addEventListener("online", networkChanged); window.addEventListener("offline", networkChanged); window.addEventListener(LIBRARY_SESSION_EVENT, libraryChanged); }
  return Object.assign(store, { dispose: async () => { await pause(); unsubscribe(); connection?.removeEventListener?.("change", networkChanged); if (typeof window !== "undefined") { window.removeEventListener("online", networkChanged); window.removeEventListener("offline", networkChanged); window.removeEventListener(LIBRARY_SESSION_EVENT, libraryChanged); } } });
}
export const useDownloadStore = createDownloadStore();
