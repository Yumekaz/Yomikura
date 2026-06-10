import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, ServerCrash, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { LibraryFilters } from "./LibraryFilters";
import { LibraryGrid, LibraryManga } from "./LibraryGrid";
import { CategoryDialog } from "./CategoryDialog";
import { BulkCategoryModal } from "../../components/library/BulkCategoryModal";

export default function LibraryPage() {
  const { serverBaseUrl, setServerBaseUrl, testConnection } = useSettingsStore();
  const { cachedChapters, loadCachedChapters, downloadChapter } = useDownloadStore();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | number | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);

  // Bulk Select States
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMangaIds, setSelectedMangaIds] = useState<Set<string | number>>(new Set());
  const [isBulkCatOpen, setIsBulkCatOpen] = useState(false);

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
    staleTime: 1000 * 60 * 5,
  });

  // Fetch Library
  const {
    data: libData,
    isLoading: libLoading,
    isError: libError,
    refetch: refetchLibrary,
  } = useQuery({
    queryKey: ["library", serverBaseUrl],
    queryFn: () => {
      return sdk.GetLibrary({
        filter: { 
          inLibrary: { equalTo: true }
        },
        first: 500,
      });
    },
    enabled: !!serverBaseUrl,
  });

  const isLoading = catLoading || libLoading;

  // Extract and format categories
  const categories = useMemo(() => {
    if (!catData?.categories?.nodes) return [];
    const uniqueById = new Map<string | number, NonNullable<typeof catData.categories.nodes[number]>>();
    for (const node of catData.categories.nodes) {
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

    if (!libData?.mangas?.nodes) return [];

    const uniqueById = new Map<string | number, NonNullable<typeof libData.mangas.nodes[number]>>();
    for (const node of libData.mangas.nodes) {
      if (!node || uniqueById.has(node.id)) continue;
      uniqueById.set(node.id, node);
    }

    let filtered = Array.from(uniqueById.values());

    // Apply front-end category filtering
    if (activeCategoryId !== null && activeCategoryId !== undefined) {
      filtered = filtered.filter((m) => {
        const catIds = m.categories?.nodes?.map(c => c?.id) || [];
        if (activeCategoryId === 0 || activeCategoryId === "0") {
          return catIds.length === 0 || catIds.includes(0);
        } else {
          return catIds.some(id => String(id) === String(activeCategoryId));
        }
      });
    }

    // Apply front-end search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((m) => m.title.toLowerCase().includes(q));
    }

    return filtered.map((m) => ({
      id: m.id,
      title: m.title,
      thumbnailUrl: m.thumbnailUrl,
      unreadCount: m.unreadCount,
    }));
  }, [libData, searchQuery, isOfflineMode, cachedChapters, activeCategoryId]);

  // Bulk select handlers
  const handleToggleSelectManga = useCallback((mangaId: string | number) => {
    setIsSelectMode(true);
    setSelectedMangaIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(mangaId)) {
        copy.delete(mangaId);
        if (copy.size === 0) {
          setIsSelectMode(false);
        }
      } else {
        copy.add(mangaId);
      }
      return copy;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setIsSelectMode(false);
    setSelectedMangaIds(new Set());
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedMangaIds(new Set(mangas.map((m) => m.id)));
  }, [mangas]);

  const bulkDownloadSelected = async () => {
    const idArray = Array.from(selectedMangaIds);
    handleClearSelection();
    
    for (const mangaId of idArray) {
      try {
        const details = await sdk.GetMangaDetails({ id: parseInt(String(mangaId)) });
        const nodes = details.manga?.chapters?.edges?.map(e => e?.node).filter(Boolean) || [];
        const targetChapters = nodes.filter(n => !n.isRead && !n.isDownloaded);
        
        for (const ch of targetChapters) {
          await downloadChapter(parseInt(String(ch.id)), details.manga?.title);
        }
      } catch (err) {
        console.error("Bulk download failed for manga:", mangaId, err);
      }
    }
  };

  const bulkMarkReadStatus = async (isRead: boolean) => {
    const idArray = Array.from(selectedMangaIds);
    handleClearSelection();
    
    for (const mangaId of idArray) {
      try {
        const details = await sdk.GetMangaDetails({ id: parseInt(String(mangaId)) });
        const nodes = details.manga?.chapters?.edges?.map(e => e?.node).filter(Boolean) || [];
        const targetChapters = nodes.filter(n => n.isRead !== isRead);
        
        await Promise.all(
          targetChapters.map((ch) =>
            sdk.UpdateChapterProgress({
              input: {
                id: parseInt(String(ch.id)),
                patch: {
                  isRead,
                  lastPageRead: isRead ? 999 : 0
                }
              }
            })
          )
        );
      } catch (err) {
        console.error("Bulk mark read status failed for manga:", mangaId, err);
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ["library"] });
  };

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
    <div className="flex h-full w-full flex-col bg-transparent relative">
      {/* Filters Bar */}
      <LibraryFilters
        categories={categories}
        activeCategoryId={activeCategoryId}
        onCategorySelect={setActiveCategoryId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onManageCategories={() => setIsCategoryDialogOpen(true)}
        isSelectMode={isSelectMode}
        selectedCount={selectedMangaIds.size}
        onSelectAll={handleSelectAll}
        onCancelSelect={handleClearSelection}
      />

      {/* Main Grid Area */}
      <div className="flex-1 overflow-y-auto">
        {isOfflineMode && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs font-medium text-amber-200 animate-fade-in flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
            <span>Offline Mode — Showing cached titles</span>
            <button
              onClick={async () => {
                setServerBaseUrl("http://127.0.0.1:4567");
                await testConnection();
              }}
              className="rounded-full bg-yomi-jade/20 border border-yomi-jade/30 px-3 py-0.5 text-[10px] font-semibold text-yomi-mint hover:bg-yomi-jade/35 transition"
            >
              Reconnect to Live Server (127.0.0.1:4567)
            </button>
          </div>
        )}
        {isLoading ? (
          <div className="flex min-h-[400px] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-yomi-jade/60" />
          </div>
        ) : (
          <LibraryGrid
            mangas={mangas}
            serverBaseUrl={serverBaseUrl}
            isSelectMode={isSelectMode}
            selectedMangaIds={selectedMangaIds}
            onToggleSelectManga={handleToggleSelectManga}
          />
        )}
      </div>

      {/* Floating Batch Actions Bar */}
      {isSelectMode && (
        <div className="fixed bottom-20 inset-x-4 lg:left-72 lg:right-8 z-40 bg-ink-950/95 border border-yomi-jade/30 rounded-xl px-5 py-3.5 shadow-glow flex items-center justify-between gap-4 animate-fade-in-up backdrop-blur-md">
          <span className="text-xs font-bold text-slate-300 hidden sm:inline">
            Selected: {selectedMangaIds.size} titles
          </span>
          
          <div className="flex items-center gap-2 w-full sm:w-auto justify-around sm:justify-end">
            <button
              onClick={bulkDownloadSelected}
              className="rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition"
            >
              Download
            </button>
            <button
              onClick={() => setIsBulkCatOpen(true)}
              className="rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition"
            >
              Categories
            </button>
            <button
              onClick={() => bulkMarkReadStatus(true)}
              className="rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition"
            >
              Mark Read
            </button>
            <button
              onClick={() => bulkMarkReadStatus(false)}
              className="rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition"
            >
              Mark Unread
            </button>
          </div>
        </div>
      )}

      {/* Categories management dialog */}
      <CategoryDialog
        isOpen={isCategoryDialogOpen}
        onClose={() => setIsCategoryDialogOpen(false)}
        categories={categories}
      />

      {/* Bulk category modal */}
      <BulkCategoryModal
        isOpen={isBulkCatOpen}
        onClose={() => {
          setIsBulkCatOpen(false);
          handleClearSelection();
        }}
        mangaIds={Array.from(selectedMangaIds).map(Number)}
      />
    </div>
  );
}
