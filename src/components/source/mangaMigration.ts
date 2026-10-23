import { createGraphqlClient } from "../../api/graphql/client";
import type { GetMigrationChaptersQuery, GetMigrationMangaQuery } from "../../api/graphql/generated/graphql";
import { chapterIdentityMatches, progressBackend, type ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { getProgressHeads } from "../../api/suwayomi/progressStorage";
import { progressChapterIdentity, synchronizeProgress, writeChapterProgress } from "../../api/suwayomi/progressSync";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { hasChapterState, reviewChapterMigration, runWithConcurrency, type ChapterMapping } from "./chapterMigration";

export type MigrationTitle = GetMigrationMangaQuery["manga"] & { chapters: GetMigrationChaptersQuery["chapters"]["nodes"] };
export type MigrationReview = { backend: ProgressBackend; source: MigrationTitle; target: MigrationTitle; rows: ChapterMapping[] };
export type MigrationResult = { mode: "copy" | "replace"; selected: number; targetId: number; originalId: number };
export class MigrationError extends Error {
  constructor(message: string, public original: "unchanged" | "unknown" = "unchanged") { super(message); this.name = "MigrationError"; }
}

function assertBackend(backend: ProgressBackend) {
  const settings = useSettingsStore.getState();
  if (progressBackend(settings.serverBaseUrl, settings.mockMode).key !== backend.key) throw new MigrationError("The selected server changed. Reopen the migration review on the intended server.");
}
const sdkFor = (backend: ProgressBackend) => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live");

async function loadTitle(backend: ProgressBackend, id: number, includePending = true): Promise<MigrationTitle> {
  assertBackend(backend);
  const sdk = sdkFor(backend);
  const { manga } = await sdk.GetMigrationManga({ id });
  assertBackend(backend);
  if (!manga || manga.id !== id) throw new MigrationError("The title record changed. Refresh the titles before migrating.");
  const chapters: MigrationTitle["chapters"] = [];
  let after: unknown;
  let total: number | undefined;
  const cursors = new Set<string>();
  const ids = new Set<number>();
  do {
    const page = (await sdk.GetMigrationChapters({ mangaId: id, after })).chapters;
    assertBackend(backend);
    if (!page || total !== undefined && total !== page.totalCount) throw new MigrationError("The chapter list changed during loading. Refresh the migration review.");
    total = page.totalCount;
    for (const chapter of page.nodes) {
      if (chapter.mangaId !== id || ids.has(chapter.id)) throw new MigrationError("The chapter list could not be loaded consistently. Refresh the migration review.");
      ids.add(chapter.id); chapters.push(chapter);
    }
    if (!page.pageInfo.hasNextPage) break;
    const cursor = page.pageInfo.endCursor;
    if (!page.nodes.length || typeof cursor !== "string" || !cursor || cursors.has(cursor)) throw new MigrationError("The server did not provide a usable next chapter page. The complete mapping must be loaded before migration.");
    cursors.add(cursor); after = cursor;
  } while (true);
  if (chapters.length !== total) throw new MigrationError("The chapter list is incomplete. Refresh it before migration.");
  const heads = await getProgressHeads(backend);
  assertBackend(backend);
  for (const chapter of chapters) {
    const pending = heads.find((head) => head.chapter.chapterId === chapter.id && (backend.isDemo || includePending && head.sequence > head.acknowledgedSequence));
    if (!pending) continue;
    if (!chapterIdentityMatches(pending.chapter, progressChapterIdentity({ ...chapter, manga: { title: manga.title } }))) throw new MigrationError("Pending progress belongs to a changed chapter record. Resolve it before migrating this title.");
    Object.assign(chapter, pending.patch);
  }
  return { ...manga, chapters };
}

function structure(title: MigrationTitle) {
  return JSON.stringify([title.id, title.title, title.sourceId, [...title.chapters].sort((a, b) => a.id - b.id)
    .map((chapter) => [chapter.id, chapter.mangaId, chapter.name, chapter.chapterNumber, chapter.sourceOrder, chapter.pageCount])]);
}
function snapshot(title: MigrationTitle) {
  return JSON.stringify([structure(title), title.inLibrary, title.categories.edges.map((edge) => edge.node.id).sort((a, b) => a - b),
    [...title.chapters].sort((a, b) => a.id - b.id).map((chapter) => [chapter.id, chapter.isRead, chapter.isBookmarked, chapter.lastPageRead])]);
}

export async function prepareMangaMigration(backend: ProgressBackend, sourceId: number, targetId: number, options: { expectedSourceTitle?: string; expectedTargetSource?: string } = {}): Promise<MigrationReview> {
  if (!Number.isSafeInteger(sourceId) || !Number.isSafeInteger(targetId) || sourceId < 0 || targetId < 0 || sourceId === targetId) throw new MigrationError("Choose a different title as the migration destination.");
  assertBackend(backend);
  const refreshed = await sdkFor(backend).RefreshMigrationTarget({ input: { id: targetId, fetchManga: true, fetchChapters: true } });
  assertBackend(backend);
  if (refreshed.fetchMangaAndChapters?.manga.id !== targetId) throw new MigrationError("The destination chapters could not be refreshed. No library membership was changed.");
  const source = await loadTitle(backend, sourceId);
  const target = await loadTitle(backend, targetId);
  if (options.expectedSourceTitle !== undefined && source.title !== options.expectedSourceTitle) throw new MigrationError("The original title changed. Reopen its details before migrating.");
  if (options.expectedTargetSource !== undefined && String(target.sourceId) !== options.expectedTargetSource) throw new MigrationError("The destination no longer belongs to the selected source. Choose it again.");
  return { backend, source, target, rows: reviewChapterMigration(source.chapters, target.chapters) };
}

export function canReplaceMigration(review: MigrationReview, selected: ReadonlySet<number>) {
  return review.source.inLibrary && review.rows.length > 0 && review.target.chapters.length > 0
    && review.rows.every((row) => row.status === "matched" && !row.positionSkipped && (!hasChapterState(row.source) || selected.has(Number(row.source.id))));
}

function verifySelection(review: MigrationReview, selected: ReadonlySet<number>) {
  const matches = review.rows.filter((row) => row.status === "matched");
  if (!review.source.chapters.length || !review.target.chapters.length || !matches.length) throw new MigrationError("There are no safely matched chapters to migrate. Choose another destination or refresh its chapters.");
  if ([...selected].some((id) => !matches.some((row) => Number(row.source.id) === id))) throw new MigrationError("The selected chapter mapping is no longer valid. Review it again.");
  if (!selected.size) throw new MigrationError("Select at least one matched chapter to copy.");
}

export async function executeMangaMigration(review: MigrationReview, selected: ReadonlySet<number>, mode: "copy" | "replace"): Promise<MigrationResult> {
  const { backend } = review;
  verifySelection(review, selected);
  if (mode === "replace" && !canReplaceMigration(review, selected)) throw new MigrationError("Replacement requires a complete, unambiguous mapping and every saved chapter state selected. Copy while keeping the original instead.");
  let removalStarted = false;
  try {
    assertBackend(backend);
    const sdk = sdkFor(backend);
    await synchronizeProgress(backend);
    assertBackend(backend);
    const source = await loadTitle(backend, review.source.id);
    const target = await loadTitle(backend, review.target.id);
    if (snapshot(source) !== snapshot(review.source) || structure(target) !== structure(review.target)) throw new MigrationError("The titles or original progress changed after the review. Refresh the mapping before copying.");
    const rows = reviewChapterMigration(source.chapters, target.chapters).filter((row) => selected.has(Number(row.source.id)));
    if (mode === "replace" && !canReplaceMigration({ ...review, source, target, rows: reviewChapterMigration(source.chapters, target.chapters) }, selected)) throw new MigrationError("The complete original state can no longer be transferred. Refresh the review.");
    assertBackend(backend);
    if (!target.inLibrary) {
      const added = await sdk.ToggleMangaLibrary({ input: { id: target.id, patch: { inLibrary: true } } });
      assertBackend(backend);
      if (!added.updateManga?.manga?.inLibrary) throw new MigrationError("The destination was not confirmed in the library.");
    }
    await runWithConcurrency(rows.filter((row) => Object.keys(row.patch).length > 0), async (row) => {
      assertBackend(backend);
      const destination = target.chapters.find((chapter) => chapter.id === Number(row.target!.id))!;
      await writeChapterProgress(backend, destination.id, row.patch, { requireAcknowledgment: true,
        fallback: progressChapterIdentity({ ...destination, manga: { title: target.title } }),
      });
      assertBackend(backend);
    }, 2);
    const categories = source.categories.edges.map((edge) => edge.node.id).filter((id) => id > 0);
    if (categories.length) {
      assertBackend(backend);
      await sdk.UpdateMangaCategories({ input: { id: target.id, patch: { addToCategories: categories } } });
      assertBackend(backend);
    }
    const copied = await loadTitle(backend, target.id, false);
    if (structure(copied) !== structure(target)) throw new MigrationError("The destination chapters changed during copying. Refresh the review before replacing the original.");
    if (!copied.inLibrary || categories.some((id) => !copied.categories.edges.some((edge) => edge.node.id === id))) throw new MigrationError("The destination library membership or categories could not be verified. The copy can be retried.");
    for (const row of rows) {
      const chapter = copied.chapters.find((item) => item.id === Number(row.target!.id));
      const positionRequired = row.source.lastPageRead > 0 && !row.source.isRead && !row.positionSkipped;
      if (!chapter || row.source.isRead && !chapter.isRead || row.source.isBookmarked && !chapter.isBookmarked
        || positionRequired && !chapter.isRead && (!Number.isSafeInteger(chapter.lastPageRead) || chapter.lastPageRead >= chapter.pageCount || chapter.lastPageRead < row.source.lastPageRead)) throw new MigrationError("Some copied chapter state was not confirmed. The copy can be retried.");
    }
    if (mode === "replace") {
      const current = await loadTitle(backend, source.id);
      if (snapshot(current) !== snapshot(source)) throw new MigrationError("The original progress changed during copying. Keep the original and refresh the review.");
      assertBackend(backend);
      removalStarted = true;
      try {
        const removed = await sdk.ToggleMangaLibrary({ input: { id: source.id, patch: { inLibrary: false } } });
        if (removed.updateManga?.manga?.inLibrary !== false) throw new Error("Membership change was not confirmed.");
      } catch (error) {
        // A lost response can follow a successful mutation. Do not claim the original was kept.
        assertBackend(backend);
        const confirmed = await sdk.GetMigrationManga({ id: source.id }).catch(() => undefined);
        if (confirmed?.manga.id !== source.id) throw error;
        if (confirmed.manga.inLibrary) {
          removalStarted = false;
          throw new MigrationError("The copy was verified, but the original is still in the library. Refresh the mapping to retry replacement.");
        }
      }
    }
    return { mode, selected: rows.length, targetId: target.id, originalId: source.id };
  } catch (error) {
    if (error instanceof MigrationError && !removalStarted) throw error;
    throw new MigrationError(error instanceof Error ? error.message : "The migration could not be completed.", removalStarted ? "unknown" : "unchanged");
  }
}
