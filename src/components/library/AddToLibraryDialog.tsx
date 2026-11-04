import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, BookOpen, Copy, Heart, Loader2, Plus, X } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { fetchAllSources } from "../../api/library/fetchAllSources";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { useModalFocus } from "../../hooks/useModalFocus";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useFeedback } from "../ui/FeedbackProvider";
import { SourceMigrationModal } from "../source/SourceMigrationModal";
import { addLibraryEntry, assertLibraryEntryBackend, duplicateFingerprint, libraryInventoryKey, loadLibraryInventory, possibleLibraryDuplicates, type LibraryEntry } from "./libraryEntry";

export function AddToLibraryDialog({ mangaId, mangaTitle, onClose }: { mangaId: number; mangaTitle: string; onClose: () => void }) {
  const { mockMode, connectionStatus } = useSettingsStore();
  const backend = useProgressBackend()!;
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live"), [backend]);
  const client = useQueryClient();
  const { notify } = useFeedback();
  const [approvedDuplicates, setApprovedDuplicates] = useState<string>();
  const [selected, setSelected] = useState<number[]>([]);
  const [migration, setMigration] = useState<{ original: LibraryEntry; mode: "copy" | "replace" }>();
  const [error, setError] = useState("");
  const connected = mockMode || connectionStatus === "connected";
  const titleId = useId();
  const reviewKey = ["library-entry-review", backend.key, backend.libraryId, mangaId];
  const query = useQuery({ queryKey: reviewKey, enabled: connected, retry: false, refetchOnWindowFocus: false, staleTime: Infinity,
    queryFn: async ({ signal }) => {
      assertLibraryEntryBackend(backend);
      const [details, inventory, categories, sources] = await Promise.all([
        sdk.GetMangaDetails({ id: mangaId }, undefined, signal), loadLibraryInventory(backend, signal), sdk.GetCategories(undefined, undefined, signal), fetchAllSources(sdk, signal),
      ]);
      assertLibraryEntryBackend(backend);
      if (details.manga.id !== mangaId || details.manga.title !== mangaTitle) throw new Error("This comic changed. Reopen its details before adding it.");
      return { manga: details.manga, inventory, categories: categories.categories.nodes, sources: sources.sources.nodes };
    },
  });
  useEffect(() => { if (query.data) setSelected(query.data.manga.categories.nodes.map((category) => category.id).filter((id) => id > 0)); }, [query.data]);
  const duplicates = possibleLibraryDuplicates(query.data?.inventory ?? [], { id: mangaId, title: mangaTitle });
  const showDuplicates = duplicates.length > 0 && approvedDuplicates !== duplicateFingerprint(duplicates);
  const saving = useMutation({ mutationFn: async () => {
    assertLibraryEntryBackend(backend);
    const fresh = await loadLibraryInventory(backend);
    assertLibraryEntryBackend(backend);
    const matches = possibleLibraryDuplicates(fresh, { id: mangaId, title: mangaTitle });
    if (matches.length && approvedDuplicates !== duplicateFingerprint(matches)) {
      client.setQueryData(reviewKey, (previous: typeof query.data) => previous && { ...previous, inventory: fresh });
      throw new Error("A similar comic is in your library. Review it before adding another copy.");
    }
    return addLibraryEntry(backend, { id: mangaId, title: mangaTitle }, selected);
  }, onSuccess: () => {
    void client.invalidateQueries({ queryKey: ["library"] }); void client.invalidateQueries({ queryKey: ["manga"] });
    void client.invalidateQueries({ queryKey: ["library-duplicates"] }); void client.invalidateQueries({ queryKey: libraryInventoryKey(backend) });
    void client.invalidateQueries({ queryKey: ["library-entry-review"] });
    notify("Added to your library.", "success"); onClose();
  }, onError: (value) => setError(value instanceof Error ? value.message : getErrorMessage(value)) });
  const close = () => { if (!saving.isPending) onClose(); };
  const modal = useModalFocus(!migration, close);
  const sourceName = (id: unknown) => query.data?.sources.find((source) => String(source.id) === String(id))?.name ?? "Source unavailable";

  if (migration) return <SourceMigrationModal isOpen mangaId={migration.original.id} mangaTitle={migration.original.title} sourceName={sourceName(migration.original.sourceId)} initialTarget={{ id: mangaId, title: mangaTitle }} initialMode={migration.mode} onClose={onClose} />;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div {...modal} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel text-slate-200">
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 pb-4"><div><h2 id={titleId} className="text-xl font-semibold text-white">{showDuplicates ? "Possible duplicates" : "Add to library"}</h2><p className="mt-2 text-sm text-slate-400">{mangaTitle}</p></div><button type="button" className="yomi-icon-button" onClick={close} disabled={saving.isPending} aria-label="Close add to library"><X /></button></header>
    <div className="min-h-0 space-y-4 overflow-auto py-5">
      {!connected && <p role="status">Reconnect to add this comic. Your reading history stays on this device.</p>}
      {connected && query.isPending && <p role="status" className="flex items-center gap-2"><Loader2 className="animate-spin" />Checking your library…</p>}
      {query.isError && <div role="alert"><p>We couldn’t check your library. No comic was added.</p><button type="button" onClick={() => void query.refetch()} className="yomi-button yomi-button-secondary mt-3">Try again</button></div>}
      {connected && query.data && (showDuplicates ? <>
        <p className="text-sm text-slate-300">A comic with a similar name is already in your library. Compare its source before adding another version.</p>
        {duplicates.map((entry) => <article key={entry.id} className="rounded-xl border border-white/10 bg-ink-950/30 p-4"><div className="flex gap-4"><img className="h-28 w-[4.7rem] shrink-0 rounded-lg object-cover" src={entry.thumbnailUrl ? new URL(entry.thumbnailUrl, `${backend.serverBaseUrl}/`).href : "/placeholder-cover.svg"} alt="" /><div className="min-w-0"><h3 className="font-semibold text-white">{entry.title}</h3><p className="mt-1 text-sm text-slate-400">{sourceName(entry.sourceId)}</p><p className="mt-1 text-xs text-slate-400">{entry.chapters?.totalCount ?? "Unknown"} chapters</p><Link to={`/manga/${entry.id}`} onClick={onClose} className="yomi-text-link mt-3 inline-flex items-center gap-2 text-sm"><BookOpen className="h-4 w-4" />Show entry</Link></div></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setMigration({ original: entry, mode: "copy" })} className="yomi-button yomi-button-secondary"><Copy />Copy</button><button type="button" onClick={() => setMigration({ original: entry, mode: "replace" })} className="yomi-button yomi-button-secondary"><ArrowRightLeft />Migrate</button></div></article>)}
        <p className="text-xs text-slate-400">Copy keeps both library entries. Migrate replaces the original only after the selected transfer is verified. Review chapters and categories before either action.</p>
      </> : <fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold">Choose categories</legend>{query.data.categories.filter((category) => category.id > 0).map((category) => <label className="flex items-center gap-3 rounded-lg border border-white/10 px-4 py-3" key={category.id}><input type="checkbox" checked={selected.includes(category.id)} disabled={saving.isPending} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, category.id] : ids.filter((id) => id !== category.id))} /><span>{category.name}</span></label>)}<p className="text-sm text-slate-400">{selected.length ? "You can change categories later from this comic’s details." : "Without a category, this comic stays in your default collection."}</p><Link to="/settings/library" onClick={onClose} className="yomi-text-link text-sm">Manage categories</Link></fieldset>)}
      {error && <p role="alert" className="text-sm text-slate-200">{error}</p>}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-white/10 pt-4"><button type="button" onClick={close} disabled={saving.isPending} className="yomi-button yomi-button-secondary">Cancel</button>{connected && query.data && !query.isError && (showDuplicates ? <button type="button" onClick={() => { setApprovedDuplicates(duplicateFingerprint(duplicates)); setError(""); }} className="yomi-button yomi-button-primary"><Plus />Add anyway</button> : <button type="button" onClick={() => saving.mutate()} disabled={saving.isPending} className="yomi-button yomi-button-primary">{saving.isPending ? <Loader2 className="animate-spin" /> : <Heart />}Save to library</button>)}</footer>
  </div></div>;
}
