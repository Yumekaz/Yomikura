/** Shared by global results, saved searches and the source browse route. */
export function buildSourceBrowsePath(sourceId: string, query: string, filters?: string): string {
  const params = new URLSearchParams({ query });
  if (filters && filters !== "{}") params.set("filters", filters);
  return `/browse/${encodeURIComponent(sourceId)}?${params}`;
}

export function readSourceBrowseQuery(params: URLSearchParams): string {
  // Older global-search links used "search". Keep those bookmarks usable while
  // preferring the canonical parameter, including an explicitly empty query.
  return params.get("query") ?? params.get("search") ?? "";
}
