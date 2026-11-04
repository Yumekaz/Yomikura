import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGraphqlClient } from "../../api/graphql/client";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import { isSelectedLibrary } from "../../api/suwayomi/libraryUpdateState";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { ThemedSelect } from "../../components/ui/ThemedSelect";
type Field = { __typename: string; key?: string | null; title?: string | null; summary?: string | null; enabled?: boolean; visible?: boolean; valueBool?: boolean | null; defaultBool?: boolean | null; valueString?: string | null; defaultString?: string | null; valueStrings?: string[] | null; defaultStrings?: string[] | null; entries?: string[]; entryValues?: string[] };
type Value = boolean | string | string[];
const valueOf = (field: Field): Value => field.__typename === "MultiSelectListPreference" ? field.valueStrings ?? field.defaultStrings ?? [] : ["SwitchPreference", "CheckBoxPreference"].includes(field.__typename) ? field.valueBool ?? field.defaultBool ?? false : field.valueString ?? field.defaultString ?? "";
const equal = (a: Value, b: Value) => Array.isArray(a) && Array.isArray(b) ? JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort()) : a === b;
export default function SourcePrefsPage() {
  const { sourceId } = useParams<{ sourceId: string }>(), backend = useProgressBackend();
  return backend && sourceId ? <SourcePreferences key={`${backend.key}:${sourceId}`} backend={backend} sourceId={sourceId} /> : <p>Connect a library to open source settings.</p>;
}
function SourcePreferences({ backend, sourceId }: { backend: ProgressBackend; sourceId: string }) {
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live"), [backend]);
  const client = useQueryClient(), key = ["source-preferences", sourceId, backend.key];
  const [drafts, setDrafts] = useState<Record<number, string>>({}), [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => sdk.GetSourcePreferences({ sourceId }, undefined, AbortSignal.any([signal, AbortSignal.timeout(15000)])), retry: false });
  const update = useMutation({ mutationFn: async ({ index, field, value }: { index: number; field: Field; value: Value }) => {
    const selected = () => { if (!isSelectedLibrary(backend)) throw new Error("Library changed"); }; selected();
    const fresh = await sdk.GetSourcePreferences({ sourceId }, undefined, AbortSignal.timeout(15000)); selected();
    const current = fresh.source.preferences[index] as Field;
    if (!current || JSON.stringify([current.__typename, current.key, current.title]) !== JSON.stringify([field.__typename, field.key, field.title]) || !current.enabled || !current.visible) throw new Error("Source settings changed");
    const fieldName = ({ CheckBoxPreference: "checkBoxState", SwitchPreference: "switchState", EditTextPreference: "editTextState", ListPreference: "listState", MultiSelectListPreference: "multiSelectState" } as Record<string, string>)[field.__typename];
    if (!fieldName) throw new Error("Unsupported preference");
    const saved = (await sdk.UpdateSourcePreference({ input: { source: sourceId, change: { position: index, [fieldName]: value } } }, undefined, AbortSignal.timeout(15000))).updateSourcePreference;
    if (!saved) throw new Error("Unconfirmed source preference");
    const confirmed = saved.preferences[index] as Field;
    if (String(saved.source.id) !== sourceId || confirmed?.__typename !== field.__typename || confirmed.key !== field.key || !equal(valueOf(confirmed), value)) throw new Error("Unconfirmed source preference");
    return index;
  }, onSuccess: (index) => { setDrafts((previous) => { const next = { ...previous }; delete next[index]; return next; }); void client.invalidateQueries({ queryKey: key }); } });
  const fields = query.data?.source.preferences as Field[] | undefined;
  return <div className="yomi-workspace max-w-4xl"><div className="yomi-workspace-head"><div><Link className="yomi-text-link text-xs" to="/browse/sources">Back to sources</Link><h1>{query.data?.source.name ?? "Source settings"}</h1><p>Preferences supplied by this source.</p></div></div>
    {query.isPending ? <p role="status">Opening source settings…</p> : query.isError ? <p role="alert">Source preferences couldn’t be loaded. <button className="yomi-text-link" onClick={() => void query.refetch()}>Retry</button></p> : <section className="yomi-surface p-5 sm:p-6" aria-label="Source preferences">
      {fields?.map((field, index) => {
        if (!field.visible) return null; const title = field.title || field.key || `Setting ${index + 1}`, value = valueOf(field), disabled = !field.enabled || update.isPending;
        const save = (value: Value) => update.mutate({ index, field, value });
        const sensitive = /password|token|secret|key|auth/i.test(`${field.key ?? ""} ${title}`);
        return <div key={`${field.key}:${index}`} className="border-b border-white/10 py-5 first:pt-0 last:border-0 last:pb-0"><h2 className="text-sm font-semibold text-slate-200">{title}</h2>{field.summary && <p className="mt-2 text-xs leading-6 text-slate-400">{field.summary}</p>}
          {typeof value === "boolean" ? <label className="mt-3 flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" aria-label={title} checked={value} disabled={disabled} onChange={(event) => save(event.target.checked)} />{value ? "On" : "Off"}</label>
          : Array.isArray(value) ? <fieldset className="mt-3 flex flex-wrap gap-4" disabled={disabled} aria-label={title}>{field.entries?.map((entry, option) => { const id = field.entryValues?.[option] ?? entry; return <label key={id} className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={value.includes(id)} onChange={(event) => save(event.target.checked ? [...value, id] : value.filter((item) => item !== id))} />{entry}</label>; })}</fieldset>
          : field.__typename === "ListPreference" ? <ThemedSelect className="yomi-field mt-3 max-w-sm" aria-label={title} value={value} disabled={disabled} onValueChange={save}>{field.entries?.map((entry, option) => <option key={option} value={field.entryValues?.[option] ?? entry}>{entry}</option>)}</ThemedSelect>
          : <div className="mt-3 flex flex-wrap gap-2"><input className="yomi-field min-w-0 flex-1" aria-label={title} type={sensitive && !revealed[index] ? "password" : "text"} value={drafts[index] ?? value} disabled={disabled} onChange={(event) => setDrafts({ ...drafts, [index]: event.target.value })} />{sensitive && <button className="yomi-button yomi-button-secondary" onClick={() => setRevealed({ ...revealed, [index]: !revealed[index] })}>{revealed[index] ? "Hide" : "Show"} {title}</button>}<button className="yomi-button yomi-button-secondary" disabled={disabled || drafts[index] === undefined} onClick={() => save(drafts[index])}>Save {title}</button></div>}
        </div>;
      })}{!fields?.some((field) => field.visible) && <p className="text-sm text-slate-400">This source has no configurable preferences.</p>}
    </section>}
    {update.isPending && <p role="status" className="mt-4 text-sm text-slate-400">Saving source preference…</p>}{update.isError && <p role="alert" className="mt-4 text-sm text-red-300">The change wasn’t confirmed. Your draft is kept; reload the source’s current preferences before trying again.</p>}{update.isSuccess && !update.isPending && <p role="status" className="mt-4 text-sm text-slate-400">Source preference confirmed.</p>}
  </div>;
}
