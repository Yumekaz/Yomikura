import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Loader2, ArrowLeft } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { FetchSourceMangaType } from "../../api/graphql/generated/graphql";

function MangaCard({ manga, serverBaseUrl }: { manga: any; serverBaseUrl: string }) {
  const thumbnailUrl = manga.thumbnailUrl
    ? manga.thumbnailUrl.startsWith("http")
      ? manga.thumbnailUrl
      : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl}`
    : undefined;

  return (
    <Link to={`/manga/${manga.id}`} className="group relative flex flex-col gap-2">
      <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-ink-900 shadow-md">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={manga.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500">No Image</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
      <div className="flex flex-col px-1">
        <span className="line-clamp-2 text-sm font-medium text-slate-200 group-hover:text-yomi-jade transition-colors">
          {manga.title}
        </span>
        {manga.inLibrary && (
          <span className="mt-1 inline-flex w-fit items-center rounded bg-yomi-jade/20 px-1.5 py-0.5 text-[10px] font-medium text-yomi-jade">
            In Library
          </span>
        )}
      </div>
    </Link>
  );
}

export default function SourceBrowsePage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const { serverBaseUrl } = useSettingsStore();
  
  const [searchInput, setSearchInput] = useState("");
  const [currentQuery, setCurrentQuery] = useState("");
  const [page, setPage] = useState(1);

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
    const edges = sourcesData.sources?.edges || [];
    for (const e of edges) {
      if (e?.node?.id === sourceId) return e.node.name;
    }
    return "Browse Source";
  }, [sourcesData, sourceId]);

  const { mutate: fetchManga, data: mangaData, isPending, isError } = useMutation({
    mutationFn: (pageNum: number) => {
      const type = currentQuery.trim() ? FetchSourceMangaType.Search : FetchSourceMangaType.Popular;
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
  }, [sourceId, serverBaseUrl, currentQuery, fetchManga]);

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

  const payload = mangaData?.fetchSourceManga;
  const mangas = payload?.mangas || [];
  const hasNextPage = payload?.hasNextPage || false;

  return (
    <div className="min-h-screen bg-ink-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-ink-950/90 backdrop-blur-md border-b border-white/5 px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Link to="/browse" className="rounded-full p-2 hover:bg-white/10 text-slate-300">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-bold text-white truncate">{sourceName}</h1>
          </div>

          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search manga in source..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-full bg-ink-900 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yomi-jade/50"
            />
          </form>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {isPending ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
          </div>
        ) : isError ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-slate-400">
            <p>Failed to load manga from this source.</p>
            <button onClick={() => fetchManga(page)} className="mt-2 text-sm text-yomi-jade hover:underline">
              Retry
            </button>
          </div>
        ) : mangas.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-slate-400">
            <p>No results found.</p>
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
