import { expect, it, vi } from "vitest";
import type { SuwayomiSdk } from "../graphql/client";
import { fetchAllSources } from "./fetchAllSources";
import { fetchBookmarkMembership } from "./fetchBookmarkMembership";
const sourcePage = (ids: string[], next = false, cursor: string | null = null, count = ids.length) => ({ sources: { totalCount: count, pageInfo: { hasNextPage: next, endCursor: cursor }, nodes: ids.map((id) => ({ id, name: id, lang: id === "fr" ? "fr" : "en" })) } });
it("loads child languages and preserves large source IDs across cursor pages", async () => {
  const GetSources = vi.fn().mockResolvedValueOnce(sourcePage(["6247824327199706550"], true, "next", 2)).mockResolvedValueOnce(sourcePage(["fr"], false, null, 2));
  const sdk = { GetSources } as unknown as SuwayomiSdk;
  const result = await fetchAllSources(sdk);
  expect(result.sources.nodes.map((source) => source.id)).toEqual(["6247824327199706550", "fr"]);
  expect(GetSources.mock.calls[1][0]).toEqual({ first: 200, after: "next" });
});
it.each(["repeat", "missing", "changed", "stuck"])("rejects an unsafe source snapshot: %s", async (failure) => {
  const GetSources = vi.fn().mockResolvedValueOnce(sourcePage(["en"], true, "next", 2)).mockResolvedValueOnce(sourcePage(failure === "repeat" ? ["en"] : [], failure === "stuck", failure === "stuck" ? "next" : null, failure === "changed" ? 3 : 2));
  await expect(fetchAllSources({ GetSources } as unknown as SuwayomiSdk)).rejects.toThrow();
});
it("collects bookmarks from every page and deduplicates membership rather than truncating the library", async () => {
  const GetBookmarkedLibraryChapters = vi.fn().mockResolvedValueOnce({ chapters: { totalCount: 3, nodes: [{ id: 1, mangaId: 10 }, { id: 2, mangaId: 10 }], pageInfo: { hasNextPage: true, endCursor: "next" } } }).mockResolvedValueOnce({ chapters: { totalCount: 3, nodes: [{ id: 3, mangaId: 20 }], pageInfo: { hasNextPage: false, endCursor: null } } });
  expect([...await fetchBookmarkMembership({ GetBookmarkedLibraryChapters } as unknown as SuwayomiSdk)]).toEqual([10, 20]);
});
it("rejects incomplete bookmark results", async () => {
  const GetBookmarkedLibraryChapters = vi.fn().mockResolvedValue({ chapters: { totalCount: 4, nodes: [{ id: 1, mangaId: 10 }], pageInfo: { hasNextPage: false, endCursor: null } } });
  await expect(fetchBookmarkMembership({ GetBookmarkedLibraryChapters } as unknown as SuwayomiSdk)).rejects.toThrow("incomplete");
});
