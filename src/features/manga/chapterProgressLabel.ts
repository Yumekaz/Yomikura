/** Stored page positions are zero-based; labels always describe the visible page. */
export function chapterProgressLabel(chapter: { isRead: boolean; lastPageRead?: number; pageCount?: number }) {
  if (chapter.isRead) return "Read";
  if (!Number.isFinite(chapter.lastPageRead) || chapter.lastPageRead! <= 0) return "";
  const current = Math.floor(chapter.lastPageRead!) + 1, total = Math.max(0, Math.floor(chapter.pageCount ?? 0));
  return total > 0 ? `Page ${Math.min(current, total)} of ${total}` : `Page ${current}`;
}
