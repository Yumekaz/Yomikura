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
  totalSizeBytes: number;
  cachedAt: number;
  lastPageRead?: number;
  isRead?: boolean;
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
  /** Demo Sandbox activity is intentionally kept separate from a live library. */
  isDemo?: boolean;
  readAt: number;
}

const DB_NAME = "yomikura-offline";
const DB_VERSION = 3;
const STORE_NAME = "chapters";
const HISTORY_STORE_NAME = "reading-history";

export function normalizeCacheServerUrl(serverBaseUrl: string): string {
  return serverBaseUrl.trim().replace(/\/+$/, "");
}

export function getChapterCacheKey(serverBaseUrl: string, chapterId: number): string {
  return `${normalizeCacheServerUrl(serverBaseUrl)}::${chapterId}`;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
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
    };
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
            .filter((event) => !normalizedServer || event.serverBaseUrl === normalizedServer)
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
    const request = db
      .transaction(HISTORY_STORE_NAME, "readwrite")
      .objectStore(HISTORY_STORE_NAME)
      .delete(getReadingHistoryKey(serverBaseUrl, chapterId));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getCachedChapter(serverBaseUrl: string, id: number): Promise<CachedChapter | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(getChapterCacheKey(serverBaseUrl, id));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (error) {
    console.error("IndexedDB error in getCachedChapter:", error);
    return null;
  }
}

export async function getCachedChapters(serverBaseUrl?: string): Promise<CachedChapter[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const chapters = (request.result || []) as CachedChapter[];
        if (!serverBaseUrl) {
          resolve(chapters);
          return;
        }
        const normalizedServer = normalizeCacheServerUrl(serverBaseUrl);
        resolve(chapters.filter((chapter) => chapter.serverBaseUrl === normalizedServer));
      };
    });
  } catch (error) {
    console.error("IndexedDB error in getCachedChapters:", error);
    return [];
  }
}

export async function getCachedChaptersForManga(serverBaseUrl: string, mangaId: number): Promise<CachedChapter[]> {
  const chapters = await getCachedChapters(serverBaseUrl);
  return chapters.filter((c) => c.mangaId === mangaId);
}

export async function saveCachedChapter(chapter: CachedChapter): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(chapter);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function updateCachedChapterProgress(
  serverBaseUrl: string,
  chapterId: number,
  lastPageRead: number,
  isRead: boolean
): Promise<void> {
  const chapter = await getCachedChapter(serverBaseUrl, chapterId);
  if (!chapter) return;

  chapter.lastPageRead = lastPageRead;
  chapter.isRead = isRead;
  await saveCachedChapter(chapter);
}

export async function deleteCachedChapter(serverBaseUrl: string, chapterId: number): Promise<void> {
  const chapter = await getCachedChapter(serverBaseUrl, chapterId);
  if (!chapter) return;

  // 1. Delete from Cache Storage
  try {
    const cache = await caches.open("yomikura-page-cache");
    for (const url of chapter.cachedUrls) {
      await cache.delete(url);
    }
  } catch (err) {
    console.error("Cache Storage delete failed:", err);
  }

  // 2. Delete from IndexedDB
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(chapter.cacheKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function clearAllCache(): Promise<void> {
  // 1. Clear Cache Storage
  try {
    await caches.delete("yomikura-page-cache");
  } catch (err) {
    console.error("Cache Storage clear failed:", err);
  }

  // 2. Clear IndexedDB store
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error("IndexedDB clear failed:", err);
  }
}

export interface StorageEstimate {
  usage: number;
  quota: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (navigator.storage && navigator.storage.estimate) {
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
