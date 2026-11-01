import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import { createGraphqlClient } from "../../api/graphql/client";
import { isSelectedLibrary } from "../../api/suwayomi/libraryUpdateState";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { IncludeOrExclude } from "../../api/graphql/generated/graphql";
import type { GetLibraryPolicyQuery, PartialSettingsTypeInput, UpdateCategoryPatchInput } from "../../api/graphql/generated/graphql";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { ThemedSelect } from "../ui/ThemedSelect";
import { LibraryUpdateButton } from "../library/LibraryUpdateButton";
type PolicyPatch = Pick<PartialSettingsTypeInput, "globalUpdateInterval" | "excludeUnreadChapters" | "excludeNotStarted" | "excludeCompleted" | "updateMangas">;
type Collection = GetLibraryPolicyQuery["categories"]["nodes"][number];
export function LibrarySettingsPanel() {
  const backend = useProgressBackend();
  return backend ? <LibraryPolicyEditor key={backend.key} backend={backend} /> : <p className="text-sm text-slate-400">Connect a library in <Link className="yomi-text-link" to="/settings/connection">Connection settings</Link> to manage its collections and updates.</p>;
}
function LibraryPolicyEditor({ backend }: { backend: ProgressBackend }) {
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live"), [backend]);
  const client = useQueryClient(), store = useSettingsStore(), [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["library-policy", backend.key], queryFn: ({ signal }) => sdk.GetLibraryPolicy(undefined, undefined, signal), retry: false });
  const policy = useMutation({ mutationFn: async (patch: PolicyPatch) => {
    if (!isSelectedLibrary(backend)) throw new Error("Library changed");
    const settings = (await sdk.SetLibraryPolicy({ input: { settings: patch } }, undefined, AbortSignal.timeout(15000))).setSettings.settings;
    if (Object.entries(patch).some(([key, value]) => settings[key as keyof typeof settings] !== value)) throw new Error("Unconfirmed policy");
    return settings;
  }, onSuccess: (settings) => {
    client.setQueryData<GetLibraryPolicyQuery>(["library-policy", backend.key], (previous) => previous ? { ...previous, settings } : previous);
    void client.invalidateQueries({ queryKey: ["server-settings"] });
    if (isSelectedLibrary(backend)) setMessage("Library update preferences saved.");
  }, onError: () => { if (isSelectedLibrary(backend)) setMessage("Your library couldn’t confirm this change. The previous value is kept; try again when connected."); } });
  const collection = useMutation({ mutationFn: async ({ id, patch }: { id: number; patch: UpdateCategoryPatchInput }) => {
    if (!isSelectedLibrary(backend)) throw new Error("Library changed");
    const saved = (await sdk.SetCollectionPolicy({ input: { id, patch } }, undefined, AbortSignal.timeout(15000))).updateCategory?.category;
    if (!saved || saved.id !== id || Object.entries(patch).some(([key, value]) => saved[key as keyof Collection] !== value)) throw new Error("Unconfirmed collection");
    return saved;
  }, onSuccess: (saved) => {
    client.setQueryData<GetLibraryPolicyQuery>(["library-policy", backend.key], (previous) => previous ? { ...previous, categories: { ...previous.categories, nodes: previous.categories.nodes.map((item) => item.id === saved.id ? saved : item) } } : previous);
    void client.invalidateQueries({ queryKey: ["categories"] });
    if (isSelectedLibrary(backend)) setMessage("Collection preferences saved.");
  }, onError: () => { if (isSelectedLibrary(backend)) setMessage("The collection change wasn’t confirmed. Your previous choices are kept."); } });
  const settings = query.data?.settings;
  const change = (patch: PolicyPatch) => { setMessage(""); policy.mutate(patch); };
  const choices: [IncludeOrExclude, string][] = [[IncludeOrExclude.Unset, "Follow library defaults"], [IncludeOrExclude.Include, "Include"], [IncludeOrExclude.Exclude, "Exclude"]];
  const run = store.experience.libraryUpdateRuns[backend.key];
  return <div className="space-y-6"><section className="yomi-reader-preferences" aria-labelledby="library-policy-title"><h2 id="library-policy-title">Library updates</h2><p>Choose which books are checked and how often. These preferences belong to the connected library, including its other devices.</p><LibraryUpdateButton />
    {query.isPending ? <p role="status">Loading library preferences…</p> : query.isError || !settings ? <div><p>These preferences couldn’t be loaded. Check your connection; an older library engine may need an update.</p><button className="yomi-button yomi-button-secondary" onClick={() => void query.refetch()}>Retry library preferences</button></div> : <>
      <label className="yomi-preference-choice mt-5">Library automatic checks<ThemedSelect aria-label="Library automatic checks" disabled={policy.isPending} value={settings.globalUpdateInterval} onValueChange={(value) => change({ globalUpdateInterval: Number(value) })}>{[...new Set([0, 6, 12, 24, 48, settings.globalUpdateInterval])].sort((a, b) => a - b).map((hours) => <option key={hours} value={hours}>{hours === 0 ? "Off" : `Every ${hours} hours`}</option>)}</ThemedSelect></label><p className="!mt-2 text-xs">Runs while the library engine is running, even if this window is closed.</p>
      {([["excludeUnreadChapters", "Skip books with unread chapters", "Only check books whose available chapters are caught up."], ["excludeNotStarted", "Skip books without reading activity", "Uses the library’s recorded last-read time."], ["excludeCompleted", "Skip completed publications", "Reading completion and publication status are separate."], ["updateMangas", "Refresh book information during updates", "Also fetch titles, descriptions and other source metadata."]] as const).map(([key, label, detail]) => <label key={key} className="yomi-preference-toggle"><span><strong>{label}</strong><small>{detail}</small></span><input aria-label={label} disabled={policy.isPending} type="checkbox" checked={settings[key]} onChange={(event) => change({ [key]: event.target.checked })} /></label>)}
    </>}
    {(message || policy.isPending || collection.isPending) && <p className="!mb-0 mt-4 text-sm" role="status">{policy.isPending || collection.isPending ? "Saving library preferences…" : message}</p>}
    <label className="yomi-preference-toggle"><span><strong>Mark existing duplicate editions read</strong><small>Completing a numbered chapter also marks its matching editions read in this book. Explicit unread resets are kept; other editions gain no reading-history entry.</small></span><input type="checkbox" aria-label="Mark existing duplicate editions read" checked={store.experience.duplicateReadLibraries[backend.key] === true} onChange={(event) => store.updateExperience((current) => ({ duplicateReadLibraries: { ...current.duplicateReadLibraries, [backend.key]: event.target.checked } }))} /></label>
    </section>
    {query.data && <section className="yomi-reader-preferences" aria-labelledby="collection-rules-title"><h2 id="collection-rules-title">Collection rules</h2><p>Included collections take priority over those following defaults. A book in an excluded collection stays excluded from automatic updates.</p><div className="space-y-5">{query.data.categories.nodes.map((item) => <fieldset key={item.id} className="rounded-xl border border-white/10 p-4"><legend className="px-2 text-sm font-semibold text-slate-200">{item.name}</legend>{item.id === 0 ? <p className="text-sm text-slate-400">Uncategorized books follow the library defaults.</p> : <><label className="mb-4 flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" aria-label={`Add new books to ${item.name} by default`} disabled={collection.isPending} checked={item.default} onChange={(event) => collection.mutate({ id: item.id, patch: { default: event.target.checked } })} />Add new books here by default</label><div className="yomi-preference-grid">{([["includeInUpdate", "Automatic updates"], ["includeInDownload", "New-chapter downloads"]] as const).map(([key, title]) => <label key={key} className="yomi-preference-choice">{title}<ThemedSelect aria-label={`${title} for ${item.name}`} disabled={collection.isPending} value={item[key]} onValueChange={(value) => collection.mutate({ id: item.id, patch: { [key]: value as IncludeOrExclude } })}>{choices.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</ThemedSelect></label>)}</div></>}</fieldset>)}</div></section>}
    <section className="yomi-reader-preferences" aria-labelledby="client-checks-title"><h2 id="client-checks-title">Extra checks while Yomikura is open</h2><p>Optional checks for the active library. Its own automatic schedule remains separate.</p><label className="yomi-preference-choice">Check active library<ThemedSelect aria-label="Extra checks while Yomikura is open" value={store.libraryUpdateIntervalHours} onValueChange={(value) => store.setLibraryUpdateIntervalHours(Number(value))}><option value={0}>Off</option><option value={6}>Every 6 hours</option><option value={12}>Every 12 hours</option><option value={24}>Daily</option></ThemedSelect></label><p className="!mb-0 mt-3 text-xs" role="status">{run?.status === "running" ? "Requesting a library check…" : run?.status === "error" ? "The last request failed. It will retry when connected." : run?.requestedAt ? `Last request: ${new Date(run.requestedAt).toLocaleString()}` : "No extra check requested for this library yet."}</p></section>
  </div>;
}
