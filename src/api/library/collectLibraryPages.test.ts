import { describe, expect, it, vi } from "vitest";
import { collectLibraryPages } from "./collectLibraryPages";
const page = (ids: number[], hasNextPage = false, endCursor: string | null = null, totalCount = 2) => ({ nodes: ids.map((id) => ({ id })), totalCount, pageInfo: { hasNextPage, endCursor } });
describe("complete library inventories", () => {
  it("reads subsequent cursors and preserves the server order", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page([8], true, "one")).mockResolvedValueOnce(page([3]));
    expect(await collectLibraryPages(fetch)).toEqual([{ id: 8 }, { id: 3 }]); expect(fetch).toHaveBeenLastCalledWith("one");
  });
  it.each([
    [page([1], true, "same"), page([2], true, "same")],
    [page([1], true, "one"), page([1])],
    [page([1], true, "one"), page([], true, "two")],
    [page([1], true, "one"), page([2], false, null, 3)],
    [page([1], true, "one"), page([], false)],
  ])("rejects repeated, stalled, changing and incomplete responses", async (first, second) => {
    await expect(collectLibraryPages(vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second))).rejects.toThrow(/library/);
  });
  it("rejects a missing connection rather than showing an empty collection", async () => {
    await expect(collectLibraryPages(vi.fn().mockResolvedValue(null))).rejects.toThrow(/couldn’t be read/);
  });
});
