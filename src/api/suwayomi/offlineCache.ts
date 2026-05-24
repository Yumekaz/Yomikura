export interface CachedChapter {
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

const DB_NAME = "yomikura-offline";
const DB_VERSION = 1;
const STORE_NAME = "chapters";

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function getCachedChapter(id: number): Promise<CachedChapter | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (error) {
    console.error("IndexedDB error in getCachedChapter:", error);
    return null;
  }
}

export async function getCachedChapters(): Promise<CachedChapter[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  } catch (error) {
    console.error("IndexedDB error in getCachedChapters:", error);
    return [];
  }
}

export async function getCachedChaptersForManga(mangaId: number): Promise<CachedChapter[]> {
  const chapters = await getCachedChapters();
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
  chapterId: number,
  lastPageRead: number,
  isRead: boolean
): Promise<void> {
  const chapter = await getCachedChapter(chapterId);
  if (!chapter) return;

  chapter.lastPageRead = lastPageRead;
  chapter.isRead = isRead;
  await saveCachedChapter(chapter);
}

export async function deleteCachedChapter(chapterId: number): Promise<void> {
  const chapter = await getCachedChapter(chapterId);
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
    const request = store.delete(chapterId);
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
