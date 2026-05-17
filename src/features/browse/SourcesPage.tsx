import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Globe } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";

export default function SourcesPage() {
  const { serverBaseUrl } = useSettingsStore();
  
  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sources", serverBaseUrl],
    queryFn: () => sdk.GetSources(),
    enabled: !!serverBaseUrl,
  });

  const sources = useMemo(() => {
    return data?.sources?.edges?.map(e => e?.node).filter((n): n is NonNullable<typeof n> => n != null) || [];
  }, [data]);

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
        <p className="mt-2 text-sm">Install extensions via the Suwayomi Web UI.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white">Browse Sources</h1>
      
      {Object.entries(groupedSources).sort(([a], [b]) => a.localeCompare(b)).map(([lang, langSources]) => (
        <div key={lang} className="space-y-4">
          <h2 className="text-sm font-semibold text-yomi-jade uppercase tracking-wider border-b border-white/10 pb-2">
            {lang === "all" ? "Multi-Language" : lang}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {langSources.map((source) => (
              <Link 
                key={String(source.id)} 
                to={`/browse/${source.id}`}
                className="flex items-center gap-4 rounded-xl bg-white/5 p-4 transition-colors hover:bg-white/10"
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
                    />
                  ) : (
                    <Globe className="h-5 w-5 text-slate-500" />
                  )}
                </div>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <span className="font-medium text-slate-200 truncate">{source.name}</span>
                  {source.supportsLatest && (
                    <span className="text-xs text-yomi-jade">Supports Latest</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
