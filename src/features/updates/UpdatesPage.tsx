import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Clock3, RefreshCw, Play, BookOpen } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { ChapterOrderBy, SortOrder } from "../../api/graphql/generated/graphql";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { formatChapterDate } from "../manga/chapterDate";
import { LibraryUpdateButton } from "../../components/library/LibraryUpdateButton";
import { isLibraryDiscovery, updateTimestamp, nextUpdatePage, type UpdateDateMode, type UpdateCursor } from "./updateFeed";

export default function UpdatesPage() {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const [mode, setMode] = useState<UpdateDateMode>("discovered");
  const feed = useInfiniteQuery({
    queryKey: ["updates", backend.key, mode], initialPageParam: { after: undefined, seen: [] } as UpdateCursor, enabled: !!serverBaseUrl,
    queryFn: async ({ pageParam, signal }) => {
      const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal }, backend.isDemo ? "demo" : "live");
      const connection = (await sdk.GetUpdates({ filter: { inLibrary: { equalTo: true } }, order: [{ by: mode === "discovered" ? ChapterOrderBy.FetchedAt : ChapterOrderBy.UploadDate, byType: SortOrder.Desc }, { by: ChapterOrderBy.Id, byType: SortOrder.Desc }], first: 100, after: pageParam.after })).chapters;
      return { ...connection, next: nextUpdatePage(connection.pageInfo, pageParam) };
    },
    getNextPageParam: (last) => last.next,
  });
  const updates = useMemo(() => {
    const nodes = feed.data?.pages.flatMap((page) => page.nodes) ?? [];
    return [...new Map(nodes.map((node) => [node.id, node])).values()].filter((node) => mode === "published" || isLibraryDiscovery(node));
  }, [feed.data, mode]);
  const groups = useMemo(() => {
    const result = new Map<string, typeof updates>(); const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (const item of updates) { const time = updateTimestamp(item, mode); const key = time === null || time <= 0 ? "Unknown Date" : time >= today ? "Today" : time >= today - 86400000 ? "Yesterday" : time >= today - 7 * 86400000 ? "This Week" : "Older"; result.set(key, [...(result.get(key) ?? []), item]); }
    return result;
  }, [updates, mode]);
  return <div className="yomi-workspace">
    <div className="yomi-workspace-head"><div><h1>Updates</h1><p>{mode === "discovered" ? "Fresh chapters from the books you follow." : "Your chapters, ordered by publication date."}</p></div><span className="yomi-status-chip">{updates.length} chapters loaded</span></div>
    <div className="mb-5 flex flex-wrap items-center gap-3"><LibraryUpdateButton /><label className="flex items-center gap-2 text-sm text-slate-300">Update date<select aria-label="Update date" className="yomi-field" value={mode} onChange={(event) => setMode(event.target.value as UpdateDateMode)}><option value="discovered">Discovery date</option><option value="published">Publication date</option></select></label><button type="button" className="yomi-button yomi-button-secondary" onClick={() => void feed.refetch()} disabled={feed.isFetching}><RefreshCw />Refresh feed</button></div>
    {feed.isLoading && <p role="status" className="py-10 text-center text-slate-400">Loading library updates…</p>}
    {feed.isError && <div role="alert" className="yomi-surface mb-4 p-4 text-sm text-amber-200"><p>{getErrorMessage(feed.error)}</p><button type="button" className="yomi-button yomi-button-secondary mt-3" onClick={() => void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch())}>Retry updates</button></div>}
    {!feed.isLoading && !feed.isError && !updates.length && <div className="yomi-surface p-6"><h2 className="text-lg text-slate-200">No matching chapters in the loaded pages</h2><p className="mt-2 text-sm text-slate-400">Update your library to fetch chapters from its sources. Older pages remain available below.</p></div>}
    <div className="space-y-9">{["Today", "Yesterday", "This Week", "Older", "Unknown Date"].map((name) => {
      const items = groups.get(name); if (!items?.length) return null;
      return <section key={name}><h2 className="yomi-section-label">{name}</h2><div className="yomi-surface">{items.map((item) => {
        const cover = item.manga.thumbnailUrl ? /^https?:\/\//i.test(item.manga.thumbnailUrl) ? item.manga.thumbnailUrl : `${backend.serverBaseUrl}${item.manga.thumbnailUrl.startsWith("/") ? "" : "/"}${item.manga.thumbnailUrl}` : "/placeholder-cover.svg";
        const time = updateTimestamp(item, mode);
        return <div key={item.id} className="yomi-surface-row"><Link to={`/manga/${item.manga.id}`} className="yomi-cover-sm" aria-label={`Details for ${item.manga.title}`}><img src={cover} alt="" className="h-full w-full object-cover" /></Link><div className="yomi-row-copy"><div className="yomi-row-overline"><strong>{mode === "discovered" ? "Discovered chapter" : "Published chapter"}</strong><span>{item.scanlator || "Library update"}</span></div><Link to={`/manga/${item.manga.id}`} className="yomi-row-title">{item.manga.title}</Link><p>{item.name}</p><small>{time && time > 0 ? formatChapterDate(String(time)) : "Unknown Date"}</small></div><div className="yomi-row-actions"><Link to={`/reader/${item.id}`} className="yomi-icon-button" aria-label={`Read ${item.name}`}><Play className="h-4 w-4 fill-current" /></Link><Link to={`/manga/${item.manga.id}`} className="yomi-icon-button hidden sm:inline-grid" aria-label={`Manga details for ${item.name}`}><BookOpen className="h-4 w-4" /></Link></div></div>;
      })}</div></section>;
    })}</div>
    {feed.hasNextPage && <button type="button" className="yomi-button yomi-button-secondary mt-6" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{feed.isFetchingNextPage ? "Loading older chapters…" : "Load older chapters"}</button>}
    {!feed.hasNextPage && updates.length > 0 && <p className="mt-5 text-sm text-slate-400">All matching server pages loaded.</p>}
  </div>;
}
