import { useState } from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { separateLibrarySession } from "../../api/suwayomi/librarySession";
import { useFeedback } from "../ui/FeedbackProvider";

export function LibraryIdentityPanel() {
  const { mockMode, serverBaseUrl, connectionStatus } = useSettingsStore();
  const { confirm } = useFeedback();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (mockMode) return null;
  return <section className="yomi-content-surface p-5"><h3 className="font-semibold">Keep saved reading data together</h3><p className="my-3 text-sm text-slate-400">Yomikura checks a library marker before syncing. Restoring or copying a server can copy that marker too. If this is a different library using an old address, give it a fresh marker. Earlier device copies remain in Storage → Earlier saved libraries.</p><button disabled={busy || connectionStatus !== "connected"} className="yomi-button yomi-button-secondary" onClick={async () => {
    if (!await confirm({ title: "Keep this library separate?", detail: "Give the connected library a fresh marker? Its books and server progress stay intact. Earlier device notes, saved pages and pending updates remain available for review; they will not sync automatically. Other Yomikura clients using this server must reconnect. Use this when a restored or copied server should be treated as a different library.", confirmLabel: "Separate saved data" })) return;
    setBusy(true); setError("");
    try { await separateLibrarySession(serverBaseUrl); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "This library could not be separated. Earlier data is retained."); }
    finally { setBusy(false); }
  }}>Separate this library’s saved data</button>{error && <p className="mt-3 text-sm" role="alert">{error}</p>}</section>;
}
