import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw, ServerCrash, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { LibraryFilters } from "./LibraryFilters";
import { LibraryGrid, LibraryManga } from "./LibraryGrid";
import { CategoryDialog } from "./CategoryDialog";

export default function LibraryPage() {
  const { serverBaseUrl } = useSettingsStore();
  const { cachedChapters, loadCachedChapters } = useDownloadStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | number | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);

  useEffect(() => {
    loadCachedChapters();
  }, [loadCachedChapters]);

  // Recreate SDK instance if URL changes
  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch Categories
  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ["categories", serverBaseUrl],
    queryFn: () => sdk.GetCategories(),
    enabled: !!serverBaseUrl,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch Library
  // We use the category ID for backend filtering if available.
  const {
    data: libData,
    isLoading: libLoading,
    isError: libError,
    refetch: refetchLibrary,
  } = useQuery({
    queryKey: ["library", serverBaseUrl, activeCategoryId],
    queryFn: () => {
      return sdk.GetLibrary({
        // Optional backend category filtering
        filter: { 
          inLibrary: { equalTo: true },
          ...(activeCategoryId ? { categoryId: { equalTo: activeCategoryId as number } } : {})
        },
        first: 500, // Fetch up to 500 for a solid initial load
      });
    },
    enabled: !!serverBaseUrl,
  });

  const isLoading = catLoading || libLoading;

  // Extract and format categories
  const categories = useMemo(() => {
    if (!catData?.categories?.edges) return [];
    const uniqueById = new Map<string | number, NonNullable<typeof catData.categories.edges[number]["node"]>>();
    for (const edge of catData.categories.edges) {
      const node = edge?.node;
      if (!node || uniqueById.has(node.id)) continue;
      uniqueById.set(node.id, node);
    }

    const cats = Array.from(uniqueById.values());

    return cats.sort((a, b) => (a.order || 0) - (b.order || 0)).map(cat => ({
      id: cat.id,
      name: cat.name
    }));
  }, [catData]);

  const isOfflineMode = !!(libError && cachedChapters && cachedChapters.length > 0);

  // Extract and filter mangas
  const mangas: LibraryManga[] = useMemo(() => {
    if (isOfflineMode) {
      const uniqueMangaMap = new Map<number | string, { id: number | string; title: string }>();
      for (const ch of cachedChapters) {
        if (!uniqueMangaMap.has(ch.mangaId)) {
          uniqueMangaMap.set(ch.mangaId, {
            id: ch.mangaId,
            title: ch.mangaTitle,
          });
        }
      }
      let filtered = Array.from(uniqueMangaMap.values()).map((m) => ({
        id: m.id,
        title: m.title,
        thumbnailUrl: undefined,
        unreadCount: 0,
      }));
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((m) => m.title.toLowerCase().includes(q));
      }
      return filtered;
    }

    if (!libData?.mangas?.edges) return [];

    const uniqueById = new Map<string | number, NonNullable<typeof libData.mangas.edges[number]["node"]>>();
    for (const edge of libData.mangas.edges) {
      const node = edge?.node;
      if (!node || uniqueById.has(node.id)) continue;
      uniqueById.set(node.id, node);
    }

    let filtered = Array.from(uniqueById.values());

    // Apply front-end search filter (faster than refetching for every keystroke)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((m) => m.title.toLowerCase().includes(q));
    }

    // Map to our UI type
    return filtered.map((m) => ({
      id: m.id,
      title: m.title,
      thumbnailUrl: m.thumbnailUrl,
      unreadCount: m.unreadCount,
    }));
  }, [libData, searchQuery, isOfflineMode, cachedChapters]);

  // Handle server unconnected state safely
  if (!serverBaseUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-ink-950 p-6 text-center text-slate-300">
        <ServerCrash className="mb-4 h-12 w-12 text-slate-600" />
        <p className="text-lg font-medium">Suwayomi server not configured</p>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Yomikura expects a Suwayomi-compatible server. Set the server URL in Settings.
        </p>
        <Link
          to="/settings"
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-yomi-jade px-4 text-sm font-semibold text-ink-950 transition hover:bg-yomi-jade/90"
        >
          <Settings className="h-4 w-4" />
          Open settings
        </Link>
      </div>
    );
  }

  // Handle error (only if we're not in offline mode with cached chapters)
  if (libError && !isOfflineMode) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-ink-950 p-6 text-center text-red-400">
        <ServerCrash className="mb-4 h-12 w-12 opacity-80" />
        <p className="text-lg font-medium">Suwayomi is not reachable</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-red-400/70">
          Yomikura tried {serverBaseUrl}. Start Suwayomi, then retry, or change the URL in Settings.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => refetchLibrary()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-yomi-jade px-4 text-sm font-semibold text-ink-950 transition hover:bg-yomi-jade/90"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
          <Link
            to="/settings"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/10 px-4 text-sm font-semibold text-red-200 transition hover:bg-white/5"
          >
            <Settings className="h-4 w-4" />
            Server settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-ink-950">
      {/* Filters Bar */}
      <LibraryFilters
        categories={categories}
        activeCategoryId={activeCategoryId}
        onCategorySelect={setActiveCategoryId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onManageCategories={() => setIsCategoryDialogOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {isOfflineMode && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs font-medium text-amber-200 animate-fade-in">
            Offline Mode — Showing cached titles
          </div>
        )}
        {isLoading ? (
          <div className="flex min-h-[400px] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-yomi-jade/60" />
          </div>
        ) : (
          <LibraryGrid mangas={mangas} serverBaseUrl={serverBaseUrl} />
        )}
      </div>

      {/* Categories dialog */}
      <CategoryDialog
        isOpen={isCategoryDialogOpen}
        onClose={() => setIsCategoryDialogOpen(false)}
        categories={categories}
      />
    </div>
  );
}
