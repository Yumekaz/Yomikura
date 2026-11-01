import type { SuwayomiSdk } from "../graphql/client";
import { fetchReadingChapters } from "../library/fetchReadingChapters";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { chapterIdentityMatches, type ProgressBackend } from "./backendIdentity";
import { enqueueProgress, getProgressHead, progressChanged, type ProgressOperation } from "./progressStorage";
import { isSelectedLibrary } from "./libraryUpdateState";
export function duplicateReadEnabled(backend: ProgressBackend) { return useSettingsStore.getState().experience?.duplicateReadLibraries?.[backend.key] === true; }
export async function duplicateOriginValid(operation: ProgressOperation) {
  if (!operation.duplicateOf) return true;
  const origin = await getProgressHead(operation.backend, operation.duplicateOf.chapterId);
  return duplicateReadEnabled(operation.backend) && !!origin?.patch.isRead && origin.sequence >= operation.duplicateOf.sequence && origin.epoch === operation.duplicateOf.epoch && origin.chapter.mangaId === operation.chapter.mangaId && origin.chapter.mangaTitle === operation.chapter.mangaTitle && origin.chapter.chapterNumber === operation.chapter.chapterNumber;
}
/** Queue peers before acknowledging the original, so an interrupted lookup retries durably. */
export async function queueDuplicateReads(backend: ProgressBackend, operation: ProgressOperation, sdk: Pick<SuwayomiSdk, "GetReadingChapters">) {
  if (operation.duplicateOf || !duplicateReadEnabled(backend) || !operation.patch.isRead || !Number.isFinite(operation.chapter.chapterNumber) || operation.chapter.chapterNumber < 0 || !isSelectedLibrary(backend)) return;
  const nodes = await fetchReadingChapters(sdk, operation.chapter.mangaId, AbortSignal.timeout(15000));
  const original = nodes.find((item) => item.id === operation.chapter.chapterId);
  if (!original || original.name !== operation.chapter.chapterName || original.chapterNumber !== operation.chapter.chapterNumber) throw new Error("Duplicate editions couldn’t be identified. Their read state is retained for review.");
  for (const item of nodes) {
    if (!isSelectedLibrary(backend) || !duplicateReadEnabled(backend)) return;
    if (item.id === original.id || item.chapterNumber !== original.chapterNumber || item.isRead) continue;
    const chapter = { chapterId: item.id, chapterName: item.name, chapterNumber: item.chapterNumber, mangaId: item.mangaId, mangaTitle: operation.chapter.mangaTitle, pageCount: item.pageCount, sourceOrder: item.sourceOrder };
    const head = await getProgressHead(backend, item.id);
    if (head && (head.patch.isRead || !chapterIdentityMatches(head.chapter, chapter) || head.lastKind === "explicit" && head.dirtyFields?.includes("isRead") && !head.patch.isRead)) continue;
    const result = await enqueueProgress(backend, { kind: "reading", chapter, patch: { isRead: true }, baseline: { isRead: item.isRead, lastPageRead: item.lastPageRead }, epoch: head?.epoch ?? 0, expectedSequence: head?.sequence ?? 0,
      duplicateOf: { chapterId: operation.chapter.chapterId, epoch: operation.epoch, sequence: operation.sequence } });
    if (result.accepted) progressChanged(backend, "queued");
  }
}
