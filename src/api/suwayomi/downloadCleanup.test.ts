import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { progressBackend } from "./backendIdentity";
import { acknowledgeProgress, acquireProgressLease, enqueueProgress, getProgressOperations, markProgressOperation, releaseProgressLease } from "./progressStorage";
import { cleanupJobKey, getCleanupJobs, cancelCleanupJobs, saveCleanupJob } from "./cleanupStorage";
import { cleanupProtection, queueDownloadCleanup, runDownloadCleanup } from "./downloadCleanup";
import { getCachedChapter, getChapterCacheKey, saveCachedChapter } from "./offlineCache";
import { DEFAULT_DOWNLOAD_EXPERIENCE, type DownloadExperience } from "../../stores/downloadExperience";

const mocks = vi.hoisted(() => ({
  settings: {} as { serverBaseUrl: string; mockMode: boolean; autoDeleteReadChapters: boolean; experience: { downloads: DownloadExperience } },
  context: vi.fn(), remove: vi.fn(), chapters: vi.fn(),
}));
vi.mock("../../stores/useSettingsStore", () => ({ useSettingsStore: { getState: () => mocks.settings } }));
vi.mock("../graphql/client", () => ({ createGraphqlClient: () => ({ GetCleanupChapterContext: mocks.context, DeleteDownloadedChapter: mocks.remove, GetReadingChapters: mocks.chapters }) }));
const backend = progressBackend("http://first.example"), other = progressBackend("http://second.example");
const chapter = { chapterId: 12, chapterName: "Chapter 1", chapterNumber: 1, mangaId: 42, mangaTitle: "Fixture", sourceOrder: 1, pageCount: 4 };
const context = () => ({ chapter: { id: 12, name: "Chapter 1", chapterNumber: 1, mangaId: 42, sourceOrder: 1, pageCount: 4, isRead: true, isBookmarked: false, isDownloaded: true, manga: { title: "Fixture", categories: { nodes: [{ id: 2 }] } } } });
const policy = (patch: Partial<DownloadExperience>) => { mocks.settings.experience.downloads = { ...mocks.settings.experience.downloads, ...patch }; };
async function confirmed(kind: "automatic" | "manual" = "automatic", target = backend) {
  const result = await enqueueProgress(target, { kind: "reading", chapter, baseline: { isRead: false, lastPageRead: 0 }, patch: { isRead: true, lastPageRead: 3 } });
  const owner = crypto.randomUUID(); await acquireProgressLease(target, owner);
  const operation = (await getProgressOperations(target))[0]; await markProgressOperation(operation, owner, "sending");
  await acknowledgeProgress(operation, owner, operation.patch); await releaseProgressLease(target, owner);
  await saveCachedChapter({ cacheKey: getChapterCacheKey(target.serverBaseUrl, 12), serverBaseUrl: target.serverBaseUrl, id: 12, name: chapter.chapterName, chapterNumber: 1, mangaId: 42, mangaTitle: "Fixture", sourceOrder: 1, pageCount: 4, pages: [], cachedUrls: [], totalSizeBytes: 0, cachedAt: 1, isRead: true, isBookmarked: false });
  await queueDownloadCleanup(target, chapter, result.head.epoch, result.head.sequence, kind);
  return result.head;
}
const saved = () => getCachedChapter(backend.serverBaseUrl, 12);
async function reset() { await enqueueProgress(backend, { kind: "explicit", chapter, baseline: { isRead: true, lastPageRead: 3 }, patch: { isRead: false, lastPageRead: 0 } }); }

beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("caches", { open: async () => ({ delete: async () => true }) });
  mocks.settings = { serverBaseUrl: backend.serverBaseUrl, mockMode: false, autoDeleteReadChapters: true, experience: { downloads: { ...DEFAULT_DOWNLOAD_EXPERIENCE, excludedCategories: {} } } };
  mocks.context.mockImplementation(async () => context());
  mocks.remove.mockResolvedValue({ deleteDownloadedChapter: { clientMutationId: null } });
  mocks.chapters.mockResolvedValue({ chapters: { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false } } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("durable download cleanup", () => {
  it("removes only a confirmed read chapter and its matching device copy", async () => {
    await confirmed(); await runDownloadCleanup(backend);
    expect(mocks.remove).toHaveBeenCalledWith({ input: { id: 12 } }, undefined, expect.any(AbortSignal));
    expect(await saved()).toBeNull(); expect(await getCleanupJobs(backend)).toEqual([]);
  });
  it.each(["bookmark", "unread", "collection", "identity", "unknown-bookmark"])("keeps files protected by %s metadata", async (reason) => {
    await confirmed(); const value = context();
    if (reason === "bookmark") value.chapter.isBookmarked = true;
    if (reason === "unread") value.chapter.isRead = false;
    if (reason === "collection") policy({ excludedCategories: { [backend.key]: [2] } });
    if (reason === "identity") value.chapter.manga.title = "Replacement book";
    if (reason === "unknown-bookmark") (value.chapter as { isBookmarked?: boolean }).isBookmarked = undefined;
    mocks.context.mockResolvedValue(value); await runDownloadCleanup(backend);
    expect(mocks.remove).not.toHaveBeenCalled(); expect(await saved()).not.toBeNull();
  });
  it("keeps a different cached identity and never removes local-source original archives", async () => {
    await confirmed(); const copy = (await saved())!; await saveCachedChapter({ ...copy, mangaTitle: "Replacement copy" });
    await runDownloadCleanup(backend); expect(mocks.remove).not.toHaveBeenCalled(); expect(await saved()).not.toBeNull();
    await confirmed(); mocks.context.mockResolvedValue({ chapter: { ...context().chapter, isDownloaded: false } });
    await runDownloadCleanup(backend); expect(mocks.remove).not.toHaveBeenCalled(); expect(await saved()).toBeNull();
  });
  it("persists a delay across worker runs and retains jobs when the server is unavailable", async () => {
    policy({ cleanupDelayHours: 1 }); await confirmed(); await runDownloadCleanup(backend);
    expect(mocks.context).not.toHaveBeenCalled(); expect(await getCleanupJobs(backend)).toHaveLength(1);
    policy({ cleanupDelayHours: 0 }); mocks.context.mockRejectedValueOnce(new Error("offline")); await runDownloadCleanup(backend);
    expect(await getCleanupJobs(backend)).toHaveLength(1); expect(await saved()).not.toBeNull();
    await runDownloadCleanup(backend); expect(await saved()).toBeNull();
  });
  it("counts distinct later completed chapters, including beyond a chapter-list page", async () => {
    policy({ keepRecentChapters: 2 }); await confirmed();
    const node = (id: number, number: number) => ({ id, mangaId: 42, chapterNumber: number, sourceOrder: id, isRead: true });
    mocks.chapters.mockResolvedValueOnce({ chapters: { totalCount: 3, nodes: [node(20, 2), node(21, 2)], pageInfo: { hasNextPage: true, endCursor: "next" } } })
      .mockResolvedValueOnce({ chapters: { totalCount: 3, nodes: [node(22, 3)], pageInfo: { hasNextPage: false } } });
    await runDownloadCleanup(backend); expect(mocks.remove).toHaveBeenCalledOnce(); expect(await saved()).toBeNull();
  });
  it("does not count duplicate editions as multiple retained chapters", async () => {
    policy({ keepRecentChapters: 2 }); await confirmed();
    mocks.chapters.mockResolvedValue({ chapters: { totalCount: 2, nodes: [20, 21].map((id) => ({ id, mangaId: 42, chapterNumber: 2, sourceOrder: id, isRead: true })), pageInfo: { hasNextPage: false } } });
    await runDownloadCleanup(backend); expect(mocks.remove).not.toHaveBeenCalled(); expect(await getCleanupJobs(backend)).toHaveLength(1);
  });
  it("respects explicit unread before checking metadata", async () => {
    await confirmed(); await reset(); await runDownloadCleanup(backend);
    expect(mocks.context).not.toHaveBeenCalled(); expect(await saved()).not.toBeNull();
  });
  it.each(["reset", "bookmark", "profile", "disable"])("keeps an independent device copy after %s during server removal", async (change) => {
    await confirmed(); mocks.remove.mockImplementationOnce(async () => {
      if (change === "reset") await reset();
      if (change === "bookmark") await enqueueProgress(backend, { kind: "explicit", chapter, baseline: { isRead: true, lastPageRead: 3 }, patch: { isBookmarked: true } });
      if (change === "profile") mocks.settings.serverBaseUrl = other.serverBaseUrl;
      if (change === "disable") mocks.settings.autoDeleteReadChapters = false;
      return { deleteDownloadedChapter: { clientMutationId: null } };
    });
    await runDownloadCleanup(backend); expect(mocks.remove).toHaveBeenCalledOnce(); expect(await saved()).not.toBeNull();
  });
  it("does not start an old profile's cleanup while another profile is selected", async () => {
    await confirmed(); mocks.settings.serverBaseUrl = other.serverBaseUrl; await runDownloadCleanup(backend);
    expect(mocks.context).not.toHaveBeenCalled(); expect(await getCleanupJobs(backend)).toHaveLength(1);
  });
  it("keeps a newer job when an earlier worker finishes and ignores an older enqueue", async () => {
    const head = await confirmed(); const original = (await getCleanupJobs(backend))[0];
    await saveCleanupJob({ ...original, completedAt: 0 }); expect((await getCleanupJobs(backend))[0].completedAt).toBe(original.completedAt);
    mocks.remove.mockImplementationOnce(async () => { await saveCleanupJob({ ...original, sequence: head.sequence + 1 }); return {}; });
    await runDownloadCleanup(backend); expect(await saved()).not.toBeNull(); expect((await getCleanupJobs(backend))[0].sequence).toBe(head.sequence + 1);
    expect(original.key).toBe(cleanupJobKey(backend, 12));
  });
  it("cancels pending policy jobs across profiles without touching files or progress", async () => {
    policy({ removeAfterMarkedRead: true }); await confirmed(); await confirmed("manual", other);
    await cancelCleanupJobs("automatic"); expect(await getCleanupJobs(backend)).toHaveLength(0); expect(await getCleanupJobs(other)).toHaveLength(1); expect(await saved()).not.toBeNull();
    await cancelCleanupJobs(); expect(await getCleanupJobs(other)).toHaveLength(0);
  });
  it("protects unknown collection membership and the uncategorized collection", () => {
    const preferences = { ...DEFAULT_DOWNLOAD_EXPERIENCE, excludedCategories: { [backend.key]: [0] } };
    expect(cleanupProtection(preferences, backend, { isRead: true, isBookmarked: false })).toBe("collection");
    expect(cleanupProtection(preferences, backend, { isRead: true, isBookmarked: false, categoryIds: [] })).toBe("collection");
  });
});
