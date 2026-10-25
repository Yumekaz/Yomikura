import { expect, it } from "vitest";
import { isLibraryDiscovery, updateTimestamp, nextUpdatePage } from "./updateFeed";
it("includes newly fetched chapters even when their publication date is old", () => {
  const item = { fetchedAt: "1800000000000", uploadDate: "1000000000000", manga: { inLibraryAt: "1700000000000" } };
  expect(isLibraryDiscovery(item)).toBe(true); expect(updateTimestamp(item, "discovered")).toBe(1800000000000); expect(updateTimestamp(item, "published")).toBe(1000000000000);
});
it("excludes known pre-library discoveries and retains unknown legacy timestamps honestly", () => {
  expect(isLibraryDiscovery({ fetchedAt: "1600000000000", manga: { inLibraryAt: "1700000000000" } })).toBe(false);
  expect(isLibraryDiscovery({ manga: {} })).toBe(true); expect(updateTimestamp({}, "discovered")).toBeNull();
});
it("rejects empty or looping update cursors without claiming the feed is complete", () => {
  expect(() => nextUpdatePage({ hasNextPage: true, endCursor: "older" }, { after: "current", seen: ["older"] })).toThrow("pagination");
  expect(() => nextUpdatePage({ hasNextPage: true, endCursor: null }, { after: undefined, seen: [] })).toThrow("pagination");
  expect(nextUpdatePage({ hasNextPage: false }, { after: "last", seen: [] })).toBeUndefined();
});
