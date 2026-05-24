import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, ArrowLeft, Globe, HelpCircle } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";

// Compact MangaCard for horizontal scrolling lists
function MangaCard({ manga, serverBaseUrl }: { manga: any; serverBaseUrl: string }) {
  const thumbnailUrl = manga.thumbnailUrl
    ? manga.thumbnailUrl.startsWith("http")
      ? manga.thumbnailUrl
      : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl}`
    : undefined;

  return (
    <Link to={`/manga/${manga.id}`} className="group flex-shrink-0 w-28 sm:w-32 flex flex-col gap-1.5">
      <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-ink-900 shadow-md border border-white/5 relative">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={manga.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500 bg-ink-900">
            No Cover
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
      <div className="flex flex-col px-0.5">
        <span className="line-clamp-2 text-xs font-semibold text-slate-200 group-hover:text-yomi-jade transition-colors leading-tight">
          {manga.title}
        </span>
        {manga.inLibrary && (
          <span className="mt-1 inline-flex w-fit items-center rounded bg-yomi-jade/10 border border-yomi-jade/20 px-1 py-0.5 text-[9px] font-bold text-yomi-jade">
            In Library
          </span>
        )}
      </div>
    </Link>
  );
}

// Single Source Search Result Row (Queries independently in parallel)
export function GlobalSourceSearchResults({ 
  source, 
  query, 
  serverBaseUrl, 
  sdk 
}: { 
  source: any; 
  query: string; 
  serverBaseUrl: string; 
  sdk: any;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["global-search", source.id, query, serverBaseUrl],
    queryFn: () => sdk.FetchSourceManga({
      input: {
        source: String(source.id),
        page: 1,
        type: "SEARCH" as any,
        query: query,
      }
    }),
    enabled: !!query && !!source.id,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!query) return null;

  const results = data?.fetchSourceManga?.mangas || [];

  if (isLoading) {
    return (
      <div className="space-y-3 py-3 border-b border-white/5 last:border-0">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-spin rounded-full border border-yomi-jade border-t-transparent" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{source.name}</span>
          <span className="text-[9px] text-slate-500 uppercase px-1.5 py-0.5 rounded bg-white/5 font-bold">
            {source.lang === "localsourcelang" ? "Local" : source.lang.toUpperCase()}
          </span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-28 sm:w-32 shrink-0 space-y-2">
              <div className="aspect-[2/3] w-full rounded-lg bg-white/5 animate-pulse border border-white/5" />
              <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || results.length === 0) {
    return null; // Keep search results screen tidy by hiding sources with zero matches
  }

  return (
    <div className="space-y-3 py-4 border-b border-white/5 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-200">{source.name}</span>
          <span className="text-[9px] text-yomi-mint font-bold uppercase px-1.5 py-0.5 rounded bg-white/5">
            {source.lang === "localsourcelang" ? "Local" : source.lang.toUpperCase()}
          </span>
        </div>
        <Link
          to={`/browse/${source.id}?search=${encodeURIComponent(query)}`}
          className="text-xs text-yomi-jade hover:underline font-semibold"
        >
          Show all
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
        {results.map((manga: any) => (
          <MangaCard key={manga.id} manga={manga} serverBaseUrl={serverBaseUrl} />
        ))}
      </div>
    </div>
  );
}

export default function GlobalSearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { serverBaseUrl } = useSettingsStore();
  const urlQuery = searchParams.get("q") || "";

  const [searchInput, setSearchInput] = useState(urlQuery);
  const [activeQuery, setActiveQuery] = useState(urlQuery);

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Discover all sources language-wise (bypasses server configuration enabled filter)
  const { data: extData } = useQuery({
    queryKey: ["installed-ext-langs", serverBaseUrl],
    queryFn: () => sdk.GetInstalledExtensionLangs(),
    enabled: !!serverBaseUrl,
  });

  const installedLangs = useMemo(() => {
    if (!extData?.extensions?.nodes) return [];
    const langs = new Set<string>();
    extData.extensions.nodes.forEach((extension) => {
      if (extension?.lang) langs.add(extension.lang);
    });
    langs.add("localsourcelang");
    langs.add("en");
    return Array.from(langs);
  }, [extData]);

  const { data: sources, isLoading: loadingSources } = useQuery({
    queryKey: ["all-sources", serverBaseUrl, installedLangs],
    queryFn: async () => {
      const results = await Promise.all(
        installedLangs.map((lang) => sdk.GetSourcesByCondition({ lang }))
      );
      const seen = new Set<string>();
      const allSources: Array<{
        id: string;
        name: string;
        lang: string;
        iconUrl: string;
        supportsLatest: boolean;
        isNsfw?: boolean;
      }> = [];
      for (const result of results) {
        for (const source of result.sources?.nodes || []) {
          if (source && !seen.has(String(source.id))) {
            seen.add(String(source.id));
            allSources.push(source as any);
          }
        }
      }
      return allSources.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!serverBaseUrl && installedLangs.length > 0,
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const queryTrimmed = searchInput.trim();
    setActiveQuery(queryTrimmed);
    setSearchParams(queryTrimmed ? { q: queryTrimmed } : {});
  };

  useEffect(() => {
    setSearchInput(urlQuery);
    setActiveQuery(urlQuery);
  }, [urlQuery]);

  return (
    <div className="min-h-screen bg-ink-950 pb-24 text-slate-100">
      {/* Top Sticky Header */}
      <div className="sticky top-0 z-20 bg-ink-950/90 backdrop-blur-md border-b border-white/5 px-4 py-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/browse")}
              className="rounded-full p-2 hover:bg-white/10 text-slate-300 transition"
              title="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Global Search</h1>
              <p className="text-xs text-slate-400 mt-0.5">Search across all installed extensions</p>
            </div>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-md w-full">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search manga title globally..."
                className="w-full rounded-lg bg-ink-900 border border-white/5 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:border-yomi-jade/50 focus:outline-none transition"
              />
              <Search className="absolute left-3.5 top-2.5 h-4.5 w-4.5 text-slate-500" />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-yomi-jade px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-yomi-jade/90 transition shadow-md"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Main Results Container */}
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {!activeQuery && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Search className="h-12 w-12 stroke-[1.5] text-slate-600 mb-4 animate-pulse" />
            <p className="font-semibold text-sm text-slate-400">Search for titles globally</p>
            <p className="text-xs text-slate-600 mt-1.5 max-w-sm text-center">
              Enter a search query above. Yomikura will query all of your installed extensions concurrently.
            </p>
          </div>
        )}

        {activeQuery && (loadingSources) && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-yomi-jade mb-3" />
            <span className="text-sm">Discovering installed sources...</span>
          </div>
        )}

        {activeQuery && sources && sources.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center">
            <Globe className="h-12 w-12 text-slate-600 mb-4 opacity-50" />
            <p className="font-semibold">No Sources Installed</p>
            <p className="text-sm text-slate-600 mt-1 max-w-xs">
              Go to the <Link to="/extensions" className="text-yomi-jade hover:underline">Extensions</Link> tab to install source extensions first.
            </p>
          </div>
        )}

        {activeQuery && sources && sources.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-white/5 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Globe className="h-4 w-4 text-yomi-jade" />
              <span>Querying {sources.length} sources for "{activeQuery}"</span>
            </div>

            <div className="divide-y divide-white/5">
              {sources.map((source) => (
                <GlobalSourceSearchResults
                  key={source.id}
                  source={source}
                  query={activeQuery}
                  serverBaseUrl={serverBaseUrl}
                  sdk={sdk}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
