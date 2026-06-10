import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, CheckCircle, RefreshCw, Layers } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";

export function DuplicateScanner() {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [mergeStatus, setMergeStatus] = useState<"idle" | "merging" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch full library
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["library-duplicates", serverBaseUrl],
    queryFn: () => sdk.GetLibrary({
      filter: { inLibrary: { equalTo: true } },
      first: 1000,
    }),
    enabled: !!serverBaseUrl,
  });

  // Perform duplication grouping
  const duplicates = useMemo(() => {
    if (!data?.mangas?.nodes) return [];
    
    // Group by title
    const groups: Record<string, any[]> = {};
    for (const m of data.mangas.nodes) {
      if (!m) continue;
      const normalizedTitle = m.title.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!groups[normalizedTitle]) {
        groups[normalizedTitle] = [];
      }
      groups[normalizedTitle].push(m);
    }

    // Filter groups with size > 1
    return Object.values(groups).filter(g => g.length > 1);
  }, [data]);

  // Mutation to merge progress and keep one target
  const { mutate: mergeDuplicates } = useMutation({
    mutationFn: async ({ keepId, removeId }: { keepId: number; removeId: number }) => {
      setMergeStatus("merging");

      // 1. Fetch chapter states for both
      const keepDetails = await sdk.GetMangaDetails({ id: keepId });
      const removeDetails = await sdk.GetMangaDetails({ id: removeId });

      const keepChapters = keepDetails.manga?.chapters?.edges?.map(e => e?.node).filter(Boolean) || [];
      const removeChapters = removeDetails.manga?.chapters?.edges?.map(e => e?.node).filter(Boolean) || [];

      // 2. Match chapters and copy progress to target "keep" manga
      const progressPromises = [];
      for (const remCh of removeChapters) {
        if (!remCh.isRead) continue;

        const match = keepChapters.find(
          kCh => 
            kCh.chapterNumber === remCh.chapterNumber ||
            kCh.name.toLowerCase() === remCh.name.toLowerCase()
        );

        if (match && !match.isRead) {
          progressPromises.push(
            sdk.UpdateChapterProgress({
              input: {
                id: parseInt(String(match.id)),
                patch: {
                  isRead: true,
                  lastPageRead: remCh.lastPageRead ?? 999
                }
              }
            })
          );
        }
      }

      if (progressPromises.length > 0) {
        await Promise.all(progressPromises);
      }

      // 3. Remove "remove" manga from library
      await sdk.ToggleMangaLibrary({
        input: {
          id: removeId,
          patch: { inLibrary: false }
        }
      });
    },
    onSuccess: () => {
      setMergeStatus("success");
      queryClient.invalidateQueries({ queryKey: ["library-duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      setTimeout(() => setMergeStatus("idle"), 2000);
    },
    onError: (err: any) => {
      setMergeStatus("error");
      setErrorMsg(err.message || "Failed to merge duplicate entries.");
    }
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-yomi-jade" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center text-center p-6 text-red-400">
        <AlertTriangle className="h-8 w-8 mb-2" />
        <span className="font-semibold">Failed to fetch library entries.</span>
        <button onClick={() => refetch()} className="mt-3 text-xs text-yomi-jade flex items-center gap-1.5 hover:underline">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel select-none">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <Layers className="h-5 w-5 text-yomi-jade" />
        Duplicate Manga Scanner
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Scans your local library database for entries sharing identical titles on different sources, helping you merge progress logs and clean up duplicates.
      </p>

      {/* Merge Status Overlays */}
      {mergeStatus === "merging" && (
        <div className="mt-4 p-4 rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-mint text-xs font-semibold flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Merging progress and updating databases...</span>
        </div>
      )}

      {mergeStatus === "success" && (
        <div className="mt-4 p-4 rounded-lg bg-yomi-jade/15 border border-yomi-jade/30 text-yomi-mint text-xs font-bold flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          <span>Merge completed successfully!</span>
        </div>
      )}

      {mergeStatus === "error" && (
        <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
          <span className="font-bold">Error:</span> {errorMsg}
        </div>
      )}

      {/* Duplicate Lists */}
      <div className="mt-6 space-y-4">
        {duplicates.map((group, gIdx) => {
          const title = group[0].title;
          return (
            <div key={gIdx} className="rounded-xl border border-white/5 bg-ink-950/20 p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Title: "{title}"
              </h3>
              
              <div className="grid gap-3 sm:grid-cols-2">
                {group.map((m) => {
                  // Find the other duplicates in the group to allow merging into them
                  const others = group.filter(x => x.id !== m.id);
                  
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg border border-white/5 bg-ink-950/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={m.thumbnailUrl || "/placeholder-cover.svg"}
                          alt={m.title}
                          className="h-10 w-7 object-cover rounded"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-slate-200 truncate">{m.title}</span>
                          <span className="text-[10px] text-slate-500">Manga ID: {m.id}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {others.map((oth) => (
                          <button
                            key={oth.id}
                            onClick={() => {
                              if (window.confirm(`Merge progress of manga ID ${m.id} into manga ID ${oth.id} and delete ID ${m.id} from library?`)) {
                                mergeDuplicates({ keepId: parseInt(String(oth.id)), removeId: parseInt(String(m.id)) });
                              }
                            }}
                            className="rounded bg-yomi-jade/10 border border-yomi-jade/20 px-2.5 py-1 text-[9px] font-bold text-yomi-mint hover:bg-yomi-jade/20 transition shrink-0"
                          >
                            Merge Into ID {oth.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {duplicates.length === 0 && (
          <div className="text-center py-10 text-xs text-slate-500 border border-dashed border-white/5 rounded-xl">
            No duplicate manga titles detected in your library!
          </div>
        )}
      </div>
    </div>
  );
}
