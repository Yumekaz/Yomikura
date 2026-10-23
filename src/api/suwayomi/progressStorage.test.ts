import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { chapterIdentityMatches, progressBackend } from "./backendIdentity";
import { acknowledgeProgress, acquireProgressLease, enqueueProgress, getProgressHead, getProgressOperations, markProgressOperation, releaseProgressLease, type ProgressIntent } from "./progressStorage";

const server = progressBackend("http://localhost:4567");
const second = progressBackend("http://localhost:4568");
const chapter = { chapterId: 12, chapterName: "Chapter 1", chapterNumber: 1, mangaId: 42, mangaTitle: "Fixture", sourceOrder: 0, pageCount: 4 };
const reading = (page: number, epoch = 0): ProgressIntent => ({ kind: "reading", chapter, epoch, baseline: { isRead: false, lastPageRead: 0 }, patch: { lastPageRead: page, isRead: page === 3 } });
beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => vi.unstubAllGlobals());

describe("progress operation identity", () => {
  it("canonicalizes equivalent endpoints without merging hosts, paths, protocols or demo data", () => {
    expect(progressBackend(" HTTP://LOCALHOST:80/suwayomi/// ").key).toBe(progressBackend("http://localhost/suwayomi").key);
    expect(server.key).not.toBe(second.key);
    expect(server.key).not.toBe(progressBackend("http://127.0.0.1:4567").key);
    expect(server.key).not.toBe(progressBackend("https://localhost:4567").key);
    expect(server.key).not.toBe(progressBackend("http://localhost:4567", true).key);
    expect(() => progressBackend("http://user:password@localhost")).toThrow();
  });

  it("checks chapter ownership beyond a reused numeric ID", () => {
    expect(chapterIdentityMatches(chapter, { ...chapter })).toBe(true);
    expect(chapterIdentityMatches(chapter, { ...chapter, mangaId: 43 })).toBe(false);
    expect(chapterIdentityMatches(chapter, { ...chapter, mangaTitle: "Different library" })).toBe(false);
    expect(chapterIdentityMatches(chapter, { ...chapter, sourceOrder: 1 })).toBe(false);
  });
});

describe("durable ordered progress", () => {
  it("persists a pending operation and coalesces unsent automatic positions", async () => {
    await enqueueProgress(server, reading(1));
    const saved = await enqueueProgress(server, reading(2));
    expect(await getProgressHead(server, 12)).toMatchObject({ sequence: saved.head.sequence, patch: { lastPageRead: 2, isRead: false } });
    expect(await getProgressOperations(server)).toHaveLength(1);
    expect((await getProgressOperations(server))[0].patch.lastPageRead).toBe(2);
  });

  it("keeps overlapping chapter IDs isolated across backends", async () => {
    await enqueueProgress(server, reading(1));
    await enqueueProgress(second, reading(3));
    expect((await getProgressHead(server, 12))!.patch.lastPageRead).toBe(1);
    expect((await getProgressHead(second, 12))!.patch.lastPageRead).toBe(3);
    expect((await getProgressOperations(server))[0].backend).toEqual(server);
  });

  it("does not let an old acknowledgement remove a newer reset", async () => {
    await enqueueProgress(server, reading(3));
    const older = (await getProgressOperations(server))[0];
    expect(await acquireProgressLease(server, "worker")).toBe(true);
    await markProgressOperation(older, "worker", "sending");
    const reset = await enqueueProgress(server, { ...reading(0), kind: "explicit", patch: { isRead: false, lastPageRead: 0 }, hideHistory: true });
    await acknowledgeProgress(older, "worker", older.patch);
    expect((await getProgressHead(server, 12))!).toMatchObject({ sequence: reset.head.sequence, epoch: 1, patch: { isRead: false, lastPageRead: 0 }, hideHistory: true });
    expect((await getProgressOperations(server)).map((operation) => operation.sequence)).toEqual([reset.head.sequence]);
  });

  it("rejects a delayed reading callback from before reset or mark-unread", async () => {
    await enqueueProgress(server, reading(3));
    await enqueueProgress(server, { ...reading(0), kind: "explicit", patch: { isRead: false, lastPageRead: 0 } });
    const stale = await enqueueProgress(server, reading(3, 0));
    expect(stale.accepted).toBe(false);
    expect((await getProgressHead(server, 12))!.patch).toEqual({ isRead: false, lastPageRead: 0 });
  });

  it("keeps an unread/reset barrier before new automatic reading", async () => {
    await enqueueProgress(server, reading(3));
    await enqueueProgress(server, { ...reading(0), kind: "explicit", patch: { isRead: false, lastPageRead: 0 } });
    await enqueueProgress(server, reading(1, 1));
    const queue = await getProgressOperations(server);
    expect(queue.map((operation) => operation.kind)).toEqual(["explicit", "reading"]);
    expect(queue.map((operation) => operation.patch.isRead)).toEqual([false, false]);
  });

  it("records fresh activity when reopening a reset chapter at the same page", async () => {
    await enqueueProgress(server, { ...reading(0), kind: "explicit", patch: { isRead: false, lastPageRead: 0 }, hideHistory: true });
    const reopened = await enqueueProgress(server, reading(0, 1));
    expect(reopened.head).toMatchObject({ hideHistory: false, hasActivity: true, lastKind: "reading" });
    expect((await getProgressOperations(server)).map((operation) => operation.kind)).toEqual(["explicit", "reading"]);
  });

  it("preserves completion while allowing a deliberate reread position", async () => {
    await enqueueProgress(server, reading(3));
    await enqueueProgress(server, reading(1));
    expect((await getProgressHead(server, 12))!.patch).toEqual({ isRead: true, lastPageRead: 1 });
  });

  it("keeps acknowledged completion when moving backward in the same reading session", async () => {
    await enqueueProgress(server, reading(3));
    const operation = (await getProgressOperations(server))[0];
    await acquireProgressLease(server, "worker"); await acknowledgeProgress(operation, "worker", operation.patch);
    await enqueueProgress(server, reading(1));
    expect((await getProgressHead(server, 12))!.patch).toEqual({ isRead: true, lastPageRead: 1 });
  });

  it("fences stale workers and leaves unacknowledged changes recoverable", async () => {
    await enqueueProgress(server, reading(2));
    const operation = (await getProgressOperations(server))[0];
    expect(await acquireProgressLease(server, "first")).toBe(true);
    expect(await acquireProgressLease(server, "second")).toBe(false);
    expect(await acknowledgeProgress(operation, "second", operation.patch)).toBe(false);
    expect(await getProgressOperations(server)).toHaveLength(1);
    await releaseProgressLease(server, "first");
    expect(await acquireProgressLease(server, "second")).toBe(true);
    expect(await acknowledgeProgress(operation, "second", operation.patch)).toBe(true);
    expect(await getProgressOperations(server)).toHaveLength(0);
  });

  it("recovers an abandoned process lease immediately when a browser Web Lock is held", async () => {
    await enqueueProgress(server, reading(2));
    const operation = (await getProgressOperations(server))[0];
    await acquireProgressLease(server, "exited-process");
    expect(await acquireProgressLease(server, "new-process")).toBe(false);
    expect(await acquireProgressLease(server, "new-process", true)).toBe(true);
    expect(await acknowledgeProgress(operation, "exited-process", operation.patch)).toBe(false);
    expect(await acknowledgeProgress(operation, "new-process", operation.patch)).toBe(true);
  });

  it("surfaces unavailable storage instead of confirming a local save", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new DOMException("full", "QuotaExceededError"); } });
    await expect(enqueueProgress(server, reading(2))).rejects.toThrow("full");
  });
});
