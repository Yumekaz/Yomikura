import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RotateCcw, Search, ServerCrash, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { fetchAllLibrary } from "../../api/library/fetchAllLibrary";
import { LibraryFilters } from "./LibraryFilters";
import { LibraryGrid, LibraryManga } from "./LibraryGrid";
import { CategoryDialog } from "./CategoryDialog";
import { BulkCategoryModal } from "../../components/library/BulkCategoryModal";
import { LibraryList } from "./LibraryList";
import { ContinueReading } from "./ContinueReading";
import { invalidateChapterState } from "../../api/suwayomi/chapterState";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { writeChapterProgress } from "../../api/suwayomi/progressSync";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { availabilityCounts, deviceChapterCounts, isAvailabilityFilter, matchesAvailability } from "./downloadAvailability";

export default function LibraryPage() {
  const { notify } = useFeedback();
  const { serverBaseUrl, testConnection, mockMode, libraryViewMode, setLibraryViewMode, librarySortMode, setLibrarySortMode, librarySortDescending, setLibrarySortDescending } = useSettingsStore();
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
    return createGraphqlClient(`${cleanUrl}/api/graphql`, undefined, mockMode ? "demo" : "live");
  }, [serverBaseUrl, mockMode]);

  // Fetch Categories
  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ["categories", serverBaseUrl, mockMode],
    queryFn: () => sdk.GetCategories(),
    retry: (attempt) => cachedChapters.length === 0 && attempt < 2,
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
    queryKey: ["library", serverBaseUrl, mockMode],
    retry: (attempt) => cachedChapters.length === 0 && attempt < 2,
    queryFn: async () => {
      const nodes = await fetchAllLibrary(sdk, {
        inLibrary: { equalTo: true },
      });
      return { mangas: { nodes } };
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
  const localDownloadCounts = useMemo(() => deviceChapterCounts(cachedChapters), [cachedChapters]);
  const downloadCounts = useMemo(() => ({ ...availabilityCounts(isOfflineMode
    ? [...new Set(cachedChapters.map((chapter) => chapter.mangaId))].map((id) => ({ id, downloadCount: 0 }))
    : (libData?.mangas.nodes ?? []).filter((manga): manga is NonNullable<typeof manga> => !!manga), localDownloadCounts), ...(isOfflineMode ? { "smart:on_server": undefined } : {}) }), [isOfflineMode, cachedChapters, libData, localDownloadCounts]);

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
        hasStartedReading: false,
      }));
      if (isAvailabilityFilter(activeCategoryId)) filtered = filtered.filter((manga) => matchesAvailability(activeCategoryId, (localDownloadCounts.get(String(manga.id)) ?? 0) > 0, false));
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
      if (activeCategoryId === "smart:reading") {
        filtered = filtered.filter((m) => m.lastReadChapter !== null && m.lastReadChapter !== undefined && m.unreadCount > 0);
      } else if (activeCategoryId === "smart:plan_to_read") {
        filtered = filtered.filter((m) => m.lastReadChapter === null || m.lastReadChapter === undefined);
      } else if (activeCategoryId === "smart:completed") {
        filtered = filtered.filter((m) => m.unreadCount === 0);
      } else if (isAvailabilityFilter(activeCategoryId)) {
        filtered = filtered.filter((m) => matchesAvailability(activeCategoryId, (localDownloadCounts.get(String(m.id)) ?? 0) > 0, (m.downloadCount ?? 0) > 0));
      } else {
        filtered = filtered.filter((m) => {
          const catIds = m.categories?.nodes?.map(c => c?.id) || [];
          if (activeCategoryId === 0 || activeCategoryId === "0") {
            return catIds.length === 0 || catIds.includes(0);
          } else {
            return catIds.some(id => String(id) === String(activeCategoryId));
          }
        });
      }
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
      hasStartedReading: !!m.lastReadChapter?.id,
    }));
  }, [libData, searchQuery, isOfflineMode, cachedChapters, activeCategoryId, localDownloadCounts]);

  const displayMangas = useMemo(() => {
    const direction = librarySortDescending ? -1 : 1;
    return [...mangas].sort((a, b) => {
      if (librarySortMode === "unread") return (a.unreadCount - b.unreadCount) * direction || a.title.localeCompare(b.title);
      if (librarySortMode === "status") {
        const rank = (manga: LibraryManga) => manga.hasStartedReading ? (manga.unreadCount ? 0 : 1) : 2;
        return (rank(a) - rank(b)) * direction || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title) * direction;
    });
  }, [librarySortDescending, librarySortMode, mangas]);

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
    setSelectedMangaIds(new Set(displayMangas.map((m) => m.id)));
  }, [displayMangas]);

  const bulkDownloadSelected = async () => {
    const idArray = Array.from(selectedMangaIds);
    handleClearSelection();
    
    for (const mangaId of idArray) {
      try {
        const details = await sdk.GetMangaDetails({ id: parseInt(String(mangaId)) });
        const nodes = details.manga?.chapters?.nodes ?? [];
        const targetChapters = nodes.filter(n => !n.isRead && !n.isDownloaded);
        
        for (const ch of targetChapters) {
          await downloadChapter(parseInt(String(ch.id)), details.manga?.title, progressBackend(serverBaseUrl, mockMode));
        }
      } catch (err) {
        console.error("Bulk download failed for manga:", mangaId, err);
      }
    }
  };

  const bulkMarkReadStatus = async (isRead: boolean) => {
    const backend = progressBackend(serverBaseUrl, mockMode);
    let failed = 0;
    const idArray = Array.from(selectedMangaIds);
    handleClearSelection();
    
    for (const mangaId of idArray) {
      try {
        const details = await sdk.GetMangaDetails({ id: parseInt(String(mangaId)) });
        const nodes = details.manga?.chapters?.nodes ?? [];
        const targetChapters = nodes.filter(n => n.isRead !== isRead);
        
        await Promise.all(
          targetChapters.map(async (ch) => {
            const patch = { isRead, lastPageRead: isRead ? Math.max(0, (ch.pageCount || 1) - 1) : 0 };
            await writeChapterProgress(backend, Number(ch.id), patch);
          })
        );
      } catch (err) {
        failed += 1;
        console.error("Bulk mark read status failed for manga:", mangaId, err);
      }
    }
    
    await invalidateChapterState(queryClient);
    if (failed) notify(`Progress changes could not be saved for ${failed} title${failed === 1 ? "" : "s"}. Check storage and the server connection, then retry.`, "error");
  };

  if (!serverBaseUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-ink-950 p-6 text-center text-slate-300">
        <ServerCrash className="mb-4 h-12 w-12 text-slate-600" />
        <p className="text-lg font-medium">Connect your library</p>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Set up a connection in Settings to bring your books into Yomikura.
        </p>
        <Link
          to="/settings/connection"
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
        <p className="text-lg font-medium">Your library couldn’t be reached</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-red-400/70">
          Check your connection and try again. You can review connection details in Settings.
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
            to="/settings/connection"
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
    <div className="yomi-library-page">
      <header className="yomi-library-header">
        <div>
          <h1>Library</h1>
          <p>{isOfflineMode && activeCategoryId === "smart:on_server" ? "Reconnect to check server availability. Select On this device to read saved copies." : `${displayMangas.length} book${displayMangas.length === 1 ? "" : "s"}${isOfflineMode ? " saved on this device" : " in your collection"}`}</p>
        </div>
        <div className="yomi-library-header-actions"><label className="yomi-search"><Search aria-hidden="true" /><input type="search" aria-label="Search library" placeholder="Search library..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label><Link className="yomi-button yomi-button-primary" to="/browse/sources"><Plus aria-hidden="true" />Add books</Link></div>
      </header>
      {!isSelectMode && !searchQuery && activeCategoryId === null && <ContinueReading books={isOfflineMode ? [...new Map(cachedChapters.map((chapter) => [Number(chapter.mangaId), { id: Number(chapter.mangaId), title: chapter.mangaTitle }])).values()] : (libData?.mangas.nodes ?? []).map((manga) => ({ id: Number(manga.id), title: manga.title }))} />}
      {/* Filters Bar */}
      <LibraryFilters
        serverAvailable={!isOfflineMode}
        downloadCounts={downloadCounts}
        categories={categories}
        activeCategoryId={activeCategoryId}
        onCategorySelect={setActiveCategoryId}
        onManageCategories={() => setIsCategoryDialogOpen(true)}
        isSelectMode={isSelectMode}
        selectedCount={selectedMangaIds.size}
        onSelectAll={handleSelectAll}
        onCancelSelect={handleClearSelection}
        onStartSelect={() => setIsSelectMode(true)}
        viewMode={libraryViewMode}
        sortMode={librarySortMode}
        sortDescending={librarySortDescending}
        onViewModeChange={setLibraryViewMode}
        onSortModeChange={setLibrarySortMode}
        onSortDirectionChange={setLibrarySortDescending}
      />

      {/* Main Grid Area */}
      <div className="flex-1 overflow-visible">
        {isOfflineMode && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs font-medium text-amber-200 animate-fade-in flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
            <span>Offline Mode — Showing cached titles</span>
            <button
              onClick={async () => {
                await testConnection();
              }}
              className="rounded-full bg-yomi-jade/20 border border-yomi-jade/30 px-3 py-0.5 text-xs font-semibold text-yomi-mint hover:bg-yomi-jade/35 transition"
            >
              Reconnect to this server
            </button>
          </div>
        )}
        {isLoading ? (
          <div className="flex min-h-[400px] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-yomi-jade/60" />
          </div>
        ) : (
          libraryViewMode === "grid" ? <LibraryGrid mangas={displayMangas} filtered={!!searchQuery || activeCategoryId !== null} onClearFilters={() => { setSearchQuery(""); setActiveCategoryId(null); }} serverBaseUrl={serverBaseUrl} isSelectMode={isSelectMode} selectedMangaIds={selectedMangaIds} onToggleSelectManga={handleToggleSelectManga} /> : <LibraryList mangas={displayMangas} filtered={!!searchQuery || activeCategoryId !== null} onClearFilters={() => { setSearchQuery(""); setActiveCategoryId(null); }} serverBaseUrl={serverBaseUrl} isSelectMode={isSelectMode} selectedMangaIds={selectedMangaIds} onToggleSelectManga={handleToggleSelectManga} />
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
