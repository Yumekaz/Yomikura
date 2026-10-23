import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pin, Search, SlidersHorizontal } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { FetchSourceMangaType, type FetchSourceMangaMutation } from "../../api/graphql/generated/graphql";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { classifySourceProblem } from "../../api/suwayomi/errors";
import { resolveBackendUrl } from "../../api/suwayomi/pageUrls";
import { SourceRecoveryPanel } from "../../components/source/SourceRecoveryPanel";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { activeCatalogFilterCount, buildCatalogFilterModel, CatalogFilterError, catalogFilterChanges, normalizeCatalogFilters, restoreCatalogFilters, serializeCatalogFilters, type FilterValues } from "./catalogFilters";
import { CatalogFilterForm } from "./CatalogFilterForm";
import { buildSourceBrowsePath, readSourceBrowseQuery } from "./sourceBrowseRoute";

type Manga = NonNullable<FetchSourceMangaMutation["fetchSourceManga"]>["mangas"][number];
function MangaCard({ manga, serverBaseUrl }: { manga: Manga; serverBaseUrl: string }) {
  const thumbnail = manga.thumbnailUrl ? resolveBackendUrl(serverBaseUrl, manga.thumbnailUrl) : undefined;
  return <Link to={`/manga/${manga.id}`} aria-label={manga.title} className="group relative flex flex-col gap-2">
    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-ink-900 shadow-md"><img src={thumbnail || "/placeholder-cover.svg"} alt={manga.title} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /><div className="absolute inset-0 bg-black/10 transition duration-200 group-hover:bg-black/0" /></div>
    <span className="line-clamp-2 text-xs font-semibold leading-snug text-slate-200 transition-colors group-hover:text-yomi-mint">{manga.title}</span>
  </Link>;
}

export default function SourceBrowsePage() {
  const { sourceId = "" } = useParams<{ sourceId: string }>();
  const [params] = useSearchParams(); const navigate = useNavigate();
  const query = readSourceBrowseQuery(params); const rawFilters = params.get("filters");
  const { serverBaseUrl, mockMode, savedSearches, addSavedSearch } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live"), [backend]);
  const { notify, requestText } = useFeedback();
  const [input, setInput] = useState(query);
  const [listing, setListing] = useState<"popular" | "latest">("popular");
  const [editor, setEditor] = useState<{ signature: string; values: FilterValues }>();
  const client = useQueryClient();
  useEffect(() => { setInput(query); }, [query, sourceId]);
  useEffect(() => { setEditor(undefined); }, [sourceId, rawFilters]);
  const sources = useQuery({ queryKey: ["sources", backend.key], queryFn: () => sdk.GetSources(), enabled: !!sourceId });
  const metadataKey = ["source-filters", backend.key, sourceId];
  const metadata = useQuery({ queryKey: metadataKey, queryFn: async () => {
    const data = await sdk.GetSourceFilters({ id: sourceId });
    if (String(data.source.id) !== sourceId) throw new CatalogFilterError("The filter definitions belong to another source. Reload this source before applying filters.");
    return data;
  }, enabled: !!sourceId, retry: false, refetchOnWindowFocus: false });
  const source = sources.data?.sources.nodes.find((item) => String(item.id) === sourceId);
  const sourceName = source?.name ?? metadata.data?.source.name ?? "Browse Source";
  const model = useMemo(() => metadata.data && String(metadata.data.source.id) === sourceId ? buildCatalogFilterModel(sourceId, normalizeCatalogFilters(metadata.data.source.filters), metadata.data.aboutServer?.version) : undefined, [metadata.data, sourceId]);
  const hasEnvelope = !!rawFilters && rawFilters !== "{}";
  const restored = useMemo(() => {
    if (!hasEnvelope) return { values: model?.defaults, error: "", serialized: "{}" };
    if (!model) return { values: undefined, error: metadata.isError ? "Saved filters could not be checked. Retry loading the filters or clear them before searching." : "", serialized: rawFilters! };
    try {
      if (!model.controls.length) throw new Error("This source exposes no supported filter choices. Clear the saved filters before searching.");
      const values = restoreCatalogFilters(model, rawFilters);
      return { values, error: "", serialized: serializeCatalogFilters(model, values) };
    } catch (error) { return { values: undefined, error: error instanceof Error ? error.message : "Saved filters need review.", serialized: rawFilters! }; }
  }, [hasEnvelope, rawFilters, model, metadata.isError]);
  const activeCount = model && restored.values ? activeCatalogFilterCount(model, restored.values) : 0;
  const type = query.trim() || hasEnvelope ? FetchSourceMangaType.Search : listing === "latest" && source?.supportsLatest ? FetchSourceMangaType.Latest : FetchSourceMangaType.Popular;
  const scope = JSON.stringify([backend.key, sourceId, query, rawFilters, type]);
  const [pagination, setPagination] = useState({ scope, page: 1 });
  const page = pagination.scope === scope ? pagination.page : 1;
  useEffect(() => { setPagination({ scope, page: 1 }); }, [scope]);
  const ready = !!sourceId && (!hasEnvelope || !!model && !!restored.values && !restored.error);
  const catalog = useQuery({
    queryKey: ["source-browse", scope, page], enabled: ready, retry: false,
    queryFn: async ({ signal }) => {
      const requestSdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal }, backend.isDemo ? "demo" : "live");
      let filters;
      if (hasEnvelope) {
        const checked = await requestSdk.GetSourceFilters({ id: sourceId });
        if (String(checked.source.id) !== sourceId) throw new CatalogFilterError("The filter definitions belong to another source. Reload this source before applying filters.");
        client.setQueryData(metadataKey, checked);
        const current = buildCatalogFilterModel(sourceId, normalizeCatalogFilters(checked.source.filters), checked.aboutServer?.version);
        filters = catalogFilterChanges(current, restoreCatalogFilters(current, rawFilters));
      }
      return requestSdk.FetchSourceManga({ input: { source: sourceId, page, type, query: type === FetchSourceMangaType.Search ? query.trim() : undefined,
        ...(filters ? { filters } : {}),
      } });
    },
  });
  const openFilters = () => {
    if (model) setEditor({ signature: model.signature, values: { ...(restored.values ?? model.defaults) } }); else void metadata.refetch();
  };
  const apply = (serialized: string) => { setEditor(undefined); setPagination({ scope, page: 1 }); if (page === 1 && input === query && serialized === rawFilters && ready) void catalog.refetch(); navigate(buildSourceBrowsePath(sourceId, input, serialized)); };
  const clear = () => { setEditor(undefined); setPagination({ scope, page: 1 }); navigate(buildSourceBrowsePath(sourceId, query)); };
  const isPinned = savedSearches.some((saved) => saved.sourceId === sourceId && saved.query === query && (saved.filters || "{}") === restored.serialized);
  const pin = async () => {
    const name = await requestText({ title: "Save this search", detail: "Give this source search a short, recognizable name.", initialValue: `${sourceName} — ${query || "Filtered search"}`, confirmLabel: "Save search" });
    if (name?.trim()) { addSavedSearch(name, sourceId, query, restored.serialized); notify("Search pinned to Browse.", "success"); }
  };
  const payload = catalog.data?.fetchSourceManga;
  const filterError = restored.error || (catalog.error instanceof CatalogFilterError ? catalog.error.message : "");
  const mangas = payload?.mangas ?? [];
  const problem = catalog.isError ? classifySourceProblem(catalog.error) : null;
  const changePage = (next: number) => { setPagination({ scope, page: next }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return <div className="min-h-screen bg-transparent pb-24">
    <div className="z-20 mb-6 border-b border-white/5 bg-ink-950/40 px-4 py-4 backdrop-blur-xl sm:px-6 lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Link to="/browse" aria-label="Back to sources" className="rounded-full p-2 text-slate-300 hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Link><h1 className="truncate text-xl font-bold text-white">{sourceName}</h1></div>
          {(query.trim() || hasEnvelope) && <button type="button" disabled={isPinned || !ready} onClick={() => void pin()} className="yomi-button yomi-button-secondary shrink-0"><Pin />{isPinned ? "Pinned" : "Pin Search"}</button>}
        </div>
        <form className="flex gap-2" onSubmit={(event) => {
          event.preventDefault(); setPagination({ scope, page: 1 });
          const nextFilters = hasEnvelope ? restored.serialized : undefined;
          if (page === 1 && input === query && nextFilters === (rawFilters ?? undefined) && ready) void catalog.refetch();
          navigate(buildSourceBrowsePath(sourceId, input, nextFilters));
        }}><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input aria-label="Search manga in source" placeholder="Search manga in source..." className="yomi-field w-full pl-10" value={input} onChange={(event) => setInput(event.target.value)} /></label><button type="submit" className="yomi-button yomi-button-secondary">Search</button></form>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={metadata.isLoading || !!model && !model.nodes.length} aria-expanded={!!editor} onClick={() => editor ? setEditor(undefined) : openFilters()} className="yomi-button yomi-button-secondary"><SlidersHorizontal />{metadata.isError ? "Retry filters" : hasEnvelope ? `Filters applied${activeCount ? ` (${activeCount})` : ""}` : "Filters"}</button>
          {hasEnvelope && <button type="button" onClick={clear} className="text-xs text-yomi-jade underline">Clear filters</button>}
          {model && !model.nodes.length && <span className="text-xs text-slate-400">This source has no catalog filters.</span>}
          {source?.supportsLatest && !query.trim() && !hasEnvelope && <>{(["popular", "latest"] as const).map((item) => <button type="button" key={item} onClick={() => { setListing(item); setPagination({ scope, page: 1 }); }} aria-pressed={listing === item} className={`yomi-button ${listing === item ? "yomi-button-primary" : "yomi-button-secondary"}`}>{item === "popular" ? "Popular" : "Latest"}</button>)}</>}
        </div>
        {editor && model && <>{editor.signature !== model.signature && <p role="status" className="text-xs text-amber-200">The available filters changed. Review the provided defaults before applying.</p>}<CatalogFilterForm key={`${sourceId}:${model.signature}`} model={model} initialValues={editor.signature === model.signature ? editor.values : model.defaults} onApply={apply} onCancel={() => setEditor(undefined)} /></>}
      </div>
    </div>
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {filterError ? <div role="alert" className="space-y-3 rounded-xl border border-amber-200/20 bg-ink-900 p-5"><h2 className="font-semibold text-slate-200">Saved filters need review</h2><p className="text-sm text-slate-400">{filterError}</p><div className="flex flex-wrap gap-3"><button type="button" onClick={openFilters} className="yomi-button yomi-button-secondary">{model ? "Review filters" : "Retry filters"}</button><button type="button" onClick={clear} className="yomi-button yomi-button-secondary">Reset filters</button></div></div>
        : !ready || catalog.isPending ? <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-yomi-jade" /></div>
        : catalog.isError ? <SourceRecoveryPanel problem={problem} sourceName={sourceName} searchedTitle={query || null} onRetry={() => void catalog.refetch()} />
        : !mangas.length ? <SourceRecoveryPanel title="No results from this source." detail="The source returned no titles for this query and its applied filters. Adjust the search or try another installed source." sourceName={sourceName} searchedTitle={query || null} onRetry={() => void catalog.refetch()} />
        : <div className="space-y-8"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{mangas.map((manga) => <MangaCard key={manga.id} manga={manga} serverBaseUrl={backend.serverBaseUrl} />)}</div>
          <div className="flex items-center justify-center gap-4 border-t border-white/5 pt-6">{page > 1 && <button type="button" onClick={() => changePage(page - 1)} className="yomi-button yomi-button-secondary">Previous Page</button>}{payload?.hasNextPage && <button type="button" onClick={() => changePage(page + 1)} className="yomi-button yomi-button-primary">Next Page</button>}</div>
        </div>}
    </div>
  </div>;
}
