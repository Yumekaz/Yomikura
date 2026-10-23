/** Shared by global results, saved searches and the source browse route. */
export function buildSourceBrowsePath(sourceId: string, query: string): string {
  return `/browse/${encodeURIComponent(sourceId)}?${new URLSearchParams({ query })}`;
}

export function readSourceBrowseQuery(params: URLSearchParams): string {
  // Older global-search links used "search". Keep those bookmarks usable while
  // preferring the canonical parameter, including an explicitly empty query.
  return params.get("query") ?? params.get("search") ?? "";
}
