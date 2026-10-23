export type MigrationChapter = {
  id: number | string;
  name: string;
  chapterNumber: number;
  isRead: boolean;
  isBookmarked: boolean;
  lastPageRead: number;
  pageCount?: number;
};

export type ChapterMigration = {
  targetId: number;
  patch: { isRead?: boolean; isBookmarked?: boolean; lastPageRead?: number };
};

export type ChapterMapping = {
  source: MigrationChapter;
  target?: MigrationChapter;
  status: "matched" | "unmatched" | "ambiguous";
  patch: ChapterMigration["patch"];
  positionSkipped: boolean;
};
const titleKey = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const validNumber = (value: number) => Number.isFinite(value) && value >= 0;
export const hasChapterState = (chapter: MigrationChapter) => chapter.isRead || chapter.isBookmarked || chapter.lastPageRead > 0;

/** Refuse ambiguous numbers/names rather than assigning progress to the first search result. */
export function reviewChapterMigration(source: MigrationChapter[], target: MigrationChapter[]): ChapterMapping[] {
  const targets = target.filter((chapter) => Number.isSafeInteger(Number(chapter.id)));
  const proposals = source.map((chapter) => {
    const numbered = validNumber(chapter.chapterNumber) ? targets.filter((candidate) => candidate.chapterNumber === chapter.chapterNumber) : [];
    const name = titleKey(chapter.name);
    const named = name ? targets.filter((candidate) => titleKey(candidate.name) === name) : [];
    const exact = numbered.filter((candidate) => named.includes(candidate));
    const candidates = exact.length ? exact : numbered.length ? numbered : named;
    return { chapter, candidates };
  });
  const claims = new Map<number, number>();
  for (const item of proposals) if (item.candidates.length === 1) {
    const id = Number(item.candidates[0].id); claims.set(id, (claims.get(id) ?? 0) + 1);
  }
  return proposals.map(({ chapter, candidates }) => {
    const match = candidates.length === 1 && claims.get(Number(candidates[0].id)) === 1 ? candidates[0] : undefined;
    const patch: ChapterMigration["patch"] = {};
    let positionSkipped = false;
    if (match) {
      if (chapter.isRead && !match.isRead) patch.isRead = true;
      if (chapter.isBookmarked && !match.isBookmarked) patch.isBookmarked = true;
      if (chapter.lastPageRead > match.lastPageRead && !match.isRead) {
        const samePages = !!chapter.pageCount && chapter.pageCount === match.pageCount;
        const validPosition = Number.isSafeInteger(chapter.lastPageRead) && chapter.lastPageRead >= 0 && chapter.lastPageRead < (match.pageCount ?? 0);
        if (samePages && validPosition) patch.lastPageRead = chapter.lastPageRead;
        else if (!chapter.isRead) positionSkipped = true;
      }
    }
    return { source: chapter, target: match, status: match ? "matched" : candidates.length ? "ambiguous" : "unmatched", patch, positionSkipped };
  });
}

export function buildChapterMigrationPlan(source: MigrationChapter[], target: MigrationChapter[]): ChapterMigration[] {
  return reviewChapterMigration(source, target).flatMap((row) => row.target && Object.keys(row.patch).length ? [{ targetId: Number(row.target.id), patch: row.patch }] : []);
}

export async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<unknown>, concurrency = 4) {
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try { await worker(item); } catch (error) { failed = true; throw error; }
    }
  });
  // Wait for every in-flight write before reporting failure or allowing a retry.
  const results = await Promise.allSettled(workers);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}
