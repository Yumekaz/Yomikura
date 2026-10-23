import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Loader2, Search, X } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { FetchSourceMangaType, type FetchSourceMangaMutation } from "../../api/graphql/generated/graphql";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { invalidateChapterState } from "../../api/suwayomi/chapterState";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { canReplaceMigration, executeMangaMigration, MigrationError, prepareMangaMigration, type MigrationResult, type MigrationReview } from "./mangaMigration";
import { MigrationReviewPanel } from "./MigrationReviewPanel";

type Target = { id: number; title: string };
interface SourceMigrationModalProps {
  isOpen: boolean; onClose: () => void; mangaId: number; mangaTitle: string; sourceName: string;
  initialTarget?: Target;
}
type Phase = "search" | "results" | "preparing" | "review" | "executing" | "done" | "error";

export function SourceMigrationModal({ isOpen, onClose, mangaId, mangaTitle, sourceName, initialTarget }: SourceMigrationModalProps) {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live"), [backend]);
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("search");
  const [sourceId, setSourceId] = useState("");
  const [query, setQuery] = useState(mangaTitle);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<NonNullable<FetchSourceMangaMutation["fetchSourceManga"]>["mangas"]>([]);
  const [target, setTarget] = useState<Target | undefined>(initialTarget);
  const [review, setReview] = useState<MigrationReview>();
  const [selected, setSelected] = useState(new Set<number>());
  const [replace, setReplace] = useState(false);
  const [result, setResult] = useState<MigrationResult>();
  const [failure, setFailure] = useState({ message: "", original: "unchanged" as "unchanged" | "unknown" });
  const generation = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const detailId = useId();
  const busy = phase === "executing";
  const close = useCallback(() => { if (!busy) { generation.current += 1; onClose(); } }, [busy, onClose]);

  const { data: sources, isLoading: loadingSources, isError: sourcesError, refetch: retrySources } = useQuery({
    queryKey: ["sources", backend.key], queryFn: () => sdk.GetSources(), enabled: isOpen,
  });
  const prepare = useCallback(async (destination: Target, expectedSource?: string) => {
    const request = ++generation.current;
    setTarget(destination); setPhase("preparing"); setReplace(false);
    try {
      const next = await prepareMangaMigration(backend, mangaId, destination.id, { expectedSourceTitle: mangaTitle, expectedTargetSource: expectedSource });
      if (request !== generation.current) return;
      setReview(next);
      setSelected(new Set(next.rows.filter((row) => row.status === "matched").map((row) => Number(row.source.id))));
      setPhase("review");
    } catch (error) {
      if (request === generation.current) { setFailure({ message: error instanceof MigrationError ? error.message : getErrorMessage(error), original: "unchanged" }); setPhase("error"); }
    }
  }, [backend, mangaId, mangaTitle]);
  useEffect(() => {
    if (!isOpen) return;
    generation.current += 1;
    setPhase("search"); setSourceId(""); setQuery(mangaTitle); setReview(undefined); setResult(undefined); setReplace(false); setSearching(false); setResults([]);
    if (initialTarget) void prepare(initialTarget);
    return () => { generation.current += 1; };
  }, [isOpen, mangaTitle, initialTarget?.id, prepare]);
  useEffect(() => {
    if (!isOpen || !dialog.current) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current.focus();
    return () => previous?.focus();
  }, [isOpen]);
  const search = async () => {
    const request = ++generation.current;
    setSearching(true);
    try {
      const response = await sdk.FetchSourceManga({ input: { source: sourceId, page: 1, type: FetchSourceMangaType.Search, query: query.trim() } });
      if (request === generation.current) { setResults(response.fetchSourceManga?.mangas ?? []); setPhase("results"); }
    } catch (error) {
      if (request === generation.current) { setFailure({ message: getErrorMessage(error), original: "unchanged" }); setPhase("error"); }
    } finally { if (request === generation.current) setSearching(false); }
  };
  const execute = async () => {
    if (!review || busy) return;
    setPhase("executing");
    try {
      const completed = await executeMangaMigration(review, selected, replace ? "replace" : "copy");
      setResult(completed); setPhase("done");
    } catch (error) {
      setFailure({ message: error instanceof MigrationError ? error.message : getErrorMessage(error), original: error instanceof MigrationError ? error.original : "unchanged" }); setPhase("error");
    } finally {
      void invalidateChapterState(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["library-duplicates"] });
    }
  };
  if (!isOpen) return null;
  const canReplace = !!review && canReplaceMigration(review, selected);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={detailId} tabIndex={-1}
      className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl outline-none"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key !== "Tab") return;
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]') ?? [])];
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/5 pb-4">
        <div><h2 id={titleId} className="text-base font-bold text-white">Source migration</h2><p id={detailId} className="mt-1 text-xs text-slate-400">{mangaTitle} · {sourceName}</p></div>
        <button type="button" aria-label="Close source migration" disabled={busy} onClick={close} className="yomi-icon-button"><X className="h-5 w-5" /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
        {phase === "search" && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <label className="block text-xs font-semibold text-slate-400">Target source
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} disabled={searching || loadingSources} className="yomi-select mt-2 w-full">
              <option value="">Choose source</option>
              {sources?.sources.nodes.filter((source) => source.extension?.isInstalled || String(source.id) === "0").map((source) => <option key={String(source.id)} value={String(source.id)}>{source.name}</option>)}
            </select>
          </label>
          {sourcesError && <p role="alert" className="text-xs text-red-300">Sources could not be loaded. <button type="button" onClick={() => void retrySources()} className="underline">Retry sources</button></p>}
          <label className="block text-xs font-semibold text-slate-400">Search query<input value={query} onChange={(event) => setQuery(event.target.value)} disabled={searching} className="yomi-field mt-2 w-full" /></label>
          <button type="submit" disabled={!sourceId || !query.trim() || searching} className="yomi-button yomi-button-primary w-full">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search matching titles</button>
        </form>}
        {phase === "results" && <div className="space-y-3">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-300">Choose a title to review its chapters</p><button type="button" className="text-xs text-yomi-jade underline" onClick={() => setPhase("search")}>Change search</button></div>
          {results.map((manga) => <button type="button" key={manga.id} disabled={manga.id === mangaId} onClick={() => void prepare({ id: manga.id, title: manga.title }, sourceId)} className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-ink-950/40 p-3 text-left disabled:opacity-40">
            <img src={manga.thumbnailUrl || "/placeholder-cover.svg"} alt="" className="h-12 w-9 rounded-md object-cover" /><span className="text-sm text-slate-200">{manga.title}{manga.id === mangaId ? " (current title)" : ""}</span>
          </button>)}
          {!results.length && <p className="p-6 text-center text-sm text-slate-400">No matching titles found. Refine the search query.</p>}
        </div>}
        {(phase === "preparing" || phase === "executing") && <div role="status" className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-300"><Loader2 className="h-8 w-8 animate-spin text-yomi-jade" /><p>{phase === "preparing" ? "Refreshing destination chapters and preparing the review…" : "Copying and verifying selected progress and categories…"}</p><p className="max-w-md text-xs text-slate-400">The original stays in the library unless replacement was selected and every required transfer is confirmed.</p></div>}
        {phase === "review" && review && <MigrationReviewPanel review={review} selected={selected} onSelected={(next) => { setSelected(next); setReplace(false); }} replace={replace} onReplace={setReplace} canReplace={canReplace}
          onExecute={() => void execute()} onRefresh={() => void prepare({ id: review.target.id, title: review.target.title }, initialTarget ? undefined : sourceId)} onSearch={() => setPhase("search")} />}
        {phase === "done" && result && <div className="space-y-4 py-6 text-center"><CheckCircle className="mx-auto h-10 w-10 text-yomi-jade" /><h3 className="text-base font-semibold text-white">Selected progress and categories verified</h3><p className="text-sm text-slate-300">{result.mode === "copy" ? "The original is kept in your library." : "The destination is in your library and the original has left the library. Its source entry and downloads were retained."}</p><button type="button" onClick={close} className="yomi-button yomi-button-primary">Close</button></div>}
        {phase === "error" && <div role="alert" className="space-y-4 py-6 text-center"><AlertTriangle className="mx-auto h-9 w-9 text-amber-300" /><h3 className="text-base font-semibold text-white">Migration needs attention</h3><p className="text-sm text-slate-300">{failure.message}</p><p className="text-xs text-slate-400">{failure.original === "unknown" ? "The original's library membership could not be confirmed. Reconnect and check both entries before retrying." : "This migration stopped before removing the original. Confirmed copies remain available."}</p><div className="flex flex-wrap justify-center gap-3">{target && <button type="button" onClick={() => void prepare(target, initialTarget ? undefined : sourceId || undefined)} className="yomi-button yomi-button-secondary">Refresh mapping</button>}<button type="button" onClick={() => setPhase("search")} className="yomi-button yomi-button-secondary">Change search</button></div></div>}
      </div>
    </div>
  </div>;
}
