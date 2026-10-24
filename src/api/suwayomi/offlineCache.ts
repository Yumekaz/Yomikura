export interface CachedChapter {
  cacheKey: string;
  serverBaseUrl: string;
  id: number;
  name: string;
  chapterNumber: number;
  mangaId: number;
  mangaTitle: string;
  sourceOrder: number;
  pageCount: number;
  pages: string[];
  cachedUrls: string[];
  networkUrls?: string[];
  totalSizeBytes: number;
  cachedAt: number;
  lastPageRead?: number;
  isRead?: boolean;
  isDemo?: boolean;
}

export interface ReadingHistoryEvent {
  historyKey: string;
  serverBaseUrl: string;
  chapterId: number;
  chapterName: string;
  chapterNumber: number;
  mangaId: number;
  mangaTitle: string;
  thumbnailUrl?: string | null;
  lastPageRead: number;
  pageCount: number;
  isRead: boolean;
  /** Hidden records suppress stale server history until the chapter is opened again. */
  isHidden?: boolean;
  /** Demo Sandbox activity is intentionally kept separate from a live library. */
  isDemo?: boolean;
  readAt: number;
}

export type DownloadJobStatus = "queued" | "downloading" | "failed";

export interface DownloadJob {
  jobKey: string;
  serverBaseUrl: string;
  chapterId: number;
  mangaTitle?: string;
  status: DownloadJobStatus;
  progress: number;
  total: number;
  attempts: number;
  error?: string;
  updatedAt: number;
  isDemo?: boolean;
}

const DB_NAME = "yomikura-offline";
const DB_VERSION = 4;
const STORE_NAME = "chapters";
const HISTORY_STORE_NAME = "reading-history";
const DOWNLOAD_JOB_STORE_NAME = "download-jobs";

export function normalizeCacheServerUrl(serverBaseUrl: string): string {
  const trimmed = serverBaseUrl.trim().replace(/\/+$/, "");
  try { return new URL(trimmed).toString().replace(/\/+$/, ""); }
  catch { return trimmed; }
}

export function getChapterCacheKey(serverBaseUrl: string, chapterId: number, isDemo = false): string {
  return `${isDemo ? "demo::" : ""}${normalizeCacheServerUrl(serverBaseUrl)}::${chapterId}`;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
        store.createIndex("serverBaseUrl", "serverBaseUrl", { unique: false });
        store.createIndex("id", "id", { unique: false });
        store.createIndex("mangaId", "mangaId", { unique: false });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        const historyStore = db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "historyKey" });
        historyStore.createIndex("serverBaseUrl", "serverBaseUrl", { unique: false });
        historyStore.createIndex("readAt", "readAt", { unique: false });
        historyStore.createIndex("mangaId", "mangaId", { unique: false });
      }
      if (!db.objectStoreNames.contains(DOWNLOAD_JOB_STORE_NAME)) {
        const downloadStore = db.createObjectStore(DOWNLOAD_JOB_STORE_NAME, { keyPath: "jobKey" });
        downloadStore.createIndex("serverBaseUrl", "serverBaseUrl", { unique: false });
        downloadStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

export function getDownloadJobKey(serverBaseUrl: string, chapterId: number, isDemo = false): string {
  return getChapterCacheKey(serverBaseUrl, chapterId, isDemo);
}

/** Legacy demo rows used the app's [Demo] title marker before an explicit mode field existed. */
export const isDemoCacheRecord = (record: { isDemo?: boolean; mangaTitle?: string }) => record.isDemo ?? record.mangaTitle?.startsWith("[Demo]") ?? false;
async function offlineTransaction<T>(names: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
  const db = await openDB(); const tx = db.transaction(names, mode);
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(signal?.aborted ? new DOMException("Download cancelled", "AbortError") : tx.error ?? new Error("Offline storage transaction failed.")); });
  const abort = () => { try { tx.abort(); } catch { /* Already settled. */ } };
  signal?.addEventListener("abort", abort, { once: true });
  try { if (signal?.aborted) abort(); const result = await work(tx); await done; return result; }
  catch (error) { abort(); await done.catch(() => undefined); throw error; }
  finally { signal?.removeEventListener("abort", abort); db.close(); }
}
const offlineRead = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const pageClaims = new Map<string, Set<string>>();
const pageIndexes = new Map<string, { expires: number; promise: Promise<Map<string, string>> }>();
const imageCacheKey = (value: string) => { try { return new URL(value).toString(); } catch { return value; } };
function invalidatePageIndexes(serverBaseUrl?: string) {
  if (!serverBaseUrl) { pageIndexes.clear(); return; }
  for (const demo of [false, true]) pageIndexes.delete(JSON.stringify([normalizeCacheServerUrl(serverBaseUrl), demo]));
}
export function reserveCachedPage(url: string, owner: string) { const owners = pageClaims.get(url) ?? new Set<string>(); owners.add(owner); pageClaims.set(url, owners); }
export function releaseCachedPageClaims(owner: string) { for (const [url, owners] of pageClaims) { owners.delete(owner); if (!owners.size) pageClaims.delete(url); } }
export async function cleanupUnreferencedCachedPages(urls: string[]) {
  const chapters = await offlineTransaction([STORE_NAME], "readonly", (tx) => offlineRead<CachedChapter[]>(tx.objectStore(STORE_NAME).getAll()));
  const retained = new Set(chapters.flatMap((chapter) => chapter.cachedUrls));
  const cache = await caches.open("yomikura-page-cache");
  for (const url of new Set(urls)) if (!retained.has(url) && !pageClaims.has(url)) await cache.delete(url);
}

export async function saveDownloadJob(job: Omit<DownloadJob, "jobKey" | "serverBaseUrl"> & { serverBaseUrl: string }): Promise<void> {
  const serverBaseUrl = normalizeCacheServerUrl(job.serverBaseUrl); const isDemo = isDemoCacheRecord(job);
  const record: DownloadJob = { ...job, serverBaseUrl, isDemo, jobKey: getDownloadJobKey(serverBaseUrl, job.chapterId, isDemo) };
  await offlineTransaction([DOWNLOAD_JOB_STORE_NAME], "readwrite", async (tx) => {
    const store = tx.objectStore(DOWNLOAD_JOB_STORE_NAME);
    const previous = await offlineRead<DownloadJob | undefined>(store.get(record.jobKey));
    if (previous && isDemoCacheRecord(previous) !== isDemo) {
      const preserved = getDownloadJobKey(previous.serverBaseUrl, previous.chapterId, isDemoCacheRecord(previous));
      if (!await offlineRead(store.get(preserved))) store.put({ ...previous, jobKey: preserved, isDemo: isDemoCacheRecord(previous) });
    }
    store.put(record);
  });
}

export async function getDownloadJobs(serverBaseUrl?: string, isDemo = false): Promise<DownloadJob[]> {
  const jobs = await offlineTransaction([DOWNLOAD_JOB_STORE_NAME], "readonly", (tx) => offlineRead<DownloadJob[]>(tx.objectStore(DOWNLOAD_JOB_STORE_NAME).getAll()));
  const byIdentity = new Map<string, DownloadJob>();
  for (const job of jobs) {
    if (serverBaseUrl && (normalizeCacheServerUrl(job.serverBaseUrl) !== normalizeCacheServerUrl(serverBaseUrl) || isDemoCacheRecord(job) !== isDemo)) continue;
    const key = getDownloadJobKey(job.serverBaseUrl, job.chapterId, isDemoCacheRecord(job));
    const older = byIdentity.get(key);
    if (!older || job.updatedAt > older.updatedAt || job.updatedAt === older.updatedAt && job.jobKey === key) byIdentity.set(key, job);
  }
  return [...byIdentity.values()].sort((a, b) => a.updatedAt - b.updatedAt);
}

export async function deleteDownloadJob(serverBaseUrl: string, chapterId: number, isDemo = false): Promise<void> {
  await offlineTransaction([DOWNLOAD_JOB_STORE_NAME], "readwrite", async (tx) => {
    const store = tx.objectStore(DOWNLOAD_JOB_STORE_NAME);
    for (const job of await offlineRead<DownloadJob[]>(store.getAll())) if (job.chapterId === chapterId && normalizeCacheServerUrl(job.serverBaseUrl) === normalizeCacheServerUrl(serverBaseUrl) && isDemoCacheRecord(job) === isDemo) store.delete(job.jobKey);
  });
}


export function getReadingHistoryKey(serverBaseUrl: string, chapterId: number): string {
  return `${normalizeCacheServerUrl(serverBaseUrl)}::${chapterId}`;
}

export async function recordReadingActivity(
  serverBaseUrl: string,
  event: Omit<ReadingHistoryEvent, "historyKey" | "serverBaseUrl" | "readAt"> & { readAt?: number }
): Promise<void> {
  const normalizedServer = normalizeCacheServerUrl(serverBaseUrl);
  return saveReadingHistoryEvent({
    ...event,
    historyKey: getReadingHistoryKey(normalizedServer, event.chapterId),
    serverBaseUrl: normalizedServer,
    readAt: event.readAt ?? Date.now(),
  });
}

async function saveReadingHistoryEvent(event: ReadingHistoryEvent): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, "readwrite");
    const request = transaction.objectStore(HISTORY_STORE_NAME).put(event);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getReadingHistory(serverBaseUrl?: string): Promise<ReadingHistoryEvent[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(HISTORY_STORE_NAME, "readonly").objectStore(HISTORY_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const events = (request.result || []) as ReadingHistoryEvent[];
        const normalizedServer = serverBaseUrl ? normalizeCacheServerUrl(serverBaseUrl) : undefined;
        resolve(
          events
            .filter((event) => !normalizedServer || normalizeCacheServerUrl(event.serverBaseUrl) === normalizedServer)
            .sort((a, b) => b.readAt - a.readAt)
        );
      };
    });
  } catch (error) {
    console.error("IndexedDB error in getReadingHistory:", error);
    return [];
  }
}

export async function deleteReadingHistoryItem(serverBaseUrl: string, chapterId: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(HISTORY_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const event of request.result as ReadingHistoryEvent[]) if (event.chapterId === chapterId && normalizeCacheServerUrl(event.serverBaseUrl) === normalizeCacheServerUrl(serverBaseUrl)) store.delete(event.historyKey);
    };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
    transaction.oncomplete = () => { db.close(); resolve(); };
  });
}

export async function hideReadingHistoryItem(event: Omit<ReadingHistoryEvent, "historyKey" | "serverBaseUrl" | "readAt">, serverBaseUrl: string): Promise<void> {
  await saveReadingHistoryEvent({
    ...event,
    historyKey: getReadingHistoryKey(serverBaseUrl, event.chapterId),
    serverBaseUrl: normalizeCacheServerUrl(serverBaseUrl),
    isHidden: true,
    readAt: Date.now(),
  });
}

export async function getCachedChapter(serverBaseUrl: string, id: number, isDemo = false): Promise<CachedChapter | null> {
  try {
    const direct = await offlineTransaction([STORE_NAME], "readonly", (tx) => offlineRead<CachedChapter | undefined>(tx.objectStore(STORE_NAME).get(getChapterCacheKey(serverBaseUrl, id, isDemo))));
    if (direct && direct.id === id && normalizeCacheServerUrl(direct.serverBaseUrl) === normalizeCacheServerUrl(serverBaseUrl) && isDemoCacheRecord(direct) === isDemo) return direct;
  } catch { /* Retain legacy lookup/error handling below. */ }
  return (await getCachedChapters(serverBaseUrl, isDemo)).find((chapter) => chapter.id === id) ?? null;
}

export async function getCachedChapters(serverBaseUrl?: string, isDemo = false): Promise<CachedChapter[]> {
  try {
    const chapters = await offlineTransaction([STORE_NAME], "readonly", (tx) => offlineRead<CachedChapter[]>(tx.objectStore(STORE_NAME).getAll()));
    const byIdentity = new Map<string, CachedChapter>();
    for (const chapter of chapters) {
      if (serverBaseUrl && (normalizeCacheServerUrl(chapter.serverBaseUrl) !== normalizeCacheServerUrl(serverBaseUrl) || isDemoCacheRecord(chapter) !== isDemo)) continue;
      const key = getChapterCacheKey(chapter.serverBaseUrl, chapter.id, isDemoCacheRecord(chapter));
      const older = byIdentity.get(key);
      if (!older || (chapter.cachedAt ?? 0) > (older.cachedAt ?? 0) || chapter.cachedAt === older.cachedAt && chapter.cacheKey === key) byIdentity.set(key, chapter);
    }
    return [...byIdentity.values()];
  } catch (error) { console.error("IndexedDB error in getCachedChapters:", error); return []; }
}

export async function getCachedChaptersForManga(serverBaseUrl: string, mangaId: number, isDemo = false): Promise<CachedChapter[]> {
  return (await getCachedChapters(serverBaseUrl, isDemo)).filter((chapter) => chapter.mangaId === mangaId);
}

export async function saveCachedChapter(chapter: CachedChapter, signal?: AbortSignal): Promise<void> {
  const serverBaseUrl = normalizeCacheServerUrl(chapter.serverBaseUrl); const isDemo = isDemoCacheRecord(chapter);
  const record = { ...chapter, serverBaseUrl, isDemo, cacheKey: getChapterCacheKey(serverBaseUrl, chapter.id, isDemo) };
  const changed = await offlineTransaction([STORE_NAME], "readwrite", async (tx) => {
    const store = tx.objectStore(STORE_NAME);
    const previous = await offlineRead<CachedChapter | undefined>(store.get(record.cacheKey));
    if (previous && isDemoCacheRecord(previous) !== isDemo) {
      const preserved = getChapterCacheKey(previous.serverBaseUrl, previous.id, isDemoCacheRecord(previous));
      if (!await offlineRead(store.get(preserved))) store.put({ ...previous, cacheKey: preserved, isDemo: isDemoCacheRecord(previous) });
    }
    store.put(record);
    return (!!previous && isDemoCacheRecord(previous) !== isDemo) || JSON.stringify([previous?.pages, previous?.cachedUrls, previous?.networkUrls]) !== JSON.stringify([record.pages, record.cachedUrls, record.networkUrls]);
  }, signal);
  if (changed) invalidatePageIndexes(serverBaseUrl);
}

export async function updateCachedChapterProgress(serverBaseUrl: string, chapterId: number, lastPageRead: number, isRead: boolean, isDemo = false): Promise<void> {
  const chapter = await getCachedChapter(serverBaseUrl, chapterId, isDemo); if (!chapter) return;
  await saveCachedChapter({ ...chapter, lastPageRead, isRead });
}

export async function deleteCachedChapter(serverBaseUrl: string, chapterId: number, isDemo = false): Promise<void> {
  const urls = await offlineTransaction([STORE_NAME], "readwrite", async (tx) => {
    const store = tx.objectStore(STORE_NAME); const removed: string[] = [];
    for (const chapter of await offlineRead<CachedChapter[]>(store.getAll())) {
      if (chapter.id === chapterId && normalizeCacheServerUrl(chapter.serverBaseUrl) === normalizeCacheServerUrl(serverBaseUrl) && isDemoCacheRecord(chapter) === isDemo) { removed.push(...chapter.cachedUrls); store.delete(chapter.cacheKey); }
    }
    return removed;
  });
  invalidatePageIndexes(serverBaseUrl);
  await cleanupUnreferencedCachedPages(urls);
}

export async function clearAllCache(): Promise<void> {
  await offlineTransaction([STORE_NAME, DOWNLOAD_JOB_STORE_NAME], "readwrite", async (tx) => { tx.objectStore(STORE_NAME).clear(); tx.objectStore(DOWNLOAD_JOB_STORE_NAME).clear(); });
  invalidatePageIndexes();
  await caches.delete("yomikura-page-cache");
}

export async function clearBackendCache(serverBaseUrl: string, isDemo = false): Promise<void> {
  const chapters = await getCachedChapters(serverBaseUrl, isDemo);
  for (const chapter of chapters) await deleteCachedChapter(serverBaseUrl, chapter.id, isDemo);
  for (const job of await getDownloadJobs(serverBaseUrl, isDemo)) await deleteDownloadJob(serverBaseUrl, job.chapterId, isDemo);
  const owner = JSON.stringify([isDemo ? "demo" : "live", normalizeCacheServerUrl(serverBaseUrl)]);
  const cache = await caches.open("yomikura-page-cache");
  const orphaned = (await cache.keys()).filter((request) => new URL(request.url).searchParams.get("__yomi_cache_owner") === owner).map((request) => request.url);
  await cleanupUnreferencedCachedPages(orphaned);
}

/** Page bytes may be shared by URL, but only a matching backend/mode record grants an offline lookup. */
export async function getOwnedCachedPage(source: string, serverBaseUrl: string, isDemo = false): Promise<Response | undefined> {
  if (!serverBaseUrl.trim()) return undefined;
  const key = JSON.stringify([normalizeCacheServerUrl(serverBaseUrl), isDemo]);
  let index = pageIndexes.get(key);
  if (!index || index.expires <= Date.now()) {
    const loading = { expires: Infinity, promise: Promise.resolve(new Map<string, string>()) };
    loading.promise = (async () => {
      const pages = new Map<string, string>();
      const add = (url: string, stored: string) => pages.set(imageCacheKey(url), stored);
      for (const chapter of await getCachedChapters(serverBaseUrl, isDemo)) {
        for (let page = 0; page < chapter.pages.length; page += 1) {
          const original = chapter.pages[page]; const stored = chapter.cachedUrls[page] ?? original;
          add(stored, stored); add(original, stored);
          add(/^https?:\/\//i.test(original) ? original : `${normalizeCacheServerUrl(serverBaseUrl)}${original.startsWith("/") ? "" : "/"}${original}`, stored);
          if (chapter.networkUrls?.[page]) add(chapter.networkUrls[page], stored);
        }
      }
      loading.expires = Date.now() + 1000; return pages;
    })();
    index = loading; pageIndexes.set(key, loading);
    if (pageIndexes.size > 4) pageIndexes.delete(pageIndexes.keys().next().value!);
  }
  const stored = (await index.promise).get(imageCacheKey(source));
  return stored ? (await caches.open("yomikura-page-cache")).match(stored) : undefined;
}


export interface StorageEstimate {
  usage: number;
  quota: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    } catch (err) {
      console.error("Storage estimate query failed:", err);
    }
  }
  return { usage: 0, quota: 0 };
}
