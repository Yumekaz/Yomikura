import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { progressBackend } from "./backendIdentity";
import { acknowledgeProgress, acquireProgressLease, acquireTrackingLease, dismissTracking, enqueueProgress, getPendingTracking, getProgressHead, getProgressOperations, recordTrackingResult, releaseProgressLease, releaseTrackingLease, suppressEarlierTracking, type ProgressIntent } from "./progressStorage";

const backend = progressBackend("http://tracking.example");
const other = progressBackend("http://other.example");
const chapter = { chapterId: 12, chapterName: "Chapter 1", chapterNumber: 1, mangaId: 42, mangaTitle: "Fixture", pageCount: 4, sourceOrder: 1 };
const reading = (number = 1, page = 3): ProgressIntent => ({ chapter: { ...chapter, chapterNumber: number }, kind: "reading", baseline: { isRead: false, lastPageRead: 0 }, patch: { isRead: page === 3, lastPageRead: page }, epoch: 0 });
async function acknowledge(target = backend) {
  const operations = await getProgressOperations(target);
  await acquireProgressLease(target, "reader");
  for (const operation of operations) await acknowledgeProgress(operation, "reader", operation.patch);
  await releaseProgressLease(target, "reader");
}
async function complete(number = 1) { await enqueueProgress(backend, reading(number)); await acknowledge(); return (await getProgressHead(backend, 12))!; }
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

describe("atomic tracker retry state", () => {
  it("retains a tracker intent in the same commit that acknowledges reading completion", async () => {
    const head = await complete();
    expect(await getProgressOperations(backend)).toEqual([]);
    expect(await getPendingTracking(backend)).toMatchObject([{ trackingDueSequence: head.sequence, acknowledgedSequence: head.sequence }]);
    expect(await getPendingTracking(other)).toEqual([]);
  });
  it.each([0, -1, NaN])("does not enqueue an ineligible chapter number (%s)", async (number) => {
    await complete(number); expect(await getPendingTracking(backend)).toEqual([]);
  });
  it("retains fractional completion and deduplicates rereading after acknowledgement", async () => {
    const completed = await complete(2.5);
    await enqueueProgress(backend, reading(2.5, 1)); await acknowledge();
    expect(await getPendingTracking(backend)).toMatchObject([{ trackingDueSequence: completed.sequence }]);
  });
  it("retains tracker eligibility when a user confirms saved automatic completion", async () => {
    await enqueueProgress(backend, reading());
    await enqueueProgress(backend, { ...reading(), kind: "explicit", trackCompletion: true }); await acknowledge();
    expect(await getPendingTracking(backend)).toHaveLength(1);
  });
  it("cancels a pending tracker update on explicit unread and fences a delayed completion", async () => {
    await enqueueProgress(backend, reading()); const older = (await getProgressOperations(backend))[0];
    await enqueueProgress(backend, { ...reading(), kind: "explicit", patch: { isRead: false, lastPageRead: 0 } });
    await acquireProgressLease(backend, "reader"); await acknowledgeProgress(older, "reader", older.patch); await releaseProgressLease(backend, "reader");
    expect(await getPendingTracking(backend)).toEqual([]);
  });
  it("does not let an older tracking acknowledgement clear a newer completion", async () => {
    const older = await complete();
    await enqueueProgress(backend, { ...reading(), kind: "explicit", patch: { isRead: false, lastPageRead: 0 } }); await acknowledge();
    await enqueueProgress(backend, { ...reading(), epoch: 1 }); await acknowledge();
    await acquireTrackingLease(backend, "tracker"); await recordTrackingResult(backend, [older], "tracker");
    expect(await getPendingTracking(backend)).toHaveLength(1);
    expect((await getPendingTracking(backend))[0].trackingDueSequence).toBeGreaterThan(older.trackingDueSequence!);
  });
  it("fences stale workers and persists an actionable retry with backoff", async () => {
    const head = await complete();
    await acquireTrackingLease(backend, "old"); await releaseTrackingLease(backend, "old"); await acquireTrackingLease(backend, "current");
    await recordTrackingResult(backend, [head], "old"); expect(await getPendingTracking(backend)).toHaveLength(1);
    await recordTrackingResult(backend, [head], "current", "Sign in again");
    const pending = (await getPendingTracking(backend))[0];
    expect(pending).toMatchObject({ trackingError: "Sign in again", trackingAttempts: 1 }); expect(pending.trackingRetryAt!).toBeGreaterThan(Date.now() + 14_000);
    await recordTrackingResult(backend, [pending], "current"); expect(await getPendingTracking(backend)).toEqual([]);
  });
  it("lets a manual tracker edit suppress an older unacknowledged reading intent", async () => {
    const captured = (await enqueueProgress(backend, reading())).head;
    await suppressEarlierTracking(backend, [captured]); await acknowledge();
    expect((await getProgressHead(backend, 12))!.patch.isRead).toBe(true); expect(await getPendingTracking(backend)).toEqual([]);
    await enqueueProgress(backend, { ...reading(), chapter: { ...chapter, chapterId: 13, chapterNumber: 2 } }); await acknowledge();
    expect(await getPendingTracking(backend)).toMatchObject([{ chapter: { chapterId: 13 } }]);
  });
  it("does not suppress a reading completion created after the manual edit snapshot", async () => {
    const captured = (await enqueueProgress(backend, reading(1, 1))).head;
    await enqueueProgress(backend, reading()); await acknowledge(); await suppressEarlierTracking(backend, [captured]);
    expect(await getPendingTracking(backend)).toHaveLength(1);
  });
  it("rejects a stale dismiss choice rather than clearing a newer retry", async () => {
    const older = await complete();
    await enqueueProgress(backend, { ...reading(), kind: "explicit", patch: { isRead: false, lastPageRead: 0 } }); await acknowledge();
    await enqueueProgress(backend, { ...reading(), epoch: 1 }); await acknowledge();
    await expect(dismissTracking(backend, [older])).rejects.toThrow("changed while"); expect(await getPendingTracking(backend)).toHaveLength(1);
  });
});
