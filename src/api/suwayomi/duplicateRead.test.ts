// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { progressBackend } from "./backendIdentity";
import { acknowledgeProgress, acquireProgressLease, enqueueProgress, getPendingTracking, getProgressHead, getProgressOperations } from "./progressStorage";
import { duplicateOriginValid, queueDuplicateReads } from "./duplicateRead";
import { useSettingsStore } from "../../stores/useSettingsStore";
const backend = progressBackend("http://duplicate.example");
const chapter = { chapterId: 12, chapterName: "Chapter 1", chapterNumber: 1, mangaId: 42, mangaTitle: "Fixture", sourceOrder: 1, pageCount: 5 };
const peer = { id: 13, name: "Chapter 1 · B", chapterNumber: 1, mangaId: 42, sourceOrder: 2, isRead: false, lastPageRead: 2, pageCount: 9 };
const rows = [ { ...peer, id: 12, name: "Chapter 1", sourceOrder: 1 }, peer, { ...peer, id: 14, chapterNumber: -1 } ];
const sdk = () => ({ GetReadingChapters: vi.fn().mockResolvedValue({ chapters: { totalCount: rows.length, pageInfo: { hasNextPage: false }, nodes: rows } }) }) as unknown as Parameters<typeof queueDuplicateReads>[2];
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory()); localStorage.clear();
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), serverBaseUrl: backend.serverBaseUrl, mockMode: false });
  useSettingsStore.getState().updateExperience({ duplicateReadLibraries: { [backend.key]: true } });
});
async function complete() {
  await enqueueProgress(backend, { kind: "reading", chapter, baseline: { isRead: false, lastPageRead: 0 }, patch: { isRead: true, lastPageRead: 4 } });
  return (await getProgressOperations(backend)).find((item) => item.chapter.chapterId === 12)!;
}
it("queues only recognised equal-number peers, preserves page position and creates no fake history or tracker event", async () => {
  const original = await complete(); await queueDuplicateReads(backend, original, sdk());
  const operations = await getProgressOperations(backend); expect(operations.map((item) => item.chapter.chapterId)).toEqual([12, 13]);
  const duplicate = operations[1]; expect(duplicate.fields).toEqual(["isRead"]); expect(duplicate.patch.lastPageRead).toBe(2); expect((await getProgressHead(backend, 13))!.hasActivity).toBe(false);
  await acquireProgressLease(backend, "test"); await acknowledgeProgress(duplicate, "test", duplicate.patch); expect(await getPendingTracking(backend)).toEqual([]);
});
it("retains an explicit unread choice on a duplicate edition", async () => {
  await enqueueProgress(backend, { kind: "explicit", chapter: { ...chapter, chapterId: 13, chapterName: peer.name, sourceOrder: 2 }, baseline: { isRead: true, lastPageRead: 2 }, patch: { isRead: false, lastPageRead: 0 } });
  const original = await complete(); await queueDuplicateReads(backend, original, sdk());
  expect((await getProgressHead(backend, 13))!.patch.isRead).toBe(false);
});
it("a reset of the originating chapter invalidates already queued duplicate work", async () => {
  const original = await complete(); await queueDuplicateReads(backend, original, sdk()); const duplicate = (await getProgressOperations(backend))[1];
  await enqueueProgress(backend, { kind: "explicit", chapter, baseline: { isRead: true, lastPageRead: 4 }, patch: { isRead: false, lastPageRead: 0 } });
  expect(await duplicateOriginValid(duplicate)).toBe(false);
  const accepted = await enqueueProgress(backend, { kind: "reading", chapter: { ...chapter, chapterId: 15 }, baseline: { isRead: false, lastPageRead: 0 }, patch: { isRead: true }, duplicateOf: { chapterId: 12, epoch: original.epoch, sequence: original.sequence } });
  expect(accepted.accepted).toBe(false);
});
it("keeps the original operation pending if the peer inventory cannot be confirmed", async () => {
  const original = await complete(), transport = sdk(); vi.mocked(transport.GetReadingChapters).mockRejectedValue(new Error("Unavailable"));
  await expect(queueDuplicateReads(backend, original, transport)).rejects.toThrow("Unavailable"); expect((await getProgressOperations(backend)).map((item) => item.chapter.chapterId)).toEqual([12]);
});
