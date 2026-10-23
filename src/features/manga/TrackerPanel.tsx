import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Link2Off, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { createGraphqlClient } from "../../api/graphql/client";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { editTrackerRecord, synchronizeLinkedTrackersNow, trackerExternalUrl, unlinkTrackerRecord, type BoundTrackerRecord } from "../../api/suwayomi/trackingActions";
import { synchronizeTracking } from "../../api/suwayomi/trackingSync";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { TrackerWorkSearch } from "./TrackerWorkSearch";
import { TrackerEditForm } from "./TrackerEditForm";

export function TrackerPanel({ mangaId, mangaTitle }: { mangaId: number; mangaTitle: string }) {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live"), [backend]);
  const client = useQueryClient();
  const { notify } = useFeedback();
  const [editing, setEditing] = useState<BoundTrackerRecord>();
  const [searchingTracker, setSearchingTracker] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1; setEditing(undefined); setSearchingTracker(undefined); setBusy(false); setErrorMsg("");
    return () => { generation.current += 1; };
  }, [backend.key, mangaId]);
  const key = ["manga-trackers", mangaId, backend.key];
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: key, queryFn: () => sdk.GetMangaTrackers({ mangaId }), enabled: !!serverBaseUrl });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const run = async (action: () => Promise<unknown>, success?: () => void) => {
    const request = generation.current; setBusy(true); setErrorMsg("");
    try { await action(); if (request === generation.current) success?.(); }
    catch (failure) { if (request === generation.current) setErrorMsg(getErrorMessage(failure)); }
    finally { await refresh(); if (request === generation.current) setBusy(false); }
  };
  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-yomi-jade" /></div>;
  if (isError) return <div className="rounded-xl border border-white/10 bg-ink-900 p-4 text-center"><p role="alert" className="text-sm text-red-300">Trackers could not be loaded: {getErrorMessage(error)}</p><button type="button" onClick={() => void refetch()} className="yomi-button yomi-button-secondary mt-3"><RefreshCw />Retry trackers</button></div>;
  const trackers = data?.trackers.nodes ?? [];
  const records = data?.manga.trackRecords.nodes ?? [];
  return <section aria-label="Tracking" className="mt-6 space-y-4 rounded-xl border border-white/5 bg-ink-900 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold text-slate-100">Tracking</h3><p className="mt-1 text-xs text-slate-400">Link the matching work and synchronize completed chapters with your trackers.</p></div>
      {!!records.length && <button type="button" disabled={busy} onClick={() => void run(async () => {
        const result = await synchronizeLinkedTrackersNow(backend, mangaId);
        if (result.confirmed) notify("Linked tracker progress was confirmed.", "success");
      })} className="yomi-button yomi-button-secondary"><RefreshCw className={busy ? "animate-spin" : ""} />Sync linked trackers</button>}
    </div>
    {errorMsg && <p role="alert" className="text-xs text-red-300">{errorMsg}</p>}
    <div className="grid gap-4 sm:grid-cols-2">{trackers.map((tracker) => {
      const record = records.find((item) => item.trackerId === tracker.id);
      const loggedIn = tracker.isLoggedIn && !tracker.isTokenExpired;
      const authUrl = trackerExternalUrl(tracker.authUrl, backend.serverBaseUrl);
      const remoteUrl = trackerExternalUrl(record?.remoteUrl, backend.serverBaseUrl);
      return <section key={tracker.id} aria-label={tracker.name} className="flex flex-col rounded-lg border border-white/5 bg-ink-950/40 p-4">
        <div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200">{tracker.icon ? <img src={trackerExternalUrl(tracker.icon, backend.serverBaseUrl)} alt="" className="h-5 w-5 rounded object-cover" /> : <Link2 className="h-5 w-5" />}{tracker.name}</h4>
          {!loggedIn ? authUrl ? <a href={authUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-yomi-jade underline">{tracker.isTokenExpired ? "Sign in again" : "Login"}<ExternalLink className="ml-1 inline h-3 w-3" /></a> : <Link to="/settings/advanced" className="text-xs text-yomi-jade underline">Tracker settings</Link>
            : record ? <span className="rounded bg-yomi-jade/10 px-2 py-0.5 text-xs font-semibold text-yomi-jade">Linked</span> : <button type="button" aria-label={`Link ${tracker.name}`} disabled={busy} onClick={() => { setSearchingTracker(tracker.id); setEditing(undefined); setErrorMsg(""); }} className="yomi-button yomi-button-primary">Link Track</button>}
        </div>
        {record && <div className="mt-4 space-y-3 border-t border-white/5 pt-3">
          {editing?.id === record.id ? <TrackerEditForm key={editing.id} record={editing} tracker={tracker} busy={busy} onCancel={() => setEditing(undefined)} onSave={(patch) => void run(() => editTrackerRecord(backend, mangaId, editing, patch), () => setEditing(undefined))} /> : <>
            <div className="space-y-1 text-xs text-slate-400"><p>Title: {remoteUrl ? <a href={remoteUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-200 underline">{record.title}</a> : <strong className="text-slate-200">{record.title}</strong>}</p><p>Status: <strong className="text-slate-200">{tracker.statuses.find((item) => item.value === record.status)?.name ?? "Unknown"}</strong></p><p>Score: <strong className="text-slate-200">{record.displayScore || record.score || "No score"}</strong></p><p>Progress: <strong className="text-slate-200">{record.lastChapterRead} / {record.totalChapters || "?"}</strong></p>{record.private && <p>Private tracker entry</p>}</div>
            <div className="flex gap-2"><button type="button" disabled={busy || !loggedIn} onClick={() => { setEditing(record); setSearchingTracker(undefined); setErrorMsg(""); }} className="yomi-button yomi-button-secondary">Edit</button><button type="button" aria-label={`Unlink ${tracker.name}`} disabled={busy} onClick={() => void run(() => unlinkTrackerRecord(backend, mangaId, record), () => { setEditing(undefined); void synchronizeTracking(backend, { force: true }).catch(() => undefined); })} className="yomi-icon-button danger"><Link2Off className="h-4 w-4" /></button></div>
          </>}
        </div>}
        {!record && loggedIn && searchingTracker === tracker.id && <TrackerWorkSearch key={`${backend.key}:${mangaId}:${tracker.id}`} backend={backend} mangaId={mangaId} mangaTitle={mangaTitle} trackerId={tracker.id} supportsPrivate={tracker.supportsPrivateTracking} onClose={() => setSearchingTracker(undefined)} onLinked={() => { setSearchingTracker(undefined); setErrorMsg(""); void refresh(); void synchronizeTracking(backend, { force: true }).catch(() => undefined); }} />}
      </section>;
    })}</div>
    {!trackers.length && <p className="py-4 text-center text-sm text-slate-400">No trackers are available on this server.</p>}
  </section>;
}
