type Connection<T> = { nodes: T[]; totalCount?: number; pageInfo: { hasNextPage: boolean; endCursor?: unknown } };
/** Never present a truncated or unstable library as a complete inventory. */
export async function collectLibraryPages<T>(fetchPage: (after?: string) => Promise<Connection<T>>, identify: (item: T) => string | number = (item) => (item as { id: number }).id) {
  const all: T[] = [], ids = new Set<string | number>(), cursors = new Set<string>();
  let after: string | undefined, expected: number | undefined;
  for (;;) {
    const page = await fetchPage(after);
    if (!page?.pageInfo || !Array.isArray(page.nodes)) throw new Error("Your library list couldn’t be read. Refresh to try again.");
    if (typeof page.totalCount === "number") {
      if (expected !== undefined && expected !== page.totalCount) throw new Error("Your library changed while loading. Refresh to try again.");
      expected = page.totalCount;
    }
    for (const item of page.nodes) {
      const id = identify(item);
      if (typeof id !== "string" && typeof id !== "number" || ids.has(id)) throw new Error("Your library repeated or omitted a record. Refresh to try again.");
      ids.add(id); all.push(item);
    }
    if (!page.pageInfo.hasNextPage) {
      if (expected !== undefined && all.length !== expected) throw new Error("Your library list is incomplete. Refresh to try again.");
      return all;
    }
    const cursor = page.pageInfo.endCursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor) || !page.nodes.length || all.length > 100000) throw new Error("Your library stopped returning usable pages. Refresh to try again.");
    cursors.add(cursor); after = cursor;
  }
}
