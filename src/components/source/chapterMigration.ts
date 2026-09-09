export type MigrationChapter = {
  id: number | string;
  name: string;
  chapterNumber: number;
  isRead: boolean;
  isBookmarked: boolean;
  lastPageRead: number;
};

export type ChapterMigration = {
  targetId: number;
  patch: { isRead?: boolean; isBookmarked?: boolean; lastPageRead?: number };
};

function titleKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function buildChapterMigrationPlan(source: MigrationChapter[], target: MigrationChapter[]): ChapterMigration[] {
  const usedTargetIds = new Set<number>();
  const plan: ChapterMigration[] = [];

  for (const sourceChapter of source) {
    if (!sourceChapter.isRead && !sourceChapter.isBookmarked && sourceChapter.lastPageRead <= 0) continue;
    const numberMatch = target.find((candidate) =>
      !usedTargetIds.has(Number(candidate.id)) && Number.isFinite(sourceChapter.chapterNumber) &&
      candidate.chapterNumber === sourceChapter.chapterNumber,
    );
    const nameMatch = target.find((candidate) =>
      !usedTargetIds.has(Number(candidate.id)) && titleKey(candidate.name) === titleKey(sourceChapter.name),
    );
    const targetChapter = numberMatch ?? nameMatch;
    if (!targetChapter) continue;

    const targetId = Number(targetChapter.id);
    if (!Number.isSafeInteger(targetId)) continue;
    usedTargetIds.add(targetId);

    const patch = {
      ...(sourceChapter.isRead && !targetChapter.isRead ? { isRead: true } : {}),
      ...(sourceChapter.isBookmarked && !targetChapter.isBookmarked ? { isBookmarked: true } : {}),
      ...(sourceChapter.lastPageRead > targetChapter.lastPageRead ? { lastPageRead: sourceChapter.lastPageRead } : {}),
    };
    if (Object.keys(patch).length) plan.push({ targetId, patch });
  }

  return plan;
}

export async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<unknown>, concurrency = 4) {
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}
