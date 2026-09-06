export interface ProgressChapter {
  id: number;
  name: string;
  chapterNumber: number;
  mangaId: number;
  pages: string[];
}

export interface ProgressSnapshot {
  chapterId: number;
  chapterName: string;
  chapterNumber: number;
  mangaId: number;
  mangaTitle: string;
  pageIndex: number;
  pageCount: number;
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
  };
}
