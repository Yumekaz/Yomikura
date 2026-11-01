import type { GetLibraryInsightsQuery } from "../../api/graphql/generated/graphql";
import { parseChapterTimestamp } from "../manga/chapterDate";
export type InsightBook = GetLibraryInsightsQuery["mangas"]["nodes"][number];
const DAY = 86400000;
export function libraryStatistics(books: InsightBook[]) {
  const result = { books: books.length, started: 0, completed: 0, chapters: 0, read: 0, downloaded: 0, tracked: 0, genres: new Map<string, number>() };
  for (const book of books) {
    const chapters = Math.max(0, book.chapters.totalCount), read = Math.max(0, chapters - Math.max(0, book.unreadCount));
    result.chapters += chapters; result.read += read; result.downloaded += Math.max(0, book.downloadCount);
    if (read) result.started++;
    if (chapters > 0 && book.status === "COMPLETED" && book.unreadCount === 0) result.completed++;
    if (book.trackRecords.totalCount > 0) result.tracked++;
    for (const genre of new Set(book.genre.map((item) => item.trim()).filter(Boolean))) result.genres.set(genre, (result.genres.get(genre) ?? 0) + 1);
  }
  return result;
}
export const localDay = (time: number) => { const date = new Date(time); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
export function releaseEstimate(chapters: { chapterNumber: number; uploadDate: unknown }[], now = Date.now()) {
  const numbers = new Map<number, number>();
  for (const chapter of chapters) {
    if (typeof chapter.uploadDate !== "string" && typeof chapter.uploadDate !== "number") continue;
    const time = parseChapterTimestamp(chapter.uploadDate);
    if (!time || time <= 0 || time > now || chapter.chapterNumber <= 0) continue;
    numbers.set(chapter.chapterNumber, Math.min(numbers.get(chapter.chapterNumber) ?? time, time));
  }
  const days = [...new Set([...numbers.values()].map(localDay))].sort((a, b) => b - a).slice(0, 10);
  if (days.length < 3) return null;
  const ordinal = (time: number) => { const d = new Date(time); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY; };
  const gaps = days.slice(1).map((day, index) => ordinal(days[index]) - ordinal(day)).sort((a, b) => a - b);
  const interval = gaps[Math.floor((gaps.length - 1) / 2)];
  if (interval < 1 || interval > 90 || gaps.filter((gap) => Math.abs(gap - interval) <= Math.max(1, interval * 0.4)).length / gaps.length < 0.7) return null;
  const date = new Date(days[0]); date.setDate(date.getDate() + interval);
  return { date: date.getTime(), interval, samples: days.length, overdue: date.getTime() < localDay(now) };
}
export function calendarDays(year: number, month: number) {
  const leading = (new Date(year, month, 1).getDay() + 6) % 7, count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: Math.ceil((leading + count) / 7) * 7 }, (_, index) => index < leading || index >= leading + count ? null : new Date(year, month, index - leading + 1).getTime());
}
