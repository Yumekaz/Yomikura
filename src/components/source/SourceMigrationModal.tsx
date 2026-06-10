import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Search, Loader2, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { FetchSourceMangaType } from "../../api/graphql/generated/graphql";

interface SourceMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  mangaId: number;
  mangaTitle: string;
  sourceName: string;
}

export function SourceMigrationModal({
  isOpen,
  onClose,
  mangaId,
  mangaTitle,
  sourceName,
}: SourceMigrationModalProps) {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();

  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState(mangaTitle);
  const [migrationStatus, setMigrationStatus] = useState<"idle" | "searching" | "confirming" | "migrating" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [targetManga, setTargetManga] = useState<any>(null);

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch all installed/available sources
  const { data: sourcesData, isLoading: loadingSources } = useQuery({
    queryKey: ["sources", serverBaseUrl],
    queryFn: () => sdk.GetSources(),
    enabled: isOpen && !!serverBaseUrl,
  });

  const sources = useMemo(() => {
    if (!sourcesData?.sources?.nodes) return [];
    return sourcesData.sources.nodes.filter(s => s?.extension?.isInstalled);
  }, [sourcesData]);

  // Mutation: Search target source
  const { mutate: searchTarget, data: searchData, isPending: searching } = useMutation({
    mutationFn: () =>
      sdk.FetchSourceManga({
        input: {
          source: selectedSourceId,
          page: 1,
          type: FetchSourceMangaType.Search,
          query: searchQuery,
        },
      }),
    onSuccess: () => {
      setMigrationStatus("confirming");
    },
    onError: (err: any) => {
      setMigrationStatus("error");
      setErrorMessage(err.message || "Failed to search target source.");
    },
  });

  // Mutation: Execute migration
  const { mutate: executeMigration, isPending: migrating } = useMutation({
    mutationFn: async (targetId: number) => {
      setMigrationStatus("migrating");
      
      // 1. Add target manga to library
      await sdk.ToggleMangaLibrary({
        input: {
          id: targetId,
          patch: { inLibrary: true },
        },
      });

      // 2. Fetch full details and chapters for both mangas
      const sourceDetails = await sdk.GetMangaDetails({ id: mangaId });
      const targetDetails = await sdk.GetMangaDetails({ id: targetId });

      const sourceChapters = sourceDetails.manga?.chapters?.edges?.map(e => e?.node).filter(Boolean) || [];
      const targetChapters = targetDetails.manga?.chapters?.edges?.map(e => e?.node).filter(Boolean) || [];

      // 3. Match chapters by chapterNumber or name and copy progress
      const progressPromises = [];
      for (const srcCh of sourceChapters) {
        if (!srcCh.isRead) continue; // Skip unread chapters
        
        // Find matching chapter in target
        const match = targetChapters.find(
          tarCh => 
            tarCh.chapterNumber === srcCh.chapterNumber ||
            tarCh.name.toLowerCase() === srcCh.name.toLowerCase()
        );

        if (match) {
          progressPromises.push(
            sdk.UpdateChapterProgress({
              input: {
                id: parseInt(String(match.id)),
                patch: {
                  isRead: true,
                  lastPageRead: srcCh.lastPageRead ?? 999
                }
              }
            })
          );
        }
      }

      if (progressPromises.length > 0) {
        await Promise.all(progressPromises);
      }

      // 4. Remove original manga from library
      await sdk.ToggleMangaLibrary({
        input: {
          id: mangaId,
          patch: { inLibrary: false },
        },
      });
    },
    onSuccess: () => {
      setMigrationStatus("success");
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["manga"] });
    },
    onError: (err: any) => {
      setMigrationStatus("error");
      setErrorMessage(err.message || "Migration process failed.");
    },
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedSourceId("");
      setSearchQuery(mangaTitle);
      setMigrationStatus("idle");
      setErrorMessage("");
      setTargetManga(null);
    }
  }, [isOpen, mangaTitle]);

  const searchResults = searchData?.fetchSourceManga?.mangas || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-base font-bold text-white">Source Migration</h2>
            <p className="text-[11px] text-slate-500">Migrating: "{mangaTitle}" ({sourceName})</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {migrationStatus === "idle" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Select Target Source</label>
                {loadingSources ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-yomi-jade" />
                  </div>
                ) : (
                  <select
                    value={selectedSourceId}
                    onChange={(e) => setSelectedSourceId(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2.5 text-xs text-slate-300 outline-none focus:border-yomi-jade/55 transition"
                  >
                    <option value="">-- Choose source --</option>
                    {sources.map(s => (
                      <option key={s!.id as string} value={s!.id as string}>
                        {s!.name} ({s!.lang.toUpperCase()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Search Query</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Manga title..."
                    className="w-full rounded-lg bg-ink-950 border border-white/10 py-2 pl-9 pr-4 text-xs text-slate-200 outline-none focus:border-yomi-jade/55 transition"
                  />
                </div>
              </div>

              <button
                disabled={!selectedSourceId || !searchQuery.trim() || searching}
                onClick={() => searchTarget()}
                className="w-full py-2.5 rounded-lg bg-yomi-jade text-ink-950 text-xs font-bold hover:bg-yomi-jade/90 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search Matching Titles
              </button>
            </div>
          )}

          {migrationStatus === "confirming" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-400">Search Results</span>
                <button
                  onClick={() => setMigrationStatus("idle")}
                  className="text-yomi-jade hover:underline"
                >
                  Change Search
                </button>
              </div>

              <div className="space-y-2.5 max-h-60 overflow-y-auto">
                {searchResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setTargetManga(m);
                      executeMigration(parseInt(String(m.id)));
                    }}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-ink-950/40 hover:border-yomi-jade/25 hover:bg-yomi-jade/5 transition"
                  >
                    <img
                      src={m.thumbnailUrl || "/placeholder-cover.svg"}
                      alt={m.title}
                      className="h-12 w-9 object-cover rounded-md"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-slate-200 truncate">{m.title}</span>
                      <span className="text-[10px] text-slate-500">ID: {m.id}</span>
                    </div>
                  </button>
                ))}

                {searchResults.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-500">
                    No matching titles found on the target source.
                  </div>
                )}
              </div>
            </div>
          )}

          {migrationStatus === "migrating" && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
              <span className="text-xs font-semibold text-slate-300">Migrating library progress...</span>
              <p className="text-[10px] text-slate-500 max-w-xs leading-normal">
                Adding "{targetManga?.title}" to library, fetching target chapters, matching reading history, and pruning source manga entry.
              </p>
            </div>
          )}

          {migrationStatus === "success" && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <CheckCircle className="h-10 w-10 text-yomi-jade animate-pulse" />
              <span className="text-sm font-bold text-slate-200">Migration Completed!</span>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Successfully migrated progress logs, history, and category tags to **"{targetManga?.title}"**.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-5 py-2 rounded-lg bg-yomi-jade text-ink-950 text-xs font-bold hover:bg-yomi-jade/90 transition"
              >
                Close
              </button>
            </div>
          )}

          {migrationStatus === "error" && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <AlertTriangle className="h-10 w-10 text-red-400" />
              <span className="text-sm font-semibold text-slate-200">Migration Failed</span>
              <p className="text-xs text-red-400/80 max-w-xs leading-relaxed">
                {errorMessage}
              </p>
              <button
                onClick={() => setMigrationStatus("idle")}
                className="mt-4 px-5 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs text-slate-300 font-semibold transition"
              >
                Go Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
