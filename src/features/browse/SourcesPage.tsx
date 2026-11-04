import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, Globe, Settings, Pin, PinOff, X, Compass, Puzzle, RadioTower, Search } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { fetchAllSources } from "../../api/library/fetchAllSources";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { buildSourceBrowsePath } from "./sourceBrowseRoute";
import { groupReadingSources, type SourceSummary } from "./sourceGroups";

export default function SourcesPage() {
  const { serverBaseUrl, mockMode, savedSearches, deleteSavedSearch, experience, toggleSourcePin, showNsfw } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live"), [backend]);
  const sourcesQuery = useQuery({ queryKey: ["sources", backend.key], queryFn: ({ signal }) => fetchAllSources(sdk, signal) });
  const sources = (sourcesQuery.data?.sources.nodes ?? []).filter((source) => source.extension?.isInstalled !== false && (!experience.applyContentFilterToInstalled || showNsfw || !source.isNsfw));
  const pins = experience.sourcePins[backend.key] ?? [];
  const groups = groupReadingSources(sources, pins, experience.recentSources[backend.key] ?? []);
  const sourceRows = (items: SourceSummary[]) => <div className="yomi-catalog yomi-source-catalog">{items.map((source) => {
    const id = String(source.id), pinned = pins.includes(id);
    const icon = source.iconUrl ? source.iconUrl.startsWith("http") ? source.iconUrl : `${backend.serverBaseUrl}${source.iconUrl.startsWith("/") ? "" : "/"}${source.iconUrl}` : undefined;
    return <div key={id} className="yomi-catalog-item">
      <Link to={`/browse/${id}`} className="flex min-w-0 flex-1 items-center gap-4" aria-label={`Browse ${source.name}`}>
        <div className="yomi-catalog-icon">{icon ? <img src={icon} alt="" className="h-full w-full object-cover" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Globe aria-hidden="true" />}</div>
        <div className="yomi-catalog-copy"><strong>{source.name}</strong><small>{source.lang === "localsourcelang" ? "Your local books" : source.lang === "all" ? "Multiple languages" : source.lang.toUpperCase()}</small></div>
      </Link>
      {source.supportsLatest && <Link className="yomi-utility-button yomi-source-latest" to={`/browse/${id}?listing=latest`} aria-label={`Latest from ${source.name}`}>Latest</Link>}
      {source.isConfigurable && <Link to={`/browse/source/${id}/settings`} className="yomi-utility-button" aria-label={`Preferences for ${source.name}`}><Settings aria-hidden="true" /></Link>}
      <button type="button" className={`yomi-utility-button ${pinned ? "is-pinned" : ""}`} aria-pressed={pinned} aria-label={`${pinned ? "Unpin" : "Pin"} ${source.name}`} onClick={() => toggleSourcePin(backend.key, id)}>{pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}</button>
    </div>;
  })}</div>;
  if (sourcesQuery.isPending) return <div className="yomi-workspace flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading sources"><Loader2 className="h-8 w-8 animate-spin text-yomi-jade" /></div>;
  if (sourcesQuery.isError) return <div className="yomi-workspace"><div className="yomi-route-empty"><Globe aria-hidden="true" /><h2>Sources could not load</h2><p>Check your library connection and try again.</p><button className="yomi-button yomi-button-primary" onClick={() => void sourcesQuery.refetch()}>Try again</button><Link className="yomi-button yomi-button-secondary" to="/settings/connection">Connection settings</Link></div></div>;
  return <div className="yomi-workspace space-y-9">
    <header className="yomi-workspace-head"><div><h1>Discover</h1><p>Find your next story in the places you love.</p></div><div className="flex flex-wrap items-center justify-end gap-2">
      <Link to="/browse/search" className="yomi-button yomi-button-primary"><Search aria-hidden="true" />Search all</Link>
      <Link to="/browse/extensions" className="yomi-button yomi-button-secondary"><Puzzle aria-hidden="true" />Add sources</Link>
      <Link to="/browse/extension-repos" className="yomi-icon-button" aria-label="Manage extension repositories"><RadioTower aria-hidden="true" /></Link>
      <Link to="/settings/browse" className="yomi-icon-button" aria-label="Browsing preferences"><Settings aria-hidden="true" /></Link>
    </div></header>
    {sources.length > 0 && sources.every((source) => source.lang === "localsourcelang") && <div className="yomi-discover-guide"><BookOpen aria-hidden="true" /><div><h2>Bring your bookshelf along</h2><p>Open your own comic archives, or add a reading source to discover more books.</p></div><Link className="yomi-button yomi-button-secondary" to="/settings/advanced">Import options</Link></div>}
    {groups.lastUsed.length > 0 && <section aria-label="Last used source"><h2 className="yomi-section-label mb-4">Last used</h2>{sourceRows(groups.lastUsed)}</section>}
    {groups.pinned.length > 0 && <section aria-label="Pinned sources"><h2 className="yomi-section-label mb-4">Pinned sources</h2>{sourceRows(groups.pinned)}</section>}
    {savedSearches.length > 0 && <section aria-label="Pinned searches"><h2 className="yomi-section-label mb-4">Pinned searches</h2><div className="yomi-catalog">{savedSearches.map((search) => <div key={search.id} className="yomi-catalog-item"><Link to={buildSourceBrowsePath(search.sourceId, search.query, search.filters)} className="flex min-w-0 flex-1 items-center gap-3"><Pin className="h-4 w-4 shrink-0 text-yomi-jade" aria-hidden="true" /><div className="yomi-catalog-copy"><strong>{search.name}</strong><small>{search.query ? `“${search.query}”` : "Filtered search"}</small></div></Link><button className="yomi-utility-button danger" aria-label={`Remove pinned search ${search.name}`} onClick={() => deleteSavedSearch(search.id)}><X aria-hidden="true" /></button></div>)}</div></section>}
    {groups.languages.map(({ language, items }) => <section key={language} aria-label={`${language} sources`}><h2 className="yomi-section-label mb-4">{language === "localsourcelang" ? "Local" : language === "all" ? "Multiple languages" : language.toUpperCase()}</h2>{sourceRows(items)}</section>)}
    {sources.length === 0 && <div className="yomi-route-empty"><Compass aria-hidden="true" /><h2>No sources to show</h2><p>{experience.applyContentFilterToInstalled ? "Review your browsing preferences or add another reading source." : "Add a source to discover your first story."}</p><Link className="yomi-button yomi-button-primary" to="/browse/extensions">Open extensions</Link></div>}
  </div>;
}
