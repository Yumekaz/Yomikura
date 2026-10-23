import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { progressBackend } from "./backendIdentity";
import { getProgressHead, getProgressOperations, type ProgressIntent } from "./progressStorage";
import { projectChapterProgress, readProgressHistory, resolveProgressConflict, saveProgressIntent, synchronizeProgress } from "./progressSync";
import * as storage from "./progressStorage";
import { getCachedChapter, getReadingHistory, saveCachedChapter } from "./offlineCache";

const mocks = vi.hoisted(() => ({
  active: { serverBaseUrl: "http://localhost:4567", mockMode: false, connectionStatus: "connected", errorMessage: "" },
  read: vi.fn(), update: vi.fn(), remove: vi.fn(), modes: [] as string[],
}));
vi.mock("../../stores/useSettingsStore", () => ({
  useSettingsStore: { getState: () => mocks.active, setState: (patch: object) => Object.assign(mocks.active, patch) }, isTauri: () => false,
}));
vi.mock("../graphql/client", () => ({ createGraphqlClient: (endpoint: string, _options: unknown, mode: string) => {
  mocks.modes.push(mode);
  const server = endpoint.replace(/\/api\/graphql$/, "");
  return { GetChapter: ({ id }: { id: number }) => mocks.read(server, id), UpdateChapterProgress: ({ input }: { input: unknown }) => mocks.update(server, input), DeleteDownloadedChapter: (input: unknown) => mocks.remove(server, input) };
} }));

const first = progressBackend("http://localhost:4567");
const second = progressBackend("http://localhost:4568");
const chapter = { chapterId: 12, chapterName: "Chapter 1", chapterNumber: 1, mangaId: 42, mangaTitle: "Fixture", sourceOrder: 1, pageCount: 4 };
const reading = (page: number, epoch = 0): ProgressIntent => ({ kind: "reading", chapter, epoch, baseline: { isRead: false, lastPageRead: 0 }, patch: { isRead: page === 3, lastPageRead: page } });
const remoteChapter = () => ({ id: 12, name: "Chapter 1", chapterNumber: 1, mangaId: 42, sourceOrder: 1, pageCount: 4, isRead: false, lastPageRead: 0, manga: { title: "Fixture" } });
let servers: Map<string, ReturnType<typeof remoteChapter>>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.modes.length = 0;
  Object.assign(mocks.active, { serverBaseUrl: first.serverBaseUrl, mockMode: false, connectionStatus: "connected", errorMessage: "" });
  servers = new Map([[first.serverBaseUrl, remoteChapter()], [second.serverBaseUrl, remoteChapter()]]);
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setInterval, clearInterval }));
  vi.stubGlobal("navigator", {});
  mocks.read.mockImplementation(async (server: string) => ({ chapter: structuredClone(servers.get(server)!) }));
  mocks.update.mockImplementation(async (server: string, input: { id: number; patch: object }) => {
    Object.assign(servers.get(server)!, input.patch);
    return { updateChapter: { chapter: structuredClone(servers.get(server)!) } };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("progress replay and acknowledgement", () => {
  it("retains progress across a failed request and replays it after reconnecting", async () => {
    await saveProgressIntent(first, reading(2));
    mocks.read.mockRejectedValueOnce(new TypeError("offline"));
    await synchronizeProgress(first);
    expect(await getProgressOperations(first)).toHaveLength(1);
    expect(mocks.update).not.toHaveBeenCalled();
    await synchronizeProgress(first);
    expect(servers.get(first.serverBaseUrl)!.lastPageRead).toBe(2);
    expect(await getProgressOperations(first)).toHaveLength(0);
    expect(mocks.modes.every((mode) => mode === "live")).toBe(true);
  });

  it("keeps a request with an interrupted acknowledgement recoverable", async () => {
    await saveProgressIntent(first, reading(2));
    mocks.update.mockImplementationOnce(async (server: string, input: { patch: object }) => {
      Object.assign(servers.get(server)!, input.patch);
      throw new TypeError("response lost after commit");
    });
    await synchronizeProgress(first);
    expect(await getProgressOperations(first)).toHaveLength(1);
    await synchronizeProgress(first);
    expect(await getProgressOperations(first)).toHaveLength(0);
    expect(servers.get(first.serverBaseUrl)!.lastPageRead).toBe(2);
  });

  it("serializes a reset behind an old response without losing the newer intent", async () => {
    let finish!: () => void;
    mocks.update.mockImplementationOnce(async (server: string, input: { patch: object }) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      Object.assign(servers.get(server)!, input.patch);
      return { updateChapter: { chapter: structuredClone(servers.get(server)!) } };
    });
    await saveProgressIntent(first, reading(3));
    const pending = synchronizeProgress(first);
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    await saveProgressIntent(first, { ...reading(0), kind: "explicit", patch: { isRead: false, lastPageRead: 0 }, hideHistory: true });
    await saveProgressIntent(first, reading(3, 0));
    expect((await getProgressHead(first, 12))!.patch).toEqual({ isRead: false, lastPageRead: 0 });
    finish();
    await pending;
    expect(mocks.update.mock.calls.map((call) => call[1].patch)).toEqual([{ isRead: true, lastPageRead: 3 }, { isRead: false, lastPageRead: 0 }]);
    expect(servers.get(first.serverBaseUrl)!).toMatchObject({ isRead: false, lastPageRead: 0 });
    expect(await getProgressOperations(first)).toHaveLength(0);
  });

  it("does not coalesce a pending unread barrier into later automatic reading", async () => {
    servers.get(first.serverBaseUrl)!.isRead = true;
    servers.get(first.serverBaseUrl)!.lastPageRead = 3;
    await saveProgressIntent(first, { ...reading(0), kind: "explicit", patch: { isRead: false, lastPageRead: 0 } });
    await saveProgressIntent(first, reading(1, 1));
    await synchronizeProgress(first);
    expect(mocks.update.mock.calls.map((call) => call[1].patch)).toEqual([{ isRead: false, lastPageRead: 0 }, { isRead: false, lastPageRead: 1 }]);
    expect(servers.get(first.serverBaseUrl)!).toMatchObject({ isRead: false, lastPageRead: 1 });
  });

  it("keeps overlapping IDs on two servers separate through a profile switch", async () => {
    await saveProgressIntent(first, reading(1));
    mocks.active.serverBaseUrl = second.serverBaseUrl;
    await synchronizeProgress(first);
    expect(mocks.update).not.toHaveBeenCalled();
    await saveProgressIntent(second, reading(2));
    await synchronizeProgress(second);
    expect(servers.get(first.serverBaseUrl)!.lastPageRead).toBe(0);
    expect(servers.get(second.serverBaseUrl)!.lastPageRead).toBe(2);
    expect(await getProgressOperations(first)).toHaveLength(1);
    mocks.active.serverBaseUrl = first.serverBaseUrl;
    await synchronizeProgress(first);
    expect(servers.get(first.serverBaseUrl)!.lastPageRead).toBe(1);
  });

  it("stops before mutation when a profile changes during preflight", async () => {
    await saveProgressIntent(first, reading(1));
    mocks.read.mockImplementationOnce(async (server: string) => {
      mocks.active.serverBaseUrl = second.serverBaseUrl;
      return { chapter: structuredClone(servers.get(server)!) };
    });
    await synchronizeProgress(first);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(await getProgressOperations(first)).toHaveLength(1);
  });

  it("does not lose a reconnect requested while an old worker is releasing its lease", async () => {
    await saveProgressIntent(first, reading(1));
    mocks.read.mockImplementationOnce(async (server: string) => {
      mocks.active.serverBaseUrl = second.serverBaseUrl;
      return { chapter: structuredClone(servers.get(server)!) };
    });
    const release = storage.releaseProgressLease;
    vi.spyOn(storage, "releaseProgressLease").mockImplementationOnce(async (...args) => {
      await release(...args);
      mocks.active.serverBaseUrl = first.serverBaseUrl;
      void synchronizeProgress(first);
    });
    await synchronizeProgress(first);
    expect(servers.get(first.serverBaseUrl)!.lastPageRead).toBe(1);
    expect(await getProgressOperations(first)).toHaveLength(0);
  });

  it("projects pending local progress over an older server response", async () => {
    await saveProgressIntent(first, reading(2));
    expect(await projectChapterProgress(first, remoteChapter())).toMatchObject({ lastPageRead: 2, isRead: false, progressEpoch: 0, progressBaseline: { lastPageRead: 0, isRead: false } });
    expect(await projectChapterProgress(second, remoteChapter())).toMatchObject({ lastPageRead: 0, isRead: false });
  });

  it("retains acknowledged progress for offline fallback without overriding a fresh server response", async () => {
    await saveProgressIntent(first, reading(2));
    await synchronizeProgress(first);
    expect(await projectChapterProgress(first, remoteChapter(), { offline: true })).toMatchObject({ lastPageRead: 2 });
    expect(await projectChapterProgress(first, remoteChapter())).toMatchObject({ lastPageRead: 0 });
  });

  it("does not overwrite a server reset that happens to match the session's initial baseline", async () => {
    await saveProgressIntent(first, reading(3)); await synchronizeProgress(first);
    servers.get(first.serverBaseUrl)!.isRead = false; servers.get(first.serverBaseUrl)!.lastPageRead = 0;
    await saveProgressIntent(first, reading(1)); await synchronizeProgress(first);
    expect((await getProgressOperations(first))[0].status).toBe("blocked");
    expect(servers.get(first.serverBaseUrl)!).toMatchObject({ isRead: false, lastPageRead: 0 });
  });

  it("opens a new epoch for freshly observed server unread while fencing the old reader", async () => {
    await saveProgressIntent(first, reading(3)); await synchronizeProgress(first);
    const projected = await projectChapterProgress(first, remoteChapter());
    expect(projected).toMatchObject({ isRead: false, lastPageRead: 0, progressEpoch: 1 });
    expect((await saveProgressIntent(first, reading(3, 0))).accepted).toBe(false);
    expect((await saveProgressIntent(first, reading(1, 1))).accepted).toBe(true);
    expect((await getProgressHead(first, 12))!.patch.isRead).toBe(false);
  });

  it("does not mistake a stale metadata response for a new server reset", async () => {
    await saveProgressIntent(first, reading(3));
    const version = storage.progressHeadVersion(await getProgressHead(first, 12));
    await synchronizeProgress(first);
    expect(await projectChapterProgress(first, remoteChapter(), { observedVersion: version })).toMatchObject({ isRead: true, lastPageRead: 3, progressEpoch: 0 });
  });

  it("rejects reused IDs whose chapter ownership changed", async () => {
    await saveProgressIntent(first, reading(2));
    servers.get(first.serverBaseUrl)!.manga.title = "A different library";
    await synchronizeProgress(first);
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await getProgressOperations(first))[0]).toMatchObject({ status: "blocked" });
    await expect(resolveProgressConflict(first, 12, true)).rejects.toThrow("different chapter");
  });

  it("fences an old session when a fresh server response identifies a replacement chapter", async () => {
    await saveProgressIntent(first, reading(1)); await synchronizeProgress(first);
    const replacement = { ...remoteChapter(), name: "Replacement chapter" };
    const projected = await projectChapterProgress(first, replacement);
    expect(projected.progressEpoch).toBe(1);
    await saveProgressIntent(first, { ...reading(2, projected.progressEpoch), chapter: { ...chapter, chapterName: replacement.name } });
    expect((await saveProgressIntent(first, reading(3, 0))).accepted).toBe(false);
    expect((await getProgressHead(first, 12))!.chapter.chapterName).toBe("Replacement chapter");
  });

  it("keeps an unsent old identity for explicit review instead of silently replacing it", async () => {
    await saveProgressIntent(first, reading(1));
    const result = await saveProgressIntent(first, { ...reading(2), chapter: { ...chapter, mangaTitle: "Different book" } });
    expect(result.accepted).toBe(false);
    expect((await getProgressHead(first, 12))!.chapter.mangaTitle).toBe("Fixture");
  });

  it("does not let demo progress change overlapping live cache or history IDs", async () => {
    await saveCachedChapter({ cacheKey: `${first.serverBaseUrl}::12`, serverBaseUrl: first.serverBaseUrl, id: 12, name: chapter.chapterName, chapterNumber: 1, mangaId: 42, mangaTitle: "Fixture", sourceOrder: 1, pageCount: 4, pages: ["0", "1", "2", "3"], cachedUrls: [], cachedAt: Date.now(), totalSizeBytes: 0, lastPageRead: 0, isRead: false });
    await saveProgressIntent(first, reading(1));
    const demo = progressBackend(first.serverBaseUrl, true); mocks.active.mockMode = true;
    await saveProgressIntent(demo, { ...reading(3), chapter: { ...chapter, mangaTitle: "[Demo] Fixture" } });
    await synchronizeProgress(demo);
    expect(await getCachedChapter(first.serverBaseUrl, 12)).toMatchObject({ isRead: false, lastPageRead: 1, mangaTitle: "Fixture" });
    expect((await getReadingHistory(first.serverBaseUrl))[0]).toMatchObject({ isDemo: false, lastPageRead: 1 });
    expect(await projectChapterProgress(demo, { ...remoteChapter(), manga: { title: "[Demo] Fixture" } })).toMatchObject({ isRead: true, lastPageRead: 3 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps removed history hidden while its reading progress is pending and after acknowledgement", async () => {
    await saveProgressIntent(first, reading(1));
    await storage.setProgressHistoryHidden(first, 12);
    expect((await readProgressHistory(first))[0]).toMatchObject({ isHidden: true, lastPageRead: 1 });
    await synchronizeProgress(first);
    expect((await readProgressHistory(first))[0]).toMatchObject({ isHidden: true, lastPageRead: 1 });
    expect(servers.get(first.serverBaseUrl)!.lastPageRead).toBe(1);
  });

  it.each([true, false])("pauses on competing server edits and honors explicit resolution (use saved=%s)", async (useSaved) => {
    await saveProgressIntent(first, reading(1));
    servers.get(first.serverBaseUrl)!.lastPageRead = 2;
    await synchronizeProgress(first);
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await getProgressOperations(first))[0].status).toBe("blocked");
    await resolveProgressConflict(first, 12, useSaved);
    expect(await getProgressOperations(first)).toHaveLength(0);
    expect(servers.get(first.serverBaseUrl)!.lastPageRead).toBe(useSaved ? 1 : 2);
  });

  it("does not let a delayed conflict choice overwrite a newer reset", async () => {
    await saveProgressIntent(first, reading(1));
    servers.get(first.serverBaseUrl)!.lastPageRead = 2;
    await synchronizeProgress(first);
    let finish!: () => void;
    mocks.read.mockImplementationOnce(async (server: string) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return { chapter: structuredClone(servers.get(server)!) };
    });
    const choice = resolveProgressConflict(first, 12, false);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await saveProgressIntent(first, { ...reading(0), kind: "explicit", patch: { isRead: false, lastPageRead: 0 } });
    finish();
    await expect(choice).rejects.toThrow("changed while you were reviewing");
    expect((await getProgressHead(first, 12))!.patch).toEqual({ isRead: false, lastPageRead: 0 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
