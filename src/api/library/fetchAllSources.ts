import type { SuwayomiSdk } from "../graphql/client";
/** Read all source pages, including languages supplied by a multi-language extension. */
export async function fetchAllSources(sdk: Pick<SuwayomiSdk, "GetSources">, signal?: AbortSignal) {
  const nodes: Awaited<ReturnType<SuwayomiSdk["GetSources"]>>["sources"]["nodes"] = [];
  const ids = new Set<string>(), cursors = new Set<string>();
  let after: string | undefined;
  let expected: number | undefined;
  for (;;) {
    const data = await sdk.GetSources({ first: 200, after }, undefined, signal);
    const page = data.sources;
    if (typeof page.totalCount === "number") {
      if (expected !== undefined && expected !== page.totalCount) throw new Error("The source list changed while loading. Try again.");
      expected = page.totalCount;
    }
    for (const source of page.nodes) {
      const id = String(source.id);
      if (ids.has(id)) throw new Error("The source list repeated a page. Try again.");
      ids.add(id); nodes.push(source);
    }
    if (!page.pageInfo?.hasNextPage) {
      if (expected !== undefined && nodes.length !== expected) throw new Error("The source list is incomplete. Try again.");
      return { sources: { nodes, totalCount: nodes.length } };
    }
    const cursor = page.pageInfo.endCursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor) || !page.nodes.length) throw new Error("Source pagination stopped making progress. Try again.");
    cursors.add(cursor); after = cursor;
  }
}
