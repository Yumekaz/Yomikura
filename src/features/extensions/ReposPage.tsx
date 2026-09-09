import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, CheckCircle2, Github, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { getRepositorySnapshot, saveRepositorySnapshot, validateExtensionRepositoryUrl } from "./extensionRepo";

const LEGACY_KEIYOUSHI_URLS = new Set([
  "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json",
  "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json",
  "https://github.com/keiyoushi/extensions/raw/repo/index.pb",
]);
const KEIYOUSHI_STORE_URL = "https://raw.githubusercontent.com/keiyoushi/extensions/repo/repo.json";
type Message = { kind: "success" | "error"; text: string };

export default function ReposPage() {
  const { confirm } = useFeedback();
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [repoUrl, setRepoUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState<Message | null>(null);
  const sdk = useMemo(() => createGraphqlClient(`${serverBaseUrl.replace(/\/$/, "")}/api/graphql`), [serverBaseUrl]);
  const storesQuery = useQuery({ queryKey: ["extension-stores", serverBaseUrl], queryFn: () => sdk.GetExtensionStores(), enabled: !!serverBaseUrl });
  const stores = storesQuery.data?.extensionStores?.nodes?.filter(Boolean) ?? [];
  const repositories = stores.map((store) => store.indexUrl);
  const snapshot = useMemo(() => getRepositorySnapshot(localStorage, serverBaseUrl), [serverBaseUrl, storesQuery.data]);
  const hasLegacyKeiyoushi = repositories.some((url) => LEGACY_KEIYOUSHI_URLS.has(url));
  const hasCurrentKeiyoushi = repositories.includes(KEIYOUSHI_STORE_URL) || stores.some((store) => store.name === "Keiyoushi" && !store.isLegacy && Boolean(store.signingKey));

  useEffect(() => {
    if (repositories.length) saveRepositorySnapshot(localStorage, serverBaseUrl, repositories);
  }, [repositories, serverBaseUrl]);

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["extension-stores"] });
    queryClient.invalidateQueries({ queryKey: ["extensions"] });
    queryClient.invalidateQueries({ queryKey: ["installed-ext-langs"] });
    queryClient.invalidateQueries({ queryKey: ["all-sources"] });
  };

  const addStore = useMutation({
    mutationFn: async (indexUrl: string) => {
      await sdk.AddExtensionStore({ input: { indexUrl } });
      const result = await sdk.FetchExtensionCatalog({ input: {} });
      return result.fetchExtensions?.extensions?.length ?? 0;
    },
    onSuccess: (count) => {
      refreshData();
      setRepoUrl("");
      setStatusMessage({ kind: "success", text: `Extension Store added and verified. Suwayomi discovered ${count.toLocaleString()} extensions.` });
    },
    onError: (error) => setStatusMessage({ kind: "error", text: `Could not add this Extension Store: ${error instanceof Error ? error.message : String(error)}` }),
  });
  const removeStore = useMutation({
    mutationFn: (indexUrl: string) => sdk.RemoveExtensionStore({ input: { indexUrl } }),
    onSuccess: () => { refreshData(); setStatusMessage({ kind: "success", text: "Extension Store removed. Installed extensions remain available." }); },
    onError: (error) => setStatusMessage({ kind: "error", text: `Could not remove this Extension Store: ${error instanceof Error ? error.message : String(error)}` }),
  });
  const busy = addStore.isPending || removeStore.isPending;

  const addValidatedStore = async (value: string) => {
    const validation = validateExtensionRepositoryUrl(value);
    if (!validation.valid) return setStatusMessage({ kind: "error", text: validation.message });
    if (repositories.includes(validation.url)) return;
    if (!(await confirm({ title: `Trust ${validation.host}?`, detail: "Extension Stores distribute executable source code and a signing identity. Add one only when you recognize its maintainer.", confirmLabel: "Trust and add" }))) return;
    addStore.mutate(validation.url);
  };
  const addKeiyoushi = async () => {
    if (!(await confirm({ title: hasLegacyKeiyoushi ? "Upgrade the Keiyoushi Extension Store?" : "Use the Keiyoushi Extension Store?", detail: hasLegacyKeiyoushi ? "Yomikura will add Keiyoushi's signed store descriptor. Existing installed extensions remain unchanged." : "Keiyoushi is community-maintained and not operated by Yomikura or Mihon. Verify its displayed signing identity before installing extensions.", confirmLabel: hasLegacyKeiyoushi ? "Upgrade store" : "Trust and add" }))) return;
    addStore.mutate(KEIYOUSHI_STORE_URL);
  };
  const restoreSnapshot = async () => {
    if (!snapshot) return;
    for (const repository of snapshot.repositories) {
      const replacement = LEGACY_KEIYOUSHI_URLS.has(repository) ? KEIYOUSHI_STORE_URL : repository;
      if (!repositories.includes(replacement)) await addStore.mutateAsync(replacement);
    }
  };

  return <div className="min-h-screen bg-transparent pb-24">
    <div className="lg:sticky lg:top-0 z-20 border-b border-white/5 bg-ink-950/95 px-4 py-4 backdrop-blur-xl sm:px-6"><div className="mx-auto flex max-w-3xl items-center gap-3"><Link to="/extensions" className="yomi-utility-button" aria-label="Back to extensions"><ArrowLeft /></Link><div><span className="yomi-eyebrow">Extensions</span><h1 className="yomi-workspace-title mt-1">Stores</h1></div></div></div>
    <div className="mx-auto max-w-3xl space-y-8 p-6 sm:p-10">
      <div className="yomi-commandbar flex-col items-start gap-2"><span className="yomi-eyebrow">First-time setup</span><h2 className="text-xl font-semibold text-slate-100">Choose who distributes your sources</h2><p className="max-w-2xl text-sm leading-6 text-slate-400">Extension Stores include publisher identity and signing information. Yomikura never bundles third-party manga sources.</p></div>
      {statusMessage && <div role={statusMessage.kind === "error" ? "alert" : "status"} className={`yomi-alert ${statusMessage.kind === "error" ? "border-red-500/25 bg-red-500/10 text-red-100" : "border-yomi-jade/25 bg-yomi-jade/10 text-yomi-jade"}`}>{statusMessage.kind === "error" ? <AlertCircle /> : <CheckCircle2 />}<span>{statusMessage.text}</span></div>}
      {!repositories.length && snapshot?.repositories.length ? <div className="yomi-alert border-amber-400/25 bg-amber-400/10"><AlertCircle className="text-amber-300" /><div className="min-w-0 flex-1"><strong className="block text-amber-100">Previous Extension Stores are recoverable</strong><p className="mt-1 text-slate-300">Yomikura retained {snapshot.repositories.length} addresses for this server.</p></div><button className="yomi-button yomi-button-secondary" disabled={busy} onClick={() => void restoreSnapshot()}>Restore</button></div> : null}
      {!hasCurrentKeiyoushi && <div className="yomi-commandbar flex-col p-5 sm:flex-row"><div><h3 className="flex items-center gap-2 font-semibold text-slate-100"><Github className="text-[rgb(var(--yomi-signature))]" />{hasLegacyKeiyoushi ? "Upgrade Keiyoushi Store" : "Keiyoushi Extension Store"}</h3><p className="mt-1 text-sm text-slate-400">{hasLegacyKeiyoushi ? "A legacy catalogue is configured. Add the signed store descriptor for future Extension API updates." : "Community-maintained source extensions for Mihon-compatible clients and Suwayomi."}</p></div><button onClick={() => void addKeiyoushi()} disabled={busy} className="yomi-button yomi-button-primary whitespace-nowrap">{hasLegacyKeiyoushi ? "Upgrade store" : "Use this store"}</button></div>}
      <form onSubmit={(event) => { event.preventDefault(); void addValidatedStore(repoUrl); }} className="flex flex-col gap-3 sm:flex-row"><input type="url" aria-label="Extension Store descriptor URL" placeholder="https://example.com/repo.json" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} required className="yomi-field flex-1" /><button type="submit" disabled={busy || !repoUrl.trim()} className="yomi-button yomi-button-secondary px-6">{busy ? <Loader2 className="animate-spin" /> : <Plus />}Add</button></form>
      <section className="space-y-4"><h2 className="yomi-section-label">Configured Extension Stores</h2>{storesQuery.isLoading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-yomi-jade" /></div> : !stores.length ? <div className="yomi-route-empty"><div><Github /><h2>No Extension Stores yet</h2><p>Add a trusted signed store descriptor to discover source extensions.</p></div></div> : <div className="yomi-surface">{stores.map((store) => <div key={store.indexUrl} className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-4 last:border-0"><div className="min-w-0"><div className="flex items-center gap-2"><strong className="text-sm text-slate-200">{store.name}</strong>{store.badgeLabel && <span className="yomi-chip">{store.badgeLabel}</span>}{store.isLegacy && <span className="yomi-chip text-amber-300">Legacy</span>}</div><span className="mt-1 block truncate font-mono text-xs text-slate-400">{store.indexUrl}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />{store.signingKey ? `Signing key ${store.signingKey.slice(0, 12)}…${store.signingKey.slice(-8)}` : "No signing key reported"}</span></div><button onClick={async () => { if (await confirm({ title: `Remove ${store.name}?`, detail: "The catalogue will stop receiving updates from this publisher. Installed extensions remain available.", confirmLabel: "Remove store", danger: true })) removeStore.mutate(store.indexUrl); }} disabled={busy} className="yomi-utility-button danger" aria-label={`Remove Extension Store ${store.name}`}><Trash2 /></button></div>)}</div>}</section>
    </div>
  </div>;
}
