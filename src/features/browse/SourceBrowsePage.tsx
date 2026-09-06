import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Loader2, ArrowLeft, Pin } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { FetchSourceMangaType } from "../../api/graphql/generated/graphql";
import { classifySourceProblem } from "../../api/suwayomi/errors";
import { SourceRecoveryPanel } from "../../components/source/SourceRecoveryPanel";
import { useFeedback } from "../../components/ui/FeedbackProvider";

interface MangaCardProps {
  manga: any;
  serverBaseUrl: string;
}

function MangaCard({ manga, serverBaseUrl }: MangaCardProps) {
  const thumbnailUrl = manga.thumbnailUrl
    ? manga.thumbnailUrl.startsWith("http")
      ? manga.thumbnailUrl
      : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl}`
    : undefined;

  return (
    <Link to={`/manga/${manga.id}`} className="group relative flex flex-col gap-2">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-ink-900 shadow-md">
        <img
          src={thumbnailUrl || "/placeholder-cover.svg"}
          alt={manga.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition duration-200" />
      </div>
      <span className="text-xs font-semibold text-slate-200 line-clamp-2 leading-snug group-hover:text-yomi-mint transition-colors">
        {manga.title}
      </span>
    </Link>
  );
}

export default function SourceBrowsePage() {
  const { notify, requestText } = useFeedback();
  const { sourceId } = useParams<{ sourceId: string }>();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get("query") || "";

  const { serverBaseUrl, addSavedSearch, savedSearches } = useSettingsStore();

  const [searchInput, setSearchInput] = useState(urlQuery);
  const [currentQuery, setCurrentQuery] = useState(urlQuery);
  const [page, setPage] = useState(1);

  // Sync if query param changes
  useEffect(() => {
    setSearchInput(urlQuery);
    setCurrentQuery(urlQuery);
    setPage(1);
  }, [urlQuery]);

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Query to get source info
  const { data: sourcesData } = useQuery({
    queryKey: ["sources", serverBaseUrl],
    queryFn: () => sdk.GetSources(),
    enabled: !!serverBaseUrl,
  });

  const sourceName = useMemo(() => {
    if (!sourcesData || !sourceId) return "Browse Source";
    const sources = sourcesData.sources?.nodes || [];
    for (const source of sources) {
      if (String(source?.id) === sourceId) return source.name;
    }
    return "Browse Source";
  }, [sourcesData, sourceId]);

  const supportsLatest = useMemo(() => {
    if (!sourcesData || !sourceId) return false;
    const sources = sourcesData.sources?.nodes || [];
    const src = sources.find((s) => String(s?.id) === sourceId);
    return src?.supportsLatest ?? false;
  }, [sourcesData, sourceId]);

  const [listingType, setListingType] = useState<"popular" | "latest">("popular");

  const { mutate: fetchManga, data: mangaData, isPending, isError, error: fetchError } = useMutation({
    mutationFn: (pageNum: number) => {
      const type = currentQuery.trim() 
        ? FetchSourceMangaType.Search 
        : (listingType === "latest" ? FetchSourceMangaType.Latest : FetchSourceMangaType.Popular);
      return sdk.FetchSourceManga({
        input: {
          source: sourceId!,
          page: pageNum,
          type,
          query: currentQuery.trim() || undefined,
        }
      });
    }
  });

  useEffect(() => {
    if (sourceId && serverBaseUrl) {
      fetchManga(1);
    }
  }, [sourceId, serverBaseUrl, currentQuery, listingType, fetchManga]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setCurrentQuery(searchInput);
  };

  const handleNextPage = () => {
    const next = page + 1;
    setPage(next);
    fetchManga(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePinSearch = useCallback(async () => {
    if (!currentQuery.trim() || !sourceId) return;
    const name = await requestText({ title: "Save this search", detail: "Give this source search a short, recognizable name.", initialValue: `${sourceName} — ${currentQuery}`, confirmLabel: "Save search" });
    if (name && name.trim()) {
      addSavedSearch(name, sourceId, currentQuery, "{}");
      notify("Search pinned to Browse.", "success");
    }
  }, [currentQuery, sourceId, sourceName, addSavedSearch, notify, requestText]);

  const payload = mangaData?.fetchSourceManga;
  const mangas = payload?.mangas || [];
  const hasNextPage = payload?.hasNextPage || false;
  const sourceProblem = isError ? classifySourceProblem(fetchError) : null;

  const isPinned = useMemo(() => {
    return savedSearches.some(s => s.sourceId === sourceId && s.query === currentQuery);
  }, [savedSearches, sourceId, currentQuery]);

  return (
    <div className="min-h-screen bg-transparent pb-24 select-none">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-ink-950/40 backdrop-blur-xl border-b border-white/5 px-4 py-4 sm:px-6 mb-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/browse" className="rounded-full p-2 hover:bg-white/10 text-slate-300">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-xl font-bold text-white truncate">{sourceName}</h1>
            </div>

            {currentQuery.trim() && (
              <button
                type="button"
                onClick={handlePinSearch}
                disabled={isPinned}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  isPinned
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-yomi-jade/10 border-yomi-jade/25 text-yomi-mint hover:bg-yomi-jade/20"
                }`}
                title={isPinned ? "Already pinned" : "Pin this search to Browse"}
              >
                <Pin className="h-3.5 w-3.5" />
                <span>{isPinned ? "Pinned" : "Pin Search"}</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3.5 top-2.5 h-4.5 w-4.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search manga in source..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-xl bg-ink-900 border border-white/10 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-yomi-jade/50 transition-[border-color,box-shadow] duration-150"
            />
          </form>

          {supportsLatest && !currentQuery.trim() && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setListingType("popular");
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  listingType === "popular"
                    ? "bg-yomi-jade/10 text-yomi-jade border-yomi-jade/20"
                    : "bg-ink-900 text-slate-400 border-white/5 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                Popular
              </button>
              <button
                type="button"
                onClick={() => {
                  setListingType("latest");
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  listingType === "latest"
                    ? "bg-yomi-jade/10 text-yomi-jade border-yomi-jade/20"
                    : "bg-ink-900 text-slate-400 border-white/5 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                Latest
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {isPending ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
          </div>
        ) : isError ? (
          <div className="flex min-h-[40vh] items-center justify-center px-2 py-8">
            <SourceRecoveryPanel
              problem={sourceProblem}
              sourceName={sourceName}
              searchedTitle={currentQuery || null}
              onRetry={() => fetchManga(page)}
            />
          </div>
        ) : mangas.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center px-2 py-8">
            <SourceRecoveryPanel
              title="No results from this source."
              detail="The source responded, but it did not return matching titles. Try another installed source before assuming the manga is unavailable."
              sourceName={sourceName}
              searchedTitle={currentQuery || null}
              onRetry={() => fetchManga(page)}
            />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {mangas.map((manga) => (
                <MangaCard key={manga.id} manga={manga} serverBaseUrl={serverBaseUrl} />
              ))}
            </div>

            <div className="flex items-center justify-center gap-4 border-t border-white/5 pt-6">
              {page > 1 && (
                <button
                  onClick={() => {
                    const prev = page - 1;
                    setPage(prev);
                    fetchManga(prev);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  Previous Page
                </button>
              )}
              {hasNextPage && (
                <button
                  onClick={handleNextPage}
                  className="rounded-lg bg-yomi-jade px-4 py-2 text-sm font-medium text-ink-950 hover:bg-yomi-jade/90"
                >
                  Next Page
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
