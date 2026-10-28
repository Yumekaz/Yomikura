import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createGraphqlClient } from "../../api/graphql/client";
import { progressBackend, type ProgressBackend } from "../../api/suwayomi/backendIdentity";
import type { PartialSettingsTypeInput } from "../../api/graphql/generated/graphql";
import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import type { DownloadExperience } from "../../stores/downloadExperience";
import { isUnmetered } from "../../api/suwayomi/networkPolicy";
import { useConnectionInformation } from "../../hooks/useConnectionInformation";
import { ThemedSelect } from "../ui/ThemedSelect";
import { CleanupSettingsPanel } from "./CleanupSettingsPanel";

type LibraryDownloadPatch = Pick<PartialSettingsTypeInput, "downloadAsCbz" | "maxSourcesInParallel" | "autoDownloadNewChapters" | "autoDownloadNewChaptersLimit" | "excludeEntryWithUnreadChapters" | "autoDownloadIgnoreReUploads">;
const stillSelected = (backend: ProgressBackend) => { try { const state = useSettingsStore.getState(); return progressBackend(state.serverBaseUrl, state.mockMode).key === backend.key; } catch { return false; } };
export function DownloadSettingsPanel() {
  const store = useSettingsStore(); const preferences = store.experience.downloads;
  const deviceCopies = isTauri() || store.mockMode;
  const network = useConnectionInformation();
  const patch = (value: Partial<DownloadExperience>) => store.updateExperience((current) => ({ downloads: { ...current.downloads, ...value } }));
  return <div className="space-y-6">
    <section className="yomi-reader-preferences" aria-labelledby="download-data-title"><h2 id="download-data-title">Downloads and data use</h2><p>Keep chapters close, with control over background loading.</p>
      <label className="yomi-preference-toggle"><span><strong>Save device copies on unmetered connections only</strong><small>{deviceCopies ? "Wait before starting or fetching more pages. An in-flight page may finish." : "Device copies are available in the desktop app. Browser downloads are saved by your library."}</small></span><input type="checkbox" aria-label="Save device copies on unmetered connections only" disabled={!deviceCopies} checked={preferences.unmeteredOnly} onChange={(event) => patch({ unmeteredOnly: event.target.checked })} /></label>
      <label className="yomi-preference-toggle"><span><strong>Load ahead on unmetered connections only</strong><small>On other connections, vertical reading loads only the pages in view.</small></span><input type="checkbox" aria-label="Load ahead on unmetered connections only" checked={preferences.preloadUnmeteredOnly} onChange={(event) => patch({ preloadUnmeteredOnly: event.target.checked })} /></label>
      <div className="yomi-preference-grid"><label className="yomi-preference-choice">Connection cost<ThemedSelect aria-label="Connection cost" value={preferences.connectionCost} onValueChange={(value) => patch({ connectionCost: value as DownloadExperience["connectionCost"] })}><option value="automatic">Detect automatically</option><option value="metered">Treat as metered</option><option value="unmetered">Treat as unmetered</option></ThemedSelect></label><label className="yomi-preference-choice">Pages to load ahead<ThemedSelect aria-label="Pages to load ahead" value={preferences.preloadPages} onValueChange={(value) => patch({ preloadPages: Number(value) })}>{Array.from({ length: 11 }, (_, index) => index).map((count) => <option key={count} value={count}>{count === 0 ? "None" : count}</option>)}</ThemedSelect></label></div>
      <p className="!mb-0 text-xs" role="status">{preferences.connectionCost === "automatic" && !network.connection?.type ? "Your browser doesn’t report connection cost. Choose a type above if you use an unmetered-only option." : `This connection is treated as ${isUnmetered(preferences, network.connection) ? "unmetered" : "metered"}.`}</p>
      {deviceCopies && <div className="yomi-preference-grid"><label className="yomi-preference-choice">Device chapters at once<ThemedSelect aria-label="Device chapters at once" value={store.downloadConcurrency} onValueChange={(value) => store.setDownloadConcurrency(Number(value))}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</ThemedSelect></label><label className="yomi-preference-choice">Pages at once per device chapter<ThemedSelect aria-label="Pages at once per device chapter" value={preferences.pageConcurrency} onValueChange={(value) => patch({ pageConcurrency: Number(value) })}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}</ThemedSelect></label></div>}
      <div className="yomi-preference-grid"><label className="yomi-preference-choice">Download ahead while reading<ThemedSelect aria-label="Download ahead while reading" value={store.autoDownloadCount} onValueChange={(value) => store.setAutoDownloadCount(Number(value))}>{[0, 1, 3, 5, 10].map((count) => <option key={count} value={count}>{count === 0 ? "Disabled" : `${count} chapter${count === 1 ? "" : "s"}`}</option>)}</ThemedSelect></label></div><p className="!mb-0 text-xs">Download-ahead starts when the current chapter and the next one are already saved. It follows the chosen scanlator and duplicate-edition rules.</p>
    </section>
    <CleanupSettingsPanel />
    <LibraryDownloadSettings />
  </div>;
}
function LibraryDownloadSettings() {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live"), [backend]);
  const client = useQueryClient(); const [message, setMessage] = useState("");
  useEffect(() => setMessage(""), [backend.key]);
  const query = useQuery({ queryKey: ["library-download-preferences", backend.key], queryFn: ({ signal }) => sdk.GetServerDownloadPreferences(undefined, undefined, signal), retry: false });
  const mutation = useMutation({ mutationFn: async ({ backend, patch }: { backend: ProgressBackend; patch: LibraryDownloadPatch }) => {
    const captured = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live");
    const result = (await captured.SetServerDownloadPreferences({ input: { settings: patch } })).setSettings.settings;
    if (Object.entries(patch).some(([key, value]) => result[key as keyof typeof result] !== value)) throw new Error("The library did not confirm the change.");
    return result;
  }, onSuccess: (settings, { backend }) => { client.setQueryData(["library-download-preferences", backend.key], { settings }); if (stillSelected(backend)) setMessage("Library download preferences saved."); }, onError: (_error, { backend }) => { if (stillSelected(backend)) setMessage("The library couldn’t save this change. Check the connection and try again."); } });
  const change = (patch: LibraryDownloadPatch) => { setMessage(""); mutation.mutate({ backend, patch }); };
  const savedSettings = query.data?.settings;
  const settings = savedSettings && mutation.isPending && mutation.variables?.backend.key === backend.key ? { ...savedSettings, ...mutation.variables.patch } : savedSettings;
  return <section className="yomi-reader-preferences" aria-labelledby="library-download-preferences-title"><h2 id="library-download-preferences-title">Library downloads</h2><p>These choices affect files saved by the connected library. Device copies keep their own pages.</p>{query.isPending ? <p role="status">Loading library options…</p> : query.isError || !settings ? <div className="space-y-3"><p>These options couldn’t be loaded. Check the connection; some libraries may need an engine update.</p><button className="yomi-button yomi-button-secondary" onClick={() => void query.refetch()}>Retry library download options</button><Link className="yomi-text-link ml-3 text-sm" to="/settings/connection">Connection settings</Link></div> : <>
      {typeof settings.downloadAsCbz === "boolean" && <label className="yomi-preference-toggle"><span><strong>Save library downloads as CBZ archives</strong><small>Applies to new library downloads.</small></span><input type="checkbox" aria-label="Save library downloads as CBZ archives" disabled={mutation.isPending} checked={settings.downloadAsCbz} onChange={(event) => change({ downloadAsCbz: event.target.checked })} /></label>}
      {typeof settings.maxSourcesInParallel === "number" && <div className="yomi-preference-grid"><label className="yomi-preference-choice">Library sources at once<ThemedSelect aria-label="Library sources at once" disabled={mutation.isPending} value={settings.maxSourcesInParallel} onValueChange={(value) => change({ maxSourcesInParallel: Number(value) })}>{Array.from({ length: 20 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}</ThemedSelect></label></div>}
      {typeof settings.autoDownloadNewChapters === "boolean" && <label className="yomi-preference-toggle"><span><strong>Download new chapters automatically</strong><small>When library updates find chapters from books you follow.</small></span><input type="checkbox" aria-label="Download new chapters automatically" disabled={mutation.isPending} checked={settings.autoDownloadNewChapters} onChange={(event) => change(event.target.checked ? { autoDownloadNewChapters: true, autoDownloadNewChaptersLimit: (settings.autoDownloadNewChaptersLimit ?? 0) > 0 ? settings.autoDownloadNewChaptersLimit : 5 } : { autoDownloadNewChapters: false })} /></label>}
      {settings.autoDownloadNewChapters && <><div className="yomi-preference-grid"><label className="yomi-preference-choice">New chapters per book<ThemedSelect aria-label="New chapters per book" disabled={mutation.isPending} value={settings.autoDownloadNewChaptersLimit ?? 0} onValueChange={(value) => change({ autoDownloadNewChaptersLimit: Number(value) })}><option value={0} disabled>Choose a limit</option>{[...new Set([1, 3, 5, 10, 20, 50, 100, settings.autoDownloadNewChaptersLimit ?? 0])].filter((count) => count > 0).sort((a, b) => a - b).map((count) => <option key={count} value={count}>{count}</option>)}</ThemedSelect></label></div>{typeof settings.excludeEntryWithUnreadChapters === "boolean" && <label className="yomi-preference-toggle"><span><strong>Skip books with an unread backlog</strong></span><input type="checkbox" aria-label="Skip books with an unread backlog" disabled={mutation.isPending} checked={settings.excludeEntryWithUnreadChapters} onChange={(event) => change({ excludeEntryWithUnreadChapters: event.target.checked })} /></label>}{typeof settings.autoDownloadIgnoreReUploads === "boolean" && <label className="yomi-preference-toggle"><span><strong>Skip re-uploaded chapters</strong></span><input type="checkbox" aria-label="Skip re-uploaded chapters" disabled={mutation.isPending} checked={settings.autoDownloadIgnoreReUploads} onChange={(event) => change({ autoDownloadIgnoreReUploads: event.target.checked })} /></label>}</>}
      {(mutation.isPending || message) && <p className="!mb-0 text-xs" role="status">{mutation.isPending ? "Saving library options…" : message}</p>}
    </>}</section>;
}
