// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createDownloadStore } from "./useDownloadStore";
import { progressBackend } from "../api/suwayomi/backendIdentity";
import * as cache from "../api/suwayomi/offlineCache";
import * as progress from "../api/suwayomi/progressStorage";

const mocks = vi.hoisted(() => ({
  settings: { serverBaseUrl: "http://first.example", mockMode: false, downloadConcurrency: 2 }, native: true,
  listeners: new Set<(next: any, previous: any) => void>(), client: vi.fn(), invoke: vi.fn(),
}));
vi.mock("./useSettingsStore", () => ({ isTauri: () => mocks.native, useSettingsStore: { getState: () => mocks.settings,
  subscribe: (listener: (next: any, previous: any) => void) => { mocks.listeners.add(listener); return () => mocks.listeners.delete(listener); },
} }));
vi.mock("../api/graphql/client", () => ({ createGraphqlClient: (...args: unknown[]) => mocks.client(...args) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args) }));

const first = progressBackend("http://first.example"); const second = progressBackend("http://second.example");
const liveUrl = (target = first, index = 0) => `${target.serverBaseUrl}/api/v1/manga/42/chapter/1/page/${index}`;
const png = (value: string) => ({ bytes: [...new TextEncoder().encode(value)], contentType: "image/png" });
let store: ReturnType<typeof createDownloadStore>;
let objects: Map<string, Response>;
let releases: (() => void)[];
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
  vi.restoreAllMocks(); vi.resetAllMocks(); mocks.listeners.clear(); mocks.native = true; mocks.settings = { serverBaseUrl: first.serverBaseUrl, mockMode: false, downloadConcurrency: 2 };
  vi.stubGlobal("indexedDB", new IDBFactory()); releases = []; objects = new Map();
  vi.stubGlobal("caches", { open: async () => ({ match: async (key: string) => objects.get(String(key))?.clone(), put: async (key: string, value: Response) => { objects.set(String(key), value.clone()); }, delete: async (key: string) => objects.delete(String(key)), keys: async () => [...objects.keys()].map((url) => new Request(url)) }), delete: async () => { objects.clear(); return true; } });
  mocks.invoke.mockImplementation(async (_command, args) => png(args.serverBaseUrl));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(`demo:${url}`, { headers: { "content-type": "image/png" } })));
  mocks.client.mockImplementation((endpoint, _options, mode) => {
    const base = endpoint.replace(/\/api\/graphql$/, "");
    const target = progressBackend(base, mode === "demo"); const title = target.isDemo ? "[Demo] Sample title" : base === first.serverBaseUrl ? "First title" : "Second title";
    return {
      GetChapter: vi.fn(async () => ({ chapter: { id: 12, mangaId: 42, name: "Chapter 12", chapterNumber: 1, sourceOrder: 1, pageCount: 2, isRead: false, lastPageRead: 0, manga: { title } } })),
      FetchChapterPages: vi.fn(async () => ({ fetchChapterPages: { pages: target.isDemo ? ["https://images.example/0", "https://images.example/1"] : [liveUrl(target), liveUrl(target, 1)] } })),
      EnqueueChapterDownload: vi.fn(async () => ({})),
    };
  });
  store = createDownloadStore();
});
afterEach(async () => { releases.forEach((release) => release()); await store.dispose(); vi.unstubAllGlobals(); });

describe("download backend ownership", () => {
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
    expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).startsWith("https://images.example"))).toBe(true);
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
  it("continues delegating live website downloads to the captured Suwayomi endpoint", async () => {
    mocks.native = false; switchTo(second); await store.getState().downloadChapter(12, "First title", first);
    expect(mocks.client).toHaveBeenCalledWith(`${first.serverBaseUrl}/api/graphql`, undefined, "live"); expect(mocks.invoke).not.toHaveBeenCalled();
    expect(await cache.getDownloadJobs(first.serverBaseUrl)).toEqual([]);
  });
});
