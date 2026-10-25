import type { QueryClient } from "@tanstack/react-query";
import { getCachedChapter, saveCachedChapter } from "./offlineCache";

/** Chapter mutations affect both source-fetched lists and database-backed views. */
export async function invalidateChapterState(client: QueryClient) {
  await Promise.all(["chapter", "manga-chapters", "manga", "library", "updates", "history"].map((key) =>
    client.invalidateQueries({ queryKey: [key] }),
  ));
}

/** Explicit read/unread actions must also apply to a device's saved copy. */
export async function applyCachedChapterReadPatch(
  serverBaseUrl: string,
  chapterId: number,
  patch: { isRead?: boolean; lastPageRead?: number },
) {
  if (patch.isRead === undefined && patch.lastPageRead === undefined) return;
  const cached = await getCachedChapter(serverBaseUrl, chapterId);
  if (!cached) return;
  await saveCachedChapter({
    ...cached,
    ...(patch.isRead !== undefined ? { isRead: patch.isRead } : {}),
    ...(patch.lastPageRead !== undefined ? { lastPageRead: patch.lastPageRead } : {}),
  });
}
