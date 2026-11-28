// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createDownloadStore } from "./useDownloadStore";
import { progressBackend } from "../api/suwayomi/backendIdentity";
import * as cache from "../api/suwayomi/offlineCache";
import * as progress from "../api/suwayomi/progressStorage";
import { DEFAULT_DOWNLOAD_EXPERIENCE, type DownloadExperience } from "./downloadExperience";
import { assertLibrarySession, rememberLibrary } from "../api/suwayomi/librarySession";
vi.mock("../api/suwayomi/librarySession", async (original) => ({ ...await original<typeof import("../api/suwayomi/librarySession")>(), assertLibrarySession: vi.fn(async () => undefined) }));

const mocks = vi.hoisted(() => ({
  settings: { serverBaseUrl: "http://first.example", mockMode: false, downloadConcurrency: 2 } as { serverBaseUrl: string; mockMode: boolean; downloadConcurrency: number; experience?: { downloads: DownloadExperience } }, native: true,
  listeners: new Set<(next: any, previous: any) => void>(), client: vi.fn(), invoke: vi.fn(), tiles: vi.fn(),
}));
vi.mock("./useSettingsStore", () => ({ isTauri: () => mocks.native, useSettingsStore: { getState: () => mocks.settings,
  subscribe: (listener: (next: any, previous: any) => void) => { mocks.listeners.add(listener); return () => mocks.listeners.delete(listener); },
} }));
vi.mock("../api/graphql/client", () => ({ createGraphqlClient: (...args: unknown[]) => mocks.client(...args) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args) }));
// These tests exercise storage ownership with labelled byte fixtures. Decoder behavior has its own real-browser coverage.
vi.mock("../api/suwayomi/validatePageBlob", () => ({ validatePageBlob: vi.fn(async () => undefined) }));
vi.mock("../api/suwayomi/tallImageTiles", () => ({ splitTallImage: (...args: unknown[]) => mocks.tiles(...args) }));

const first = progressBackend("http://first.example"); const second = progressBackend("http://second.example");
const marker = "11111111-1111-4111-8111-111111111111";
const liveUrl = (target = first, index = 0) => `${target.serverBaseUrl}/api/v1/manga/42/chapter/1/page/${index}`;
const identifyLibrary = (server = first.serverBaseUrl, id = marker) => { rememberLibrary(server, { marker: id }); return progressBackend(server); };
const png = (value: string) => ({ bytes: [...new TextEncoder().encode(value)], contentType: "image/png" });
let store: ReturnType<typeof createDownloadStore>;
let objects: Map<string, Response>;
let releases: (() => void)[];
let livePages: string[];
let beforeCacheWrite: (key: string) => void;
const switchTo = (target: ReturnType<typeof progressBackend>) => { const previous = mocks.settings; mocks.settings = { ...previous, serverBaseUrl: target.serverBaseUrl, mockMode: target.isDemo }; for (const listener of mocks.listeners) listener(mocks.settings, previous); };
const saved = (target = first) => cache.getCachedChapter(target.serverBaseUrl, 12, target.isDemo);
const fixtureChapter = (target = first): cache.CachedChapter => ({ cacheKey: cache.getChapterCacheKey(target.serverBaseUrl, 12, target.isDemo), serverBaseUrl: target.serverBaseUrl, isDemo: target.isDemo, id: 12, name: "Chapter 12", chapterNumber: 1, mangaId: 42, mangaTitle: target.key === first.key ? "First title" : "Second title", sourceOrder: 1, pageCount: 2, pages: [liveUrl(target), liveUrl(target, 1)], cachedUrls: [liveUrl(target), liveUrl(target, 1)], totalSizeBytes: 6, cachedAt: 1 });
function holdNative(target = first) {
  let release!: () => void; let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; }); const wait = new Promise<void>((resolve) => { release = resolve; }); releases.push(release);
  mocks.invoke.mockImplementation(async (_command, args) => { if (args.serverBaseUrl === target.serverBaseUrl) { started(); await wait; } return png(args.serverBaseUrl); });
  return { entered, release };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks(); vi.resetAllMocks(); mocks.listeners.clear(); mocks.native = true; mocks.settings = { serverBaseUrl: first.serverBaseUrl, mockMode: false, downloadConcurrency: 2 };
  vi.stubGlobal("indexedDB", new IDBFactory()); releases = []; objects = new Map();
  livePages = [0, 1].map((index) => new URL(liveUrl(first, index)).pathname);
  beforeCacheWrite = () => {};
  mocks.tiles.mockResolvedValue(undefined);
  vi.stubGlobal("caches", { open: async () => ({ match: async (key: string) => objects.get(String(key))?.clone(), put: async (key: string, value: Response) => { beforeCacheWrite(key); objects.set(String(key), value.clone()); }, delete: async (key: string) => objects.delete(String(key)), keys: async () => [...objects.keys()].map((url) => new Request(url)) }), delete: async () => { objects.clear(); return true; } });
  mocks.invoke.mockImplementation(async (_command, args) => png(args.serverBaseUrl));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(`demo:${url}`, { headers: { "content-type": "image/png" } })));
  mocks.client.mockImplementation((endpoint, _options, mode) => {
    const base = endpoint.replace(/\/api\/graphql$/, "");
    const target = progressBackend(base, mode === "demo"); const title = target.isDemo ? "[Demo] Sample title" : new URL(base).hostname === new URL(first.serverBaseUrl).hostname ? "First title" : "Second title";
    return {
      GetChapter: vi.fn(async () => ({ chapter: { id: 12, mangaId: 42, name: "Chapter 12", chapterNumber: 1, sourceOrder: 1, pageCount: 2, isRead: false, lastPageRead: 0, manga: { title } } })),
      FetchChapterPages: vi.fn(async () => ({ fetchChapterPages: { pages: target.isDemo ? ["https://images.example/0", "https://images.example/1"] : livePages } })),
      EnqueueChapterDownload: vi.fn(async () => ({})),
    };
  });
  store = createDownloadStore();
});
afterEach(async () => { releases.forEach((release) => release()); await store.dispose(); vi.unstubAllGlobals(); });

describe("download backend ownership", () => {
  it("retains verified book and chapter names for failed jobs across restart", async () => {
    mocks.invoke.mockRejectedValue(new Error("HTTP 503 fixture"));
    await store.getState().downloadChapter(12, undefined, first);
    await vi.waitFor(async () => expect((await cache.getDownloadJobs(first.serverBaseUrl))[0]).toMatchObject({ status: "failed", mangaTitle: "First title", chapterName: "Chapter 12" }));
    const requests = mocks.client.mock.calls.length;
    const restarted = createDownloadStore();
    try {
      await restarted.getState().restoreDownloadJobs();
      expect(restarted.getState().activeDownloads[12]).toMatchObject({ status: "error", mangaTitle: "First title", chapterName: "Chapter 12" });
      expect(mocks.client).toHaveBeenCalledTimes(requests);
    } finally { await restarted.dispose(); }
  });
  it("keeps a prior library's failed job while a replacement downloads the same chapter ID", async () => {
    const newMarker = "22222222-2222-4222-8222-222222222222";
    const earlier = identifyLibrary();
    mocks.invoke.mockImplementation(async (_command, args) => {
      if (args.url.endsWith("/1")) throw new Error("Fixture page failure");
      return png("Earlier saved page");
    });
    await store.getState().downloadChapter(12, "Earlier title", earlier);
    await vi.waitFor(async () => expect((await cache.getDownloadJobs(first.serverBaseUrl, false, marker))[0]?.status).toBe("failed"));
    const earlierPage = (await cache.getDownloadJobs(first.serverBaseUrl, false, marker))[0].checkpoint!.pages[0].url;
    const current = identifyLibrary(first.serverBaseUrl, newMarker);
    mocks.invoke.mockImplementation(async () => png("Replacement page"));
    await store.getState().downloadChapter(12, "Replacement title", current);
    await vi.waitFor(async () => expect((await cache.getCachedChapter(first.serverBaseUrl, 12, false, newMarker))?.libraryId).toBe(newMarker));
    const replacement = (await saved(current))!;
    expect(await objects.get(replacement.cachedUrls[0])!.text()).toBe("Replacement page");
    expect(await cache.getDownloadJobs(first.serverBaseUrl, false, marker)).toHaveLength(1);
    expect(await cache.getDownloadJobs(first.serverBaseUrl, false, newMarker)).toEqual([]);
    expect(store.getState().activeDownloads[12]?.status).not.toBe("error");
    await store.getState().clearAll(current);
    expect(await objects.get(earlierPage)!.text()).toBe("Earlier saved page");
    expect(objects.size).toBe(1);
  });
  it("keeps originals and optional tiles in one owning chapter and deletes both together", async () => {
    mocks.tiles.mockResolvedValue({ width: 400, height: 8000, tiles: [{ blob: new Blob(["first tile"], { type: "image/png" }), height: 4000 }, { blob: new Blob(["second tile"], { type: "image/png" }), height: 4000 }] });
    await store.getState().downloadChapter(12, "First title", first); await vi.waitFor(async () => expect(await saved()).not.toBeNull());
    const chapter = (await saved())!; expect(chapter.pageCount).toBe(2); expect(chapter.cachedUrls).toHaveLength(2); expect(chapter.pageTiles).toHaveLength(2); expect(objects.size).toBe(6);
    expect(await cache.getOwnedCachedPageTiles(liveUrl(), first.serverBaseUrl)).toMatchObject({ index: 0, height: 8000 });
    expect(await cache.getOwnedCachedPageTiles(liveUrl(), second.serverBaseUrl)).toBeUndefined();
    expect(await objects.get(chapter.cachedUrls[0])!.text()).toBe(first.serverBaseUrl);
    await store.getState().deleteChapter(12, first); expect(objects.size).toBe(0);
  });
  it("keeps a valid original when optional tile storage runs out of space", async () => {
    mocks.tiles.mockResolvedValue({ width: 400, height: 8000, tiles: [{ blob: new Blob(["first tile"]), height: 4000 }, { blob: new Blob(["second tile"]), height: 4000 }] });
    vi.stubGlobal("caches", { open: async () => ({ match: async (key: string) => objects.get(String(key))?.clone(), put: async (key: string, value: Response) => { if (String(key).includes("__yomi_tile=1")) throw new DOMException("Full", "QuotaExceededError"); objects.set(String(key), value.clone()); }, delete: async (key: string) => objects.delete(String(key)) }) });
    await store.getState().downloadChapter(12, "First title", first); await vi.waitFor(async () => expect(await saved()).not.toBeNull());
    expect((await saved())!.pageTiles).toEqual([]); expect(objects.size).toBe(2);
  });
  it("keeps parallel pages in reading order when later pages finish first", async () => {
    mocks.settings.experience = { downloads: { ...DEFAULT_DOWNLOAD_EXPERIENCE, pageConcurrency: 2 } };
    let release!: () => void; const waiting = new Promise<void>((resolve) => { release = resolve; }); releases.push(release);
    mocks.invoke.mockImplementation(async (_command, args) => { const index = Number(args.url.split("/").at(-1)); if (index === 0) await waiting; return png(String(index)); });
    await store.getState().downloadChapter(12, "First title", first);
    await vi.waitFor(() => expect(store.getState().activeDownloads[12].progress).toBe(1)); release();
    await vi.waitFor(async () => expect(await saved()).not.toBeNull()); const chapter = (await saved())!;
    expect(chapter.networkUrls).toEqual([liveUrl(first, 0), liveUrl(first, 1)]);
    expect(await objects.get(chapter.cachedUrls[0])!.text()).toBe("0"); expect(await objects.get(chapter.cachedUrls[1])!.text()).toBe("1");
  });
  it("retains blocked jobs and starts them after the connection cost changes", async () => {
    mocks.settings.experience = { downloads: { ...DEFAULT_DOWNLOAD_EXPERIENCE, unmeteredOnly: true, connectionCost: "metered" } };
    await store.getState().downloadChapter(12, "First title", first);
    expect(store.getState().activeDownloads[12]).toMatchObject({ status: "queued", waitingForNetwork: true }); expect(mocks.invoke).not.toHaveBeenCalled();
    const previous = mocks.settings; mocks.settings = { ...previous, experience: { downloads: { ...previous.experience!.downloads, connectionCost: "unmetered" } } };
    for (const listener of mocks.listeners) listener(mocks.settings, previous);
    await vi.waitFor(async () => expect(await saved()).not.toBeNull());
  });
  it("retains a bookmark edited while the chapter is downloading", async () => {
    const held = holdNative(first); await store.getState().downloadChapter(12, "First title", first); await held.entered;
    await progress.enqueueProgress(first, { kind: "explicit", chapter: { chapterId: 12, chapterName: "Chapter 12", chapterNumber: 1, mangaId: 42, mangaTitle: "First title", sourceOrder: 1, pageCount: 2 }, baseline: { isRead: false, lastPageRead: 0 }, patch: { isBookmarked: true } });
    held.release(); await vi.waitFor(async () => expect((await saved())?.isBookmarked).toBe(true));
  });
  it("settles other parallel writes before cleaning up a failed attempt", async () => {
    mocks.settings.experience = { downloads: { ...DEFAULT_DOWNLOAD_EXPERIENCE, pageConcurrency: 2 } };
    let release!: () => void; const waiting = new Promise<void>((resolve) => { release = resolve; }); releases.push(release);
    mocks.invoke.mockImplementation(async (_command, args) => { if (args.url.endsWith("/0")) { await waiting; return png("first"); } throw new Error("HTTP 503 fixture"); });
    await store.getState().downloadChapter(12, "First title", first);
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2)); release();
    await vi.waitFor(() => expect(store.getState().activeDownloads[12]).toMatchObject({ status: "error", error: "HTTP 503 fixture" }));
    expect(await saved()).toBeNull(); expect(objects.size).toBe(0); expect((await cache.getDownloadJobs(first.serverBaseUrl))[0].status).toBe("failed");
  });
  it("keeps same chapter IDs independent while profiles switch and cancellation targets only the selected owner", async () => {
    const held = holdNative(first); await store.getState().downloadChapter(12, "First title", first); await held.entered;
    const firstController = store.getState().downloadControllers[12]; switchTo(second);
    expect(store.getState().activeDownloads[12]).toBeUndefined();
    let releaseSecond!: () => void; let startSecond!: () => void;
    const secondStarted = new Promise<void>((resolve) => { startSecond = resolve; }); const secondWait = new Promise<void>((resolve) => { releaseSecond = resolve; }); releases.push(releaseSecond);
    const firstTransport = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (command, args) => { if (args.serverBaseUrl === second.serverBaseUrl) { startSecond(); await secondWait; return png(second.key); } return firstTransport(command, args); });
    await store.getState().downloadChapter(12, "Second title", second);
    await secondStarted; const secondController = store.getState().downloadControllers[12];
    store.getState().cancelDownload(12, second); expect(secondController.signal.aborted).toBe(true); expect(firstController.signal.aborted).toBe(false);
    releaseSecond(); held.release(); await vi.waitFor(async () => expect(await saved(first)).not.toBeNull());
    await vi.waitFor(async () => expect(await cache.getDownloadJobs(second.serverBaseUrl)).toEqual([])); expect(await saved(second)).toBeNull();
    expect(mocks.client.mock.calls.filter((call) => call[0].startsWith(first.serverBaseUrl)).every((call) => call[2] === "live")).toBe(true);
  });
  it("preserves a captured live client and page routing when the current profile enters demo", async () => {
    const held = holdNative(first); await store.getState().downloadChapter(12, "First title", first); await held.entered;
    const demo = progressBackend(first.serverBaseUrl, true); switchTo(demo); held.release();
    await vi.waitFor(async () => expect(await saved(first)).not.toBeNull());
    await store.getState().downloadChapter(12, "[Demo] Sample title", demo);
    await vi.waitFor(async () => expect(await saved(demo)).not.toBeNull());
    expect((await saved(first))!.mangaTitle).toBe("First title"); expect((await saved(demo))!.isDemo).toBe(true);
    expect(mocks.invoke.mock.calls.every((call) => call[1].url.startsWith(first.serverBaseUrl))).toBe(true);
    expect(vi.mocked(fetch).mock.calls.some((call) => new URL(String(call[0])).origin === "https://images.example")).toBe(true);
  });
  it("does not publish an old cached-chapter load after a later profile load", async () => {
    let release!: (chapters: cache.CachedChapter[]) => void;
    const old = new Promise<cache.CachedChapter[]>((resolve) => { release = resolve; });
    vi.spyOn(cache, "getCachedChapters").mockImplementation(async (server) => server === first.serverBaseUrl ? old : [fixtureChapter(second)]);
    const loading = store.getState().loadCachedChapters(); switchTo(second);
    await vi.waitFor(() => expect(store.getState().cachedChapters[0]?.mangaTitle).toBe("Second title"));
    release([fixtureChapter(first)]); await loading;
    expect(store.getState().cachedChapters[0].mangaTitle).toBe("Second title");
  });
  it("deletes only the explicitly captured backend and mode after the profile changes", async () => {
    for (const target of [first, second]) { await cache.saveCachedChapter(fixtureChapter(target)); for (const url of fixtureChapter(target).cachedUrls) objects.set(url, new Response(target.key)); }
    switchTo(second); await store.getState().deleteChapter(12, first);
    expect(await saved(first)).toBeNull(); expect(await saved(second)).not.toBeNull(); expect(objects.has(liveUrl(second))).toBe(true);
  });
  it("clears the selected backend without removing another backend's saved copy", async () => {
    await cache.saveCachedChapter(fixtureChapter(first)); await cache.saveCachedChapter(fixtureChapter(second));
    for (const target of [first, second]) for (const url of fixtureChapter(target).cachedUrls) objects.set(url, new Response(target.key));
    await store.getState().clearAll(first);
    expect(await saved(first)).toBeNull(); expect(await saved(second)).not.toBeNull(); expect(objects.has(liveUrl(second))).toBe(true);
  });
  it("clears only the selected backend's unreferenced attempt files after an interrupted process", async () => {
    const orphan = (target: typeof first) => { const url = new URL(liveUrl(target)); url.searchParams.set("__yomi_cache_attempt", "interrupted"); url.searchParams.set("__yomi_cache_owner", target.key); return url.toString(); };
    objects.set(orphan(first), new Response("FIRST")); objects.set(orphan(second), new Response("SECOND"));
    await store.getState().clearAll(first);
    expect(objects.has(orphan(first))).toBe(false); expect(objects.has(orphan(second))).toBe(true);
  });
});

describe("download persistence and cancellation", () => {
  it("saves intent before fetching and does not start network work if storage rejects it", async () => {
    vi.spyOn(cache, "saveDownloadJob").mockRejectedValue(new Error("quota"));
    await expect(store.getState().downloadChapter(12, "First title", first)).rejects.toThrow("quota");
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled(); expect(store.getState().activeDownloads[12].status).toBe("error");
  });
  it("waits for a cancelled producer before deleting so it cannot recreate a saved chapter", async () => {
    let release!: () => void; const wait = new Promise<void>((resolve) => { release = resolve; }); releases.push(release);
    let entered!: () => void; const atCommit = new Promise<void>((resolve) => { entered = resolve; });
    vi.spyOn(progress, "getProgressHead").mockImplementation(async () => { entered(); await wait; return undefined; });
    await store.getState().downloadChapter(12, "First title", first); await atCommit;
    const deleting = store.getState().deleteChapter(12, first); release(); await deleting;
    expect(await saved(first)).toBeNull(); expect(await cache.getDownloadJobs(first.serverBaseUrl)).toEqual([]); expect(objects.size).toBe(0);
  });
  it("keeps an earlier complete copy intact when a replacement download fails", async () => {
    await cache.saveCachedChapter(fixtureChapter(first)); for (const url of fixtureChapter(first).cachedUrls) objects.set(url, new Response("OLD"));
    mocks.invoke.mockImplementation(async (_command, args) => { if (args.url.endsWith("/1")) throw new Error("page failed"); return png("NEW"); });
    await store.getState().downloadChapter(12, "First title", first);
    await vi.waitFor(() => expect(store.getState().activeDownloads[12]?.status).toBe("error"));
    expect((await saved(first))!.cachedAt).toBe(1); expect(await objects.get(liveUrl(first))!.text()).toBe("OLD");
    expect([...objects.keys()].some((key) => key.includes("__yomi_cache_attempt"))).toBe(false);
  });
  it("preserves latest local completion when the cached copy finishes", async () => {
    const held = holdNative(first); await store.getState().downloadChapter(12, "First title", first); await held.entered;
    await progress.enqueueProgress(first, { kind: "reading", epoch: 0, chapter: { chapterId: 12, chapterName: "Chapter 12", chapterNumber: 1, mangaId: 42, mangaTitle: "First title", sourceOrder: 1, pageCount: 2 }, baseline: { isRead: false, lastPageRead: 0 }, patch: { isRead: true, lastPageRead: 1 } });
    held.release(); await vi.waitFor(async () => expect(await saved(first)).not.toBeNull());
    expect(await saved(first)).toMatchObject({ isRead: true, lastPageRead: 1 });
  });
  it("does not resume a stale restore after shutdown", async () => {
    let release!: (jobs: cache.DownloadJob[]) => void; const jobs = new Promise<cache.DownloadJob[]>((resolve) => { release = resolve; });
    vi.spyOn(cache, "getDownloadJobs").mockReturnValue(jobs);
    const restoring = store.getState().restoreDownloadJobs(); store.getState().pauseForShutdown();
    release([{ jobKey: "legacy", serverBaseUrl: first.serverBaseUrl, chapterId: 12, status: "queued", progress: 0, total: 0, attempts: 1, updatedAt: 1 }]); await restoring;
    expect(mocks.client).not.toHaveBeenCalled(); expect(store.getState().activeDownloads).toEqual({});
  });
  it("starts a new queue restore if the shell remounts before the earlier restore returns", async () => {
    await cache.saveDownloadJob({ serverBaseUrl: first.serverBaseUrl, chapterId: 12, status: "queued", progress: 0, total: 0, attempts: 1, updatedAt: 1 });
    let release!: () => void;
    const pendingRead = new Promise<cache.DownloadJob[]>((resolve) => { release = () => resolve([]); });
    vi.spyOn(cache, "getDownloadJobs").mockReturnValueOnce(pendingRead);
    const interrupted = store.getState().restoreDownloadJobs();
    store.getState().pauseForShutdown();
    try {
      await store.getState().restoreDownloadJobs();
      await vi.waitFor(async () => expect(await saved(first)).not.toBeNull());
      expect(mocks.client).toHaveBeenCalledTimes(1);
    } finally { release(); await interrupted; }
  });
  it("continues delegating live website downloads to the captured Suwayomi endpoint", async () => {
    mocks.native = false; switchTo(second); await store.getState().downloadChapter(12, "First title", first);
    expect(mocks.client).toHaveBeenCalledWith(`${first.serverBaseUrl}/api/graphql`, { libraryId: null }, "live"); expect(mocks.invoke).not.toHaveBeenCalled();
    expect(await cache.getDownloadJobs(first.serverBaseUrl)).toEqual([]);
  });
});

describe("verified download checkpoints", () => {
  const jobs = (target: ReturnType<typeof progressBackend>) => cache.getDownloadJobs(target.serverBaseUrl, target.isDemo, target.libraryId);
  const waitForFailure = async (target: ReturnType<typeof progressBackend>) => {
    await vi.waitFor(async () => expect((await jobs(target))[0]?.status).toBe("failed"));
    return (await jobs(target))[0];
  };

  it("reuses a verified page after restart and removes stranded attempt bytes", async () => {
    const target = identifyLibrary();
    let entered!: () => void, release!: () => void;
    const nextPage = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    releases.push(release);
    mocks.invoke.mockImplementation(async (_command, args) => {
      if (args.url.endsWith("/1")) { entered(); await held; }
      return png("Original page");
    });
    await store.getState().downloadChapter(12, undefined, target);
    await nextPage;
    const pageUrl = (await jobs(target))[0].checkpoint!.pages[0].url;
    const orphan = new URL(pageUrl);
    orphan.searchParams.set("__yomi_tile", "0");
    objects.set(orphan.toString(), new Response("Unpublished tile"));
    store.getState().pauseForShutdown();
    release();
    await store.dispose();
    expect((await jobs(target))[0]).toMatchObject({ status: "queued", progress: 1 });
    expect(await saved(target)).toBeNull();

    mocks.invoke.mockClear();
    const restarted = createDownloadStore();
    try {
      await restarted.getState().restoreDownloadJobs();
      await vi.waitFor(async () => expect(await saved(target)).not.toBeNull());
      expect((await saved(target))!.cachedUrls[0]).toBe(pageUrl);
      expect(mocks.invoke.mock.calls.map(([, args]) => args.url)).toEqual([liveUrl(target, 1)]);
      expect(await jobs(target)).toEqual([]);
      expect(objects.has(orphan.toString())).toBe(false);
    } finally { await restarted.dispose(); }
  });

  it("retries after quota pressure and fetches only missing or damaged pages and unfinished work", async () => {
    const target = identifyLibrary();
    livePages = [0, 1, 2, 3].map((index) => new URL(liveUrl(target, index)).pathname);
    beforeCacheWrite = (key) => { if (new URL(key).pathname.endsWith("/3")) throw new DOMException("Fixture quota", "QuotaExceededError"); };
    await store.getState().downloadChapter(12, undefined, target);
    const failed = await waitForFailure(target);
    expect(failed).toMatchObject({ progress: 3, error: "Device storage is full. Free up space, then retry this chapter." });
    expect(await saved(target)).toBeNull();
    const receipts = failed.checkpoint!.pages;
    expect(Object.keys(receipts)).toEqual(["0", "1", "2"]);
    objects.delete(receipts[1].url);
    objects.set(receipts[2].url, new Response("x".repeat(receipts[2].size)));

    beforeCacheWrite = () => {};
    mocks.invoke.mockClear();
    await store.getState().retryDownload(12, undefined, target);
    await vi.waitFor(async () => expect(await saved(target)).not.toBeNull());
    expect(mocks.invoke.mock.calls.map(([, args]) => args.url)).toEqual([1, 2, 3].map((index) => liveUrl(target, index)));
    expect((await saved(target))!.cachedUrls[0]).toBe(receipts[0].url);
    expect(objects.has(receipts[2].url)).toBe(false);
    expect(objects.size).toBe(4);
    expect(await jobs(target)).toEqual([]);
  });

  it("starts fresh when the ordered page manifest changes", async () => {
    const target = identifyLibrary();
    mocks.invoke.mockImplementation(async (_command, args) => {
      if (args.url.endsWith("/1")) throw new Error("Fixture page failure");
      return png("Previous page");
    });
    await store.getState().downloadChapter(12, undefined, target);
    const receipt = (await waitForFailure(target)).checkpoint!.pages[0];
    livePages = [...livePages].reverse();
    mocks.invoke.mockClear();
    mocks.invoke.mockResolvedValue(png("Current page"));
    await store.getState().retryDownload(12, undefined, target);
    await vi.waitFor(async () => expect(await saved(target)).not.toBeNull());
    expect(mocks.invoke.mock.calls.map(([, args]) => args.url)).toEqual([liveUrl(target, 0), liveUrl(target, 1)]);
    expect(objects.has(receipt.url)).toBe(false);
    expect((await saved(target))!.pages).toEqual(livePages);
  });

  it("resumes for the same managed library after its address moves", async () => {
    const earlier = identifyLibrary();
    mocks.invoke.mockImplementation(async (_command, args) => {
      if (args.url.endsWith("/1")) throw new Error("Fixture page failure");
      return png("Verified before the move");
    });
    await store.getState().downloadChapter(12, undefined, earlier);
    const receipt = (await waitForFailure(earlier)).checkpoint!.pages[0];
    const moved = identifyLibrary(`${first.serverBaseUrl}:4568`);
    await cache.moveManagedOfflineRecords(earlier.serverBaseUrl, moved.serverBaseUrl, marker);
    switchTo(moved);
    await store.getState().restoreDownloadJobs();
    expect(store.getState().activeDownloads[12]).toMatchObject({ status: "error", progress: 1 });
    mocks.invoke.mockClear();
    mocks.invoke.mockResolvedValue(png("Downloaded after the move"));
    await store.getState().retryDownload(12, undefined, moved);
    await vi.waitFor(async () => expect(await saved(moved)).not.toBeNull());
    expect(mocks.invoke.mock.calls.map(([, args]) => args.url)).toEqual([liveUrl(moved, 1)]);
    expect((await saved(moved))!.cachedUrls[0]).toBe(receipt.url);
    expect(await (await cache.getOwnedCachedPage(liveUrl(moved), moved.serverBaseUrl))!.text()).toBe("Verified before the move");
    expect(await jobs(earlier)).toEqual([]);
  });

  it("leaves out a page when the live library changes during its fetch", async () => {
    const target = identifyLibrary();
    mocks.invoke.mockImplementation(async (_command, args) => {
      if (args.url.endsWith("/1")) vi.mocked(assertLibrarySession).mockRejectedValueOnce(new Error("Library marker changed"));
      return png(args.url);
    });
    await store.getState().downloadChapter(12, undefined, target);
    const failed = await waitForFailure(target);
    expect(failed.error).toBe("Library marker changed");
    expect(Object.keys(failed.checkpoint!.pages)).toEqual(["0"]);
    expect(objects.size).toBe(1);
    expect(await saved(target)).toBeNull();
    store.getState().cancelDownload(12, target);
    await vi.waitFor(async () => { expect(await jobs(target)).toEqual([]); expect(objects.size).toBe(0); });
  });

  it("fences a superseded writer out of another renderer's completed copy", async () => {
    const target = identifyLibrary();
    const earlier = holdNative(target);
    await store.getState().downloadChapter(12, undefined, target);
    await earlier.entered;
    mocks.invoke.mockResolvedValue(png("New renderer page"));
    const other = createDownloadStore();
    try {
      await other.getState().downloadChapter(12, undefined, target);
      await vi.waitFor(async () => expect(await saved(target)).not.toBeNull());
      const completed = (await saved(target))!;
      earlier.release();
      await vi.waitFor(() => expect(store.getState().activeDownloads[12]).toBeUndefined());
      expect((await saved(target))!.cachedUrls).toEqual(completed.cachedUrls);
      expect(await objects.get(completed.cachedUrls[0])!.text()).toBe("New renderer page");
      expect(await jobs(target)).toEqual([]);
      await vi.waitFor(() => expect(objects.size).toBe(2));
    } finally { await other.dispose(); }
  });
});
