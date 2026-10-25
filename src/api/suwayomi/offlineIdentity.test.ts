import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteDownloadJob, deleteReadingHistoryItem, getCachedChapter, getCachedChapters, getDownloadJobs, getReadingHistory, normalizeCacheServerUrl, openDB } from "./offlineCache";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

it("reads legacy endpoint spellings without reassigning cached chapters to another host", async () => {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("chapters", "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    tx.objectStore("chapters").put({ cacheKey: "HTTP://LOCALHOST:80::12", serverBaseUrl: "HTTP://LOCALHOST:80", id: 12, mangaId: 42, name: "Legacy chapter", pages: ["/page"], cachedUrls: [], pageCount: 1 });
  }); db.close();
  expect(normalizeCacheServerUrl("HTTP://LOCALHOST:80///")).toBe("http://localhost");
  expect((await getCachedChapter("http://localhost/", 12))?.name).toBe("Legacy chapter");
  expect(await getCachedChapters("http://localhost")).toHaveLength(1);
  expect(await getCachedChapter("http://127.0.0.1", 12)).toBeNull();
});

it("removes legacy jobs and history only within the matching backend", async () => {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["download-jobs", "reading-history"], "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    for (const server of ["HTTP://LOCALHOST:80", "http://other.example"]) {
      tx.objectStore("download-jobs").put({ jobKey: `${server}::12`, serverBaseUrl: server, chapterId: 12, updatedAt: 1 });
      tx.objectStore("reading-history").put({ historyKey: `${server}::12`, serverBaseUrl: server, chapterId: 12, readAt: 1 });
    }
  }); db.close();
  await deleteDownloadJob("http://localhost", 12); await deleteReadingHistoryItem("http://localhost", 12);
  expect(await getDownloadJobs("http://localhost")).toHaveLength(0);
  expect(await getReadingHistory("http://localhost")).toHaveLength(0);
  expect(await getDownloadJobs("http://other.example")).toHaveLength(1);
  expect(await getReadingHistory("http://other.example")).toHaveLength(1);
});
