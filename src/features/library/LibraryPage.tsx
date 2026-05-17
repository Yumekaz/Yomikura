import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ServerCrash } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { LibraryFilters } from "./LibraryFilters";
import { LibraryGrid, LibraryManga } from "./LibraryGrid";

export default function LibraryPage() {
  const { serverBaseUrl } = useSettingsStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | number | null>(null);

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
    const cats = catData.categories.edges
      .map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node != null);

    return cats.sort((a, b) => (a.order || 0) - (b.order || 0)).map(cat => ({
      id: cat.id,
      name: cat.name
    }));
  }, [catData]);

  // Extract and filter mangas
  const mangas: LibraryManga[] = useMemo(() => {
    if (!libData?.mangas?.edges) return [];

    let filtered = libData.mangas.edges
      .map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node != null);

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
  }, [libData, searchQuery]);

  // Handle server unconnected state safely
  if (!serverBaseUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-ink-950 p-6 text-center text-slate-300">
        <ServerCrash className="mb-4 h-12 w-12 text-slate-600" />
        <p className="text-lg font-medium">Not Connected</p>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Please configure your Suwayomi server in Settings.
        </p>
      </div>
    );
  }

  // Handle error
  if (libError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-ink-950 p-6 text-center text-red-400">
        <ServerCrash className="mb-4 h-12 w-12 opacity-80" />
        <p className="text-lg font-medium">Failed to load library</p>
        <p className="mt-2 max-w-md text-sm text-red-400/70">
          Ensure your Suwayomi server is online and accessible.
        </p>
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
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex min-h-[400px] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-yomi-jade/60" />
          </div>
        ) : (
          <LibraryGrid mangas={mangas} serverBaseUrl={serverBaseUrl} />
        )}
      </div>
    </div>
  );
}
