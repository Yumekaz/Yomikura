import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2 } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import { isSelectedLibrary } from "../../api/suwayomi/libraryUpdateState";
import { trackerExternalUrl } from "../../api/suwayomi/trackingActions";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { useFeedback } from "../ui/FeedbackProvider";
export function TrackerSettingsPanel() {
  const backend = useProgressBackend();
  return backend ? <TrackerAccounts key={backend.key} backend={backend} /> : <p>Connect a library to manage tracker accounts.</p>;
}
function TrackerAccounts({ backend }: { backend: ProgressBackend }) {
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live"), [backend]);
  const client = useQueryClient(), { confirm } = useFeedback(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const query = useQuery({ queryKey: ["global-trackers", backend.key], queryFn: ({ signal }) => sdk.GetTrackers(undefined, undefined, AbortSignal.any([signal, AbortSignal.timeout(15000)])), retry: false });
  const signOut = async (id: number, name: string) => {
    if (!await confirm({ title: `Sign out of ${name}?`, detail: "This signs the connected library out, including its other devices. Linked works and saved reading progress are kept.", confirmLabel: "Sign out" }) || !isSelectedLibrary(backend)) return;
    setBusy(true); setError("");
    try {
      const result = (await sdk.LogoutTracker({ input: { trackerId: id } }, undefined, AbortSignal.timeout(15000))).logoutTracker?.tracker;
      if (result?.id !== id || result.isLoggedIn) throw new Error("Sign-out wasn't confirmed");
      await Promise.all([client.invalidateQueries({ queryKey: ["global-trackers", backend.key] }), client.invalidateQueries({ queryKey: ["manga-trackers"] })]);
    } catch { if (isSelectedLibrary(backend)) setError("Sign-out wasn’t confirmed. Refresh the account status before trying again."); }
    finally { setBusy(false); }
  };
  if (query.isPending) return <p role="status" className="text-xs text-slate-400">Opening tracker accounts…</p>;
  if (query.isError) return <button className="yomi-text-link text-xs" onClick={() => void query.refetch()}>Tracker accounts couldn’t be loaded. Retry</button>;
  return <div className="space-y-3">{query.data?.trackers.nodes.map((tracker) => {
    const auth = trackerExternalUrl(tracker.authUrl, backend.serverBaseUrl);
    return <div key={tracker.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div className="flex items-center gap-3"><Link2 aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-400" /><div><p className="text-sm font-semibold text-slate-200">{tracker.name}</p><p className="mt-1 text-xs text-slate-400">{tracker.isTokenExpired ? "Sign-in expired" : tracker.isLoggedIn ? "Signed in" : "Not signed in"}</p></div></div><div className="flex gap-3">{(!tracker.isLoggedIn || tracker.isTokenExpired) && auth && <a className="yomi-button yomi-button-secondary" href={auth} target="_blank" rel="noopener noreferrer">{tracker.isTokenExpired ? "Sign in again" : "Sign in"}<ExternalLink /></a>}{tracker.isLoggedIn && <button className="yomi-text-link text-xs" disabled={busy} onClick={() => void signOut(tracker.id, tracker.name)}>Sign out of {tracker.name}</button>}</div></div>;
  })}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}<p className="text-xs leading-6 text-slate-400">Choose the matching edition on a book’s details page to link it. Account authentication is handled by your library and the provider.</p></div>;
}
