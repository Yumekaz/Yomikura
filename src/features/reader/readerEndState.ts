export type ReaderEndState = "checking" | "unknown" | "offline" | "filtered" | "caught-up" | "next";

export interface ReaderEndContext {
  chapterId: number;
  nextChapterId?: number;
  knownChapterIds?: readonly number[];
  listStatus: "loading" | "confirmed" | "error";
  offline?: boolean;
}

/** A missing eligible chapter is not proof that the source has no next chapter. */
export function deriveReaderEndState({ chapterId, nextChapterId, knownChapterIds, listStatus, offline }: ReaderEndContext): ReaderEndState {
  if (nextChapterId !== undefined) return "next";
  if (listStatus === "loading") return "checking";
  if (listStatus === "error") return "unknown";
  if (offline) return "offline";
  const index = knownChapterIds?.indexOf(chapterId) ?? -1;
  if (index < 0) return "unknown";
  return index < knownChapterIds!.length - 1 ? "filtered" : "caught-up";
}
