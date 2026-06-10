import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Globe, Settings, Pin, X } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";

/**
 * SourcesPage - Lists all installed sources.
 */
export default function SourcesPage() {
  const { serverBaseUrl, savedSearches, deleteSavedSearch } = useSettingsStore();
  
  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Step 1: Get all installed extension languages
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

  // Step 2: Fetch sources for each language using condition
  const { data: sourcesData, isLoading, isError } = useQuery({
    queryKey: ["all-sources", serverBaseUrl, installedLangs],
    queryFn: async () => {
      const results = await Promise.all(
        installedLangs.map(lang => sdk.GetSourcesByCondition({ lang }))
      );
      const seen = new Set<string>();
      const allSources: Array<{
        id: unknown;
        name: string;
        lang: string;
        iconUrl: string;
        supportsLatest: boolean;
        isNsfw?: boolean;
        isConfigurable?: boolean;
      }> = [];
      
      for (const result of results) {
        for (const source of result.sources?.nodes || []) {
          if (source && !seen.has(String(source.id))) {
            seen.add(String(source.id));
            allSources.push(source as any);
          }
        }
      }
      return allSources;
    },
    enabled: !!serverBaseUrl && installedLangs.length > 0,
  });

  const sources = sourcesData || [];

  // Group by language
  const groupedSources = useMemo(() => {
    const groups: Record<string, typeof sources> = {};
    sources.forEach(source => {
      const lang = source.lang || "all";
      if (!groups[lang]) groups[lang] = [];
      groups[lang].push(source);
    });
    return groups;
  }, [sources]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <Globe className="mb-4 h-12 w-12 opacity-50" />
        <p>Failed to load sources.</p>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <Globe className="mb-4 h-12 w-12 opacity-50" />
        <p>No extensions installed.</p>
        <p className="mt-2 text-sm">Install extensions via the Extensions tab.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-5xl mx-auto space-y-8 select-none">
      <h1 className="text-2xl font-bold text-white">Browse Sources</h1>

      {/* Pinned Catalog Searches Section */}
      {savedSearches && savedSearches.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-yomi-jade uppercase tracking-wider border-b border-white/5 pb-2 flex items-center gap-1.5">
            <Pin className="h-3.5 w-3.5" />
            Pinned Searches
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedSearches.map((s) => (
              <div 
                key={s.id} 
                className="group relative flex items-center justify-between rounded-xl bg-yomi-jade/5 p-4 transition border border-yomi-jade/10 hover:border-yomi-jade/30"
              >
                <Link 
                  to={`/browse/${s.sourceId}?query=${encodeURIComponent(s.query)}`}
                  className="flex items-center gap-3 flex-1 overflow-hidden"
                >
                  <Pin className="h-4 w-4 text-yomi-jade shrink-0" />
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <span className="font-semibold text-slate-200 truncate text-sm">{s.name}</span>
                    <span className="text-[10px] text-slate-500 truncate">Query: "{s.query}"</span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => deleteSavedSearch(s.id)}
                  className="p-1.5 rounded bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition"
                  title="Remove Pin"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {Object.entries(groupedSources).sort(([a], [b]) => a.localeCompare(b)).map(([lang, langSources]) => (
        <div key={lang} className="space-y-4">
          <h2 className="text-xs font-bold text-yomi-jade uppercase tracking-wider border-b border-white/5 pb-2">
            {lang === "localsourcelang" ? "Local" : lang === "all" ? "Multi-Language" : lang.toUpperCase()}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {langSources.map((source) => (
              <div 
                key={String(source.id)} 
                className="group relative flex items-center justify-between rounded-xl bg-white/5 p-4 transition-colors hover:bg-white/10"
              >
                <Link 
                  to={`/browse/${source.id}`}
                  className="flex items-center gap-4 flex-1 overflow-hidden"
                >
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-ink-900 flex items-center justify-center">
                    {source.iconUrl ? (
                      <img 
                        src={source.iconUrl.startsWith("http") ? source.iconUrl : `${serverBaseUrl.replace(/\/$/, "")}${source.iconUrl}`} 
                        alt={source.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                        loading="lazy"
                      />
                    ) : (
                      <Globe className="h-5 w-5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <span className="font-semibold text-slate-200 truncate">{source.name}</span>
                    <div className="flex items-center gap-2">
                      {source.supportsLatest && (
                        <span className="text-[10px] text-yomi-jade font-semibold">Supports Latest</span>
                      )}
                    </div>
                  </div>
                </Link>
                {source.isConfigurable && (
                  <Link
                    to={`/browse/source/${source.id}/settings`}
                    className="relative z-10 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition shrink-0 ml-2"
                    title="Source Preferences"
                  >
                    <Settings className="h-4.5 w-4.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
