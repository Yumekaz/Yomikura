import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { createGraphqlClient } from "../../api/graphql/client";
import { cancelCleanupJobs, getCleanupJobs } from "../../api/suwayomi/cleanupStorage";
import { runDownloadCleanup } from "../../api/suwayomi/downloadCleanup";
import { ThemedSelect } from "../ui/ThemedSelect";
export function CleanupSettingsPanel() {
  const store = useSettingsStore(), preferences = store.experience.downloads;
  const backend = useMemo(() => progressBackend(store.serverBaseUrl, store.mockMode), [store.serverBaseUrl, store.mockMode]);
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live"), [backend]);
  const categories = useQuery({ queryKey: ["categories", store.serverBaseUrl, store.mockMode], queryFn: () => sdk.GetCategories(), retry: false });
  const jobs = useQuery({ queryKey: ["download-cleanup", backend.key], queryFn: () => getCleanupJobs(backend), retry: false });
  const excluded = preferences.excludedCategories[backend.key] ?? [];
  const collections = categories.data?.categories.nodes ?? [];
  const choices = collections.some((category) => category.id === 0) ? collections : [{ id: 0, name: "Uncategorized" }, ...collections];
  const patch = (value: Partial<typeof preferences>) => store.updateExperience((current) => ({ downloads: { ...current.downloads, ...value } }));
  useEffect(() => { void runDownloadCleanup(backend).catch(() => undefined); }, [backend, preferences, store.autoDeleteReadChapters]);
  return <section className="yomi-reader-preferences" aria-labelledby="download-cleanup-title"><h2 id="download-cleanup-title">Finished downloads</h2><p>Cleanup runs while Yomikura is open, after reading progress is confirmed. Unread or changed chapters stay safe.</p>
    <label className="yomi-preference-toggle"><span><strong>Remove finished downloads automatically</strong></span><input aria-label="Remove finished downloads automatically" type="checkbox" checked={store.autoDeleteReadChapters} onChange={(event) => store.setAutoDeleteReadChapters(event.target.checked)} /></label>
    <label className="yomi-preference-toggle"><span><strong>Also remove downloads after marking chapters read</strong></span><input aria-label="Also remove downloads after marking chapters read" type="checkbox" checked={preferences.removeAfterMarkedRead} onChange={(event) => { patch({ removeAfterMarkedRead: event.target.checked }); if (!event.target.checked) void cancelCleanupJobs("manual").catch(() => undefined); }} /></label>
    <label className="yomi-preference-toggle"><span><strong>Keep bookmarked chapters</strong></span><input aria-label="Keep bookmarked chapters" type="checkbox" checked={preferences.keepBookmarked} onChange={(event) => patch({ keepBookmarked: event.target.checked })} /></label>
    <div className="yomi-preference-grid"><label className="yomi-preference-choice">Keep recent completed chapters<ThemedSelect aria-label="Keep recent completed chapters" value={preferences.keepRecentChapters} onValueChange={(value) => patch({ keepRecentChapters: Number(value) })}>{Array.from({ length: 21 }, (_, index) => <option key={index} value={index}>{index === 0 ? "Remove the completed chapter" : `Keep ${index}`}</option>)}</ThemedSelect></label><label className="yomi-preference-choice">Wait before removing files<ThemedSelect aria-label="Wait before removing files" value={preferences.cleanupDelayHours} onValueChange={(value) => patch({ cleanupDelayHours: Number(value) })}>{[...new Set([0, 1, 24, 72, 168, preferences.cleanupDelayHours])].sort((a, b) => a - b).map((hours) => <option key={hours} value={hours}>{hours === 0 ? "No extra delay" : `${hours} hour${hours === 1 ? "" : "s"}`}</option>)}</ThemedSelect></label></div>
    <fieldset className="mt-4 border-t border-white/10 pt-4"><legend className="pr-3 text-sm text-slate-300">Keep downloads from these collections</legend>{categories.isError ? <p className="text-xs text-slate-400">Collections couldn’t be loaded. Your existing exclusions are kept.</p> : <div className="mt-3 flex flex-wrap gap-4">{choices.map((category) => <label key={category.id} className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={excluded.includes(category.id)} onChange={(event) => { const ids = event.target.checked ? [...excluded, category.id] : excluded.filter((id) => id !== category.id); store.updateExperience((current) => ({ downloads: { ...current.downloads, excludedCategories: { ...current.downloads.excludedCategories, [backend.key]: ids } } })); }} />{category.name}</label>)}</div>}</fieldset>
    <p className="!mb-0 mt-4 text-xs" role="status">{jobs.isError ? "Pending cleanup couldn’t be checked. Files are kept until they can be verified." : `${jobs.data?.length ?? 0} chapter${jobs.data?.length === 1 ? "" : "s"} waiting for cleanup.`}</p>
  </section>;
}
