import { describe, expect, it } from "vitest";
import { calendarDays, libraryStatistics, releaseEstimate, type InsightBook } from "./libraryInsights";
import { MangaStatus } from "../../api/graphql/generated/graphql";
const now = new Date(2026, 9, 29, 12).getTime();
const sample = (days: number[]) => days.map((day, i) => ({ chapterNumber: i + 1, uploadDate: String(new Date(2026, 9, day, 12).getTime()) }));
describe("release estimates", () => {
  it("uses distinct release days and labels overdue patterns without inventing a new date", () => {
    const estimate = releaseEstimate(sample([4, 11, 18, 25]), now)!; expect(estimate.interval).toBe(7); expect(estimate.date).toBe(new Date(2026, 10, 1).getTime()); expect(estimate.overdue).toBe(false);
    expect(releaseEstimate(sample([1, 8, 15]), now)?.overdue).toBe(true);
  });
  it("ignores duplicate scanlations, future dates and unknown numbering", () => {
    const chapters = sample([4, 11, 18, 25]); expect(releaseEstimate([...chapters, ...chapters, { chapterNumber: 5, uploadDate: String(now + 86400000) }, { chapterNumber: -1, uploadDate: "0" }], now)).toEqual(releaseEstimate(chapters, now));
  });
  it("does not guess for sparse or inconsistent samples", () => {
    expect(releaseEstimate(sample([4, 25]), now)).toBeNull(); expect(releaseEstimate(sample([1, 2, 10, 28]), now)).toBeNull();
  });
  it("places leap-day and month boundaries in complete Monday-first weeks", () => {
    const dates = calendarDays(2028, 1); expect(dates.filter((value) => value !== null)).toHaveLength(29); expect(dates.length % 7).toBe(0); expect(dates[0]).toBeNull();
  });
});
it("counts completed publications only when caught up and deduplicates genres", () => {
  const book = { id: 1, chapters: { totalCount: 50 }, unreadCount: 0, status: "COMPLETED", downloadCount: 4, trackRecords: { totalCount: 2 }, genre: ["Fantasy", "Fantasy"] } as InsightBook;
  const stats = libraryStatistics([book, { ...book, id: 2, unreadCount: 25, status: MangaStatus.Ongoing, downloadCount: 0, trackRecords: { totalCount: 0 } }]);
  expect(stats).toMatchObject({ books: 2, started: 2, completed: 1, chapters: 100, read: 75, downloaded: 4, tracked: 1 }); expect(stats.genres.get("Fantasy")).toBe(2);
});
