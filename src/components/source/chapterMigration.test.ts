import { describe, expect, it } from "vitest";
import { buildChapterMigrationPlan, runWithConcurrency } from "./chapterMigration";

const chapter = (id: number, overrides: Partial<Parameters<typeof buildChapterMigrationPlan>[0][number]> = {}) => ({
  id, name: `Chapter ${id}`, chapterNumber: id, isRead: false, isBookmarked: false, lastPageRead: 0, ...overrides,
});

describe("chapter migration", () => {
  it("preserves read state, bookmarks, and the furthest partial page without overwriting newer target state", () => {
    const plan = buildChapterMigrationPlan(
      [chapter(1, { isRead: true, isBookmarked: true, lastPageRead: 8 })],
      [chapter(10, { name: " chapter 1 ", chapterNumber: 1, lastPageRead: 3 })],
    );
    expect(plan).toEqual([{ targetId: 10, patch: { isRead: true, isBookmarked: true, lastPageRead: 8 } }]);
  });

  it("does not map two old chapters onto the same target chapter", () => {
    const plan = buildChapterMigrationPlan(
      [chapter(1, { isRead: true }), chapter(2, { name: "Chapter 1", chapterNumber: 99, isBookmarked: true })],
      [chapter(10, { chapterNumber: 1 })],
    );
    expect(plan).toHaveLength(1);
  });

  it("limits concurrent mutations", async () => {
    let active = 0;
    let peak = 0;
    await runWithConcurrency([1, 2, 3, 4, 5], async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
    }, 2);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
