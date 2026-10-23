import { describe, expect, it } from "vitest";
import { buildChapterMigrationPlan, reviewChapterMigration, runWithConcurrency } from "./chapterMigration";

const chapter = (id: number, overrides: Partial<Parameters<typeof buildChapterMigrationPlan>[0][number]> = {}) => ({
  id, name: `Chapter ${id}`, chapterNumber: id, isRead: false, isBookmarked: false, lastPageRead: 0, pageCount: 20, ...overrides,
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

  it("marks both proposals ambiguous when they claim the same destination", () => {
    const rows = reviewChapterMigration([chapter(1, { isRead: true }), chapter(2, { name: "Chapter 1", chapterNumber: 99, isBookmarked: true })], [chapter(10, { name: "Chapter 1", chapterNumber: 1 })]);
    expect(rows.map((row) => row.status)).toEqual(["ambiguous", "ambiguous"]);
  });

  it("does not match unrelated unknown chapter numbers", () => {
    const rows = reviewChapterMigration([chapter(1, { name: "Prologue", chapterNumber: -1, isRead: true })], [chapter(10, { name: "Bonus", chapterNumber: -1 })]);
    expect(rows[0].status).toBe("unmatched");
  });

  it("uses a unique normalized name for special chapters and disambiguates duplicate numbers", () => {
    const rows = reviewChapterMigration([chapter(1, { name: "  Prologue  ", chapterNumber: -1 }), chapter(2, { name: "Release B", chapterNumber: 3 })],
      [chapter(10, { name: "prologue", chapterNumber: -1 }), chapter(11, { name: "Release A", chapterNumber: 3 }), chapter(12, { name: "Release B", chapterNumber: 3 })]);
    expect(rows.map((row) => row.target?.id)).toEqual([10, 12]);
  });

  it("reports duplicate matches as ambiguous rather than choosing the first", () => {
    const [row] = reviewChapterMigration([chapter(1, { isRead: true })], [chapter(10, { chapterNumber: 1 }), chapter(11, { chapterNumber: 1 })]);
    expect(row.status).toBe("ambiguous"); expect(row.patch).toEqual({});
  });

  it.each([0, 8, 30])("does not copy an incomplete page position across changed/unknown page counts (%s)", (pageCount) => {
    const [row] = reviewChapterMigration([chapter(1, { isBookmarked: true, lastPageRead: 8 })], [chapter(10, { chapterNumber: 1, pageCount })]);
    expect(row.patch).toEqual({ isBookmarked: true }); expect(row.positionSkipped).toBe(true);
  });

  it("preserves a completed target and permits retrying an already applied copy", () => {
    const [row] = reviewChapterMigration([chapter(1, { isRead: true, isBookmarked: true, lastPageRead: 8 })], [chapter(10, { chapterNumber: 1, isRead: true, isBookmarked: true })]);
    expect(row.patch).toEqual({}); expect(row.status).toBe("matched"); expect(row.positionSkipped).toBe(false);
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

  it("waits for started writes to settle before exposing a partial failure", async () => {
    let release!: () => void;
    let settled = false;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    const run = runWithConcurrency([1, 2, 3], async (id) => {
      if (id === 1) throw new Error("copy failed");
      if (id === 2) { await slow; settled = true; }
      if (id === 3) throw new Error("a new write started after failure");
    }, 2);
    let finished = false;
    const observed = run.catch((error) => { finished = true; return error; });
    await Promise.resolve(); await Promise.resolve();
    expect(finished).toBe(false); release();
    expect((await observed).message).toBe("copy failed"); expect(settled).toBe(true);
  });
});
