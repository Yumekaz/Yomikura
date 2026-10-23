export interface ProgressChapter {
  id: number;
  name: string;
  chapterNumber: number;
  mangaId: number;
  pages: string[];
  isRead?: boolean;
  sourceOrder?: number;
  progressEpoch?: number;
  progressBaseline?: { isRead: boolean; lastPageRead: number };
}

export interface ProgressSnapshot {
  chapterId: number;
  chapterName: string;
  chapterNumber: number;
  mangaId: number;
  mangaTitle: string;
  pageIndex: number;
  pageCount: number;
  wasRead: boolean;
  sourceOrder?: number;
  progressEpoch: number;
  baseline: { isRead: boolean; lastPageRead: number };
}

export function createProgressSnapshot(
  chapter: ProgressChapter,
  mangaTitle: string,
  pageIndex: number
): ProgressSnapshot {
  return {
    chapterId: chapter.id,
    chapterName: chapter.name,
    chapterNumber: chapter.chapterNumber,
    mangaId: chapter.mangaId,
    mangaTitle,
    pageIndex: Math.max(0, Math.min(pageIndex, Math.max(0, chapter.pages.length - 1))),
    pageCount: chapter.pages.length,
    wasRead: chapter.isRead === true,
    sourceOrder: chapter.sourceOrder,
    progressEpoch: chapter.progressEpoch ?? 0,
    baseline: chapter.progressBaseline ?? { isRead: chapter.isRead === true, lastPageRead: 0 },
  };
}
