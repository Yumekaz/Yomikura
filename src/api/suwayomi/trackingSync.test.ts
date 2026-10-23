// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { progressBackend } from "./backendIdentity";
import { acknowledgeProgress, acquireProgressLease, enqueueProgress, getPendingTracking, getProgressOperations, releaseProgressLease } from "./progressStorage";
import { synchronizeTracking } from "./trackingSync";
import { TrackingBusyError, withTrackingLock } from "./trackingCoordination";
import { pushLinkedTrackerProgress } from "./trackingActions";

const mocks = vi.hoisted(() => ({ key: "" }));
vi.mock("./trackingActions", () => ({
  assertTrackingBackend: (backend: { key: string }) => { if (backend.key !== mocks.key) throw new Error("server changed"); },
  pushLinkedTrackerProgress: vi.fn(),
}));
const backend = progressBackend("http://tracking.example");
const other = progressBackend("http://other.example");
async function complete(id: number, target = backend) {
  await enqueueProgress(target, { kind: "reading", chapter: { chapterId: id, chapterName: `Chapter ${id}`, chapterNumber: id, mangaId: 42, mangaTitle: "Fixture", sourceOrder: id, pageCount: 2 }, epoch: 0, baseline: { isRead: false, lastPageRead: 0 }, patch: { isRead: true, lastPageRead: 1 } });
  await acquireProgressLease(target, "reader");
  for (const operation of await getProgressOperations(target)) await acknowledgeProgress(operation, "reader", operation.patch);
  await releaseProgressLease(target, "reader");
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("navigator", { locks: undefined }); mocks.key = backend.key;
  vi.mocked(pushLinkedTrackerProgress).mockResolvedValue({ skipped: false, confirmed: 1 });
});
afterEach(() => vi.unstubAllGlobals());

describe("durable coalesced tracker replay", () => {
  it("coalesces completed chapters for one manga into one verified update", async () => {
    await complete(1); await complete(2); await synchronizeTracking(backend);
    expect(pushLinkedTrackerProgress).toHaveBeenCalledTimes(1); expect(await getPendingTracking(backend)).toEqual([]);
  });
  it("retains failed synchronization without holding back reading progress and supports forced retry", async () => {
    await complete(1); vi.mocked(pushLinkedTrackerProgress).mockRejectedValueOnce(new Error("provider unavailable"));
    await synchronizeTracking(backend);
    expect(await getProgressOperations(backend)).toEqual([]); expect(await getPendingTracking(backend)).toMatchObject([{ trackingError: "provider unavailable" }]);
    await synchronizeTracking(backend); expect(pushLinkedTrackerProgress).toHaveBeenCalledTimes(1);
    await synchronizeTracking(backend, { force: true }); expect(await getPendingTracking(backend)).toEqual([]);
  });
  it("acknowledges older backed-off intents when a new completion confirms the whole manga", async () => {
    await complete(1); vi.mocked(pushLinkedTrackerProgress).mockRejectedValueOnce(new Error("offline")); await synchronizeTracking(backend);
    await complete(2); await synchronizeTracking(backend);
    expect(pushLinkedTrackerProgress).toHaveBeenCalledTimes(2); expect(await getPendingTracking(backend)).toEqual([]);
  });
  it("does not lose a completion queued while a provider request is finishing", async () => {
    let release!: () => void; let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    vi.mocked(pushLinkedTrackerProgress).mockImplementationOnce(async () => { started(); await new Promise<void>((resolve) => { release = resolve; }); return { skipped: false, confirmed: 1 }; });
    await complete(1); const first = synchronizeTracking(backend); await entered;
    await complete(2); const second = synchronizeTracking(backend); release(); await Promise.all([first, second]);
    expect(pushLinkedTrackerProgress).toHaveBeenCalledTimes(2); expect(await getPendingTracking(backend)).toEqual([]);
  });
  it("waits for the manga's pending reading changes before contacting trackers", async () => {
    await complete(1);
    await enqueueProgress(backend, { kind: "explicit", chapter: { chapterId: 2, chapterName: "Chapter 2", chapterNumber: 2, mangaId: 42, mangaTitle: "Fixture", sourceOrder: 2, pageCount: 2 }, baseline: { isRead: true, lastPageRead: 1 }, patch: { isRead: false, lastPageRead: 0 } });
    await synchronizeTracking(backend);
    expect(pushLinkedTrackerProgress).not.toHaveBeenCalled(); expect(await getPendingTracking(backend)).toHaveLength(1);
  });
  it("retains the owning backend's intent after a profile switch and never sends it to another", async () => {
    await complete(1);
    vi.mocked(pushLinkedTrackerProgress).mockImplementationOnce(async () => { mocks.key = other.key; return { skipped: false, confirmed: 1 }; });
    await synchronizeTracking(backend); expect(await getPendingTracking(backend)).toHaveLength(1);
    await synchronizeTracking(other); expect(pushLinkedTrackerProgress).toHaveBeenCalledTimes(1);
    mocks.key = backend.key; await synchronizeTracking(backend); expect(await getPendingTracking(backend)).toEqual([]);
  });
  it("isolates demo retries and clears them without contacting live trackers", async () => {
    const demo = progressBackend(backend.serverBaseUrl, true); await complete(1, backend); await complete(1, demo); mocks.key = demo.key;
    await synchronizeTracking(demo);
    expect(pushLinkedTrackerProgress).not.toHaveBeenCalled(); expect(await getPendingTracking(demo)).toEqual([]); expect(await getPendingTracking(backend)).toHaveLength(1);
  });
  it("prevents a manual edit from entering an active fallback lease", async () => {
    let release!: () => void; let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const first = withTrackingLock(backend, async () => { started(); await new Promise<void>((resolve) => { release = resolve; }); });
    await entered; await expect(withTrackingLock(backend, async () => undefined)).rejects.toBeInstanceOf(TrackingBusyError);
    release(); await first; await expect(withTrackingLock(backend, async () => "ready")).resolves.toBe("ready");
  });
});
