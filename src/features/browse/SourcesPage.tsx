import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Globe, Settings, Pin, X, Compass, Puzzle, RadioTower, Search } from "lucide-react";
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
      <div className="yomi-workspace flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="yomi-workspace"><div className="yomi-route-empty"><div><Globe /><h2>Sources could not load</h2><p>Reconnect your local engine and try again.</p></div></div></div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="yomi-workspace"><div className="yomi-route-empty"><div><Compass /><h2>No sources installed</h2><p>Install an extension first. It will appear here as a source you can browse or search.</p><Link to="/browse/extensions" className="yomi-button yomi-button-primary mt-5">Open extensions</Link></div></div></div>
    );
  }

  return (
    <div className="yomi-workspace space-y-9 select-none">
      <div className="yomi-workspace-head">
        <div><span className="yomi-eyebrow">Discover</span><h1 className="yomi-workspace-title"><Compass />Sources</h1><p className="yomi-workspace-subtitle">Choose where to discover your next series. Installed sources remain local to this device and server.</p></div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to="/browse/search" className="yomi-button yomi-button-primary"><Search />Search all</Link>
          <Link to="/browse/extensions" className="yomi-button yomi-button-secondary"><Puzzle />Extensions</Link>
          <Link to="/browse/extension-repos" className="yomi-icon-button" aria-label="Manage extension repositories" title="Extension repositories"><RadioTower /></Link>
        </div>
      </div>

      {/* Pinned Catalog Searches Section */}
      {savedSearches && savedSearches.length > 0 && (
        <div className="space-y-4">
          <h2 className="yomi-section-label">
            <Pin className="h-3.5 w-3.5" />
            Pinned Searches
          </h2>
          <div className="yomi-catalog">
            {savedSearches.map((s) => (
              <div 
                key={s.id} 
                className="yomi-catalog-item"
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
                  className="yomi-utility-button danger"
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
          <h2 className="yomi-section-label">
            {lang === "localsourcelang" ? "Local" : lang === "all" ? "Multi-Language" : lang.toUpperCase()}
          </h2>
          <div className="yomi-catalog">
            {langSources.map((source) => (
              <div 
                key={String(source.id)} 
                className="yomi-catalog-item"
              >
                <Link 
                  to={`/browse/${source.id}`}
                  className="flex items-center gap-4 flex-1 overflow-hidden"
                >
                  <div className="yomi-catalog-icon">
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
                  <div className="yomi-catalog-copy">
                    <strong>{source.name}</strong>
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
                    className="yomi-utility-button"
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
