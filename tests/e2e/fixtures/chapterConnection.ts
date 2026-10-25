export const chapterConnection = (mangaId: number, nodes: { id: number; chapterNumber: number; [key: string]: unknown }[]) => ({ chapters: {
  totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes: nodes.map((chapter) => ({ mangaId, name: `Chapter ${chapter.chapterNumber}`, sourceOrder: chapter.chapterNumber, isRead: false, isBookmarked: false, isDownloaded: false, uploadDate: "0", scanlator: null, ...chapter })),
} });
