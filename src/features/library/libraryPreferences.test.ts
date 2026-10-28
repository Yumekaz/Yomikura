import { expect, it } from "vitest";
import { EMPTY_LIBRARY_FILTERS, nextFilterChoice } from "../../stores/experiencePreferences";
import { compareLibraryBooks, librarySortScope, libraryTraits, matchesLibraryPreferences } from "./libraryPreferences";

it("combines inclusion and exclusion without turning a neutral filter into an exclusion", () => {
  const traits = { downloaded: true, unread: true, started: false, bookmarked: true, completed: false };
  expect(matchesLibraryPreferences(traits, { ...EMPTY_LIBRARY_FILTERS })).toBe(true);
  expect(matchesLibraryPreferences(traits, { ...EMPTY_LIBRARY_FILTERS, downloaded: "include", started: "exclude", bookmarked: "include" })).toBe(true);
  expect(matchesLibraryPreferences(traits, { ...EMPTY_LIBRARY_FILTERS, downloaded: "exclude", started: "exclude" })).toBe(false);
  expect(matchesLibraryPreferences(traits, { ...EMPTY_LIBRARY_FILTERS, completed: "include" })).toBe(false);
  expect([nextFilterChoice("any"), nextFilterChoice("include"), nextFilterChoice("exclude")]).toEqual(["include", "exclude", "any"]);
});
it("uses completed chapters for Started and publication status for Completed", () => {
  const book = { unreadCount: 50, chapters: { totalCount: 100 }, status: "ONGOING", lastReadChapter: null };
  expect(libraryTraits(book, 0, false)).toMatchObject({ started: true, completed: false });
  expect(libraryTraits({ ...book, unreadCount: 100, lastReadChapter: { id: 1 } }, 0, false).started).toBe(false);
  expect(libraryTraits({ ...book, unreadCount: 0 }, 0, false).completed).toBe(false);
  expect(libraryTraits({ ...book, status: "COMPLETED" }, 0, true)).toMatchObject({ completed: true, unread: true, bookmarked: true });
});
it("treats local source books and either download location as available without changing backend flags", () => {
  const book = { unreadCount: 1, downloadCount: 0, sourceId: "0" };
  expect(libraryTraits(book, 0, false).downloaded).toBe(true);
  expect(libraryTraits({ ...book, sourceId: "other" }, 1, false).downloaded).toBe(true);
  expect(libraryTraits({ ...book, sourceId: "other" }, 0, false).downloaded).toBe(false);
  expect(book.downloadCount).toBe(0);
});
it("isolates category sorting across backends and distinguishes All from category zero", () => {
  expect(librarySortScope("demo:a", 1)).not.toBe(librarySortScope("live:a", 1));
  expect(librarySortScope("live:a", 0)).not.toBe(librarySortScope("live:a", null));
  const a = { title: "A", unreadCount: 1, hasStartedReading: true, lastReadAt: 20 };
  const b = { ...a, title: "B", lastReadAt: 10 };
  expect(compareLibraryBooks(a, b, "last_read", true)).toBeLessThan(0);
  expect(compareLibraryBooks(a, b, "last_read", false)).toBeGreaterThan(0);
});
