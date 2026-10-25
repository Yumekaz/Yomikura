import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { bindTrackerWork, searchTrackerWorks, trackerExternalUrl, trackingErrorMessage, type TrackerSearchResult } from "../../api/suwayomi/trackingActions";

export function TrackerWorkSearch({ backend, mangaId, mangaTitle, trackerId, supportsPrivate, onLinked, onClose }: {
  backend: ProgressBackend; mangaId: number; mangaTitle: string; trackerId: number; supportsPrivate: boolean;
  onLinked: () => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(mangaTitle);
  const [results, setResults] = useState<TrackerSearchResult[]>([]);
  const [selected, setSelected] = useState<TrackerSearchResult>();
  const [privateTrack, setPrivateTrack] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState<"search" | "bind" | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const search = async () => {
    const request = ++generation.current; setBusy("search"); setError(""); setSelected(undefined);
    try {
      const found = await searchTrackerWorks(backend, mangaId, trackerId, query);
      if (request === generation.current) { setResults(found); setSearched(true); }
    } catch (failure) { if (request === generation.current) setError(trackingErrorMessage(failure)); }
    finally { if (request === generation.current) setBusy(null); }
  };
  const bind = async () => {
    if (!selected || busy) return;
    const request = ++generation.current; setBusy("bind"); setError("");
    try {
      await bindTrackerWork(backend, mangaId, trackerId, selected, privateTrack);
      if (request === generation.current) onLinked();
    } catch (failure) { if (request === generation.current) setError(trackingErrorMessage(failure)); }
    finally { if (request === generation.current) setBusy(null); }
  };
  return <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <label className="block text-xs text-slate-300">Search tracker works<input className="yomi-field mt-2 w-full" value={query} onChange={(event) => setQuery(event.target.value)} disabled={!!busy} /></label>
      <div className="flex gap-2"><button type="submit" disabled={!!busy || !query.trim()} className="yomi-button yomi-button-secondary">{busy === "search" ? <Loader2 className="animate-spin" /> : <Search />}Search tracker</button><button type="button" disabled={busy === "bind"} onClick={() => { generation.current += 1; onClose(); }} className="yomi-button yomi-button-secondary">Cancel</button></div>
    </form>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    <div className="max-h-72 space-y-2 overflow-y-auto" aria-label="Tracker search results">{results.map((work) => <button type="button" key={`${work.trackerId}:${String(work.remoteId)}`} aria-pressed={selected?.remoteId === work.remoteId} disabled={!!busy} onClick={() => { setSelected(work); setPrivateTrack(work.private); }} className={`flex w-full gap-3 rounded-lg border p-3 text-left ${selected?.remoteId === work.remoteId ? "border-yomi-jade bg-yomi-jade/10" : "border-white/10 bg-ink-900/30"}`}>
      <img src={trackerExternalUrl(work.coverUrl, backend.serverBaseUrl) || "/placeholder-cover.svg"} alt="" className="h-16 w-11 rounded object-cover" />
      <span className="min-w-0"><span className="block text-sm font-semibold text-slate-200">{work.title}</span><span className="mt-1 block text-xs text-slate-400">{work.totalChapters || "Unknown"} chapters · {work.publishingType} · {work.publishingStatus}</span>{work.summary && <span className="mt-1 line-clamp-3 block text-xs text-slate-400">{work.summary}</span>}</span>
    </button>)}</div>
    {searched && !results.length && <p className="text-xs text-slate-400">No matching tracker works found. Refine the title and search again.</p>}
    {selected && <div className="space-y-3 rounded-lg border border-white/10 p-3"><p className="text-xs text-slate-300">Selected: <strong>{selected.title}</strong></p>
      {supportsPrivate && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={privateTrack} disabled={!!busy} onChange={(event) => setPrivateTrack(event.target.checked)} />Private tracker entry</label>}
      <button type="button" disabled={!!busy} onClick={() => void bind()} className="yomi-button yomi-button-primary">{busy === "bind" && <Loader2 className="animate-spin" />}Link selected work</button>
    </div>}
  </div>;
}
