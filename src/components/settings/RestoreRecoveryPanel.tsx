import { useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { pendingLibraryRestore, finishLibraryRestore, LIBRARY_RESTORE_EVENT } from "../../api/suwayomi/restoreIdentity";
import { useFeedback } from "../ui/FeedbackProvider";
import { validateServerBaseUrl } from "../../config/server";
export function RestoreRecoveryPanel() {
  const { serverBaseUrl, mockMode } = useSettingsStore(), { confirm, notify } = useFeedback();
  const [revision, setRevision] = useState(0), [message, setMessage] = useState("Checking restore status…"), [failed, setFailed] = useState(false);
  const pending = !mockMode && validateServerBaseUrl(serverBaseUrl).valid ? pendingLibraryRestore(serverBaseUrl) : undefined;
  useEffect(() => {
    const changed = () => setRevision((value) => value + 1); window.addEventListener(LIBRARY_RESTORE_EVENT, changed);
    return () => window.removeEventListener(LIBRARY_RESTORE_EVENT, changed);
  }, []);
  useEffect(() => {
    if (!pending) return;
    let active = true, running = false;
    const check = async () => {
      if (running) return; running = true;
      try {
        if (!pending.id) { if (active) { setFailed(true); setMessage("The restore upload was not confirmed. Check that Suwayomi has finished restoring before keeping the current library. Your safety copy is retained."); } return; }
        const result = await createGraphqlClient(`${serverBaseUrl}/api/graphql`, undefined, "live").GetRestoreStatus({ id: pending.id }, undefined, AbortSignal.timeout(10000));
        if (!active) return;
        if (result.restoreStatus?.state === "SUCCESS") { await finishLibraryRestore(serverBaseUrl, pending.token); if (useSettingsStore.getState().serverBaseUrl === serverBaseUrl && !useSettingsStore.getState().mockMode) useSettingsStore.setState({ connectionStatus: "connected", errorMessage: "" }); notify("Restore confirmed. Earlier device updates are kept separate; your safety copy is retained.", "success"); }
        else { setFailed(result.restoreStatus?.state === "FAILURE"); setMessage(result.restoreStatus?.state === "FAILURE" ? "Suwayomi reported that restore failed. Your safety copy is retained. Review the current library before resuming updates." : "Suwayomi is restoring your library. Device updates are paused until completion is confirmed."); }
      } catch { if (active) setMessage("Restore status could not be checked. Device updates remain paused; reconnect and check again. Your safety copy is retained."); }
      finally { running = false; }
    };
    void check(); const timer = setInterval(() => void check(), 5000); return () => { active = false; clearInterval(timer); };
  }, [pending?.token, pending?.id, revision, serverBaseUrl, notify]);
  if (!pending) return null;
  return <section className="yomi-content-surface mb-5 p-5" aria-label="Restore recovery"><h3 className="font-semibold">Restore needs confirmation</h3><p role="status" className="my-3 text-sm text-slate-400">{message}</p><button className="yomi-button yomi-button-secondary" onClick={() => setRevision((value) => value + 1)}>Check restore status</button>{failed && <button className="yomi-button yomi-button-secondary ml-3" onClick={async () => {
    if (!await confirm({ title: "Keep the current library?", detail: "Only continue after checking that Suwayomi has finished restoring. Give its current state a fresh marker and resume updates? Earlier device progress, notes, saved pages and safety backups remain available for review.", confirmLabel: "Keep current library" })) return;
    try { await finishLibraryRestore(serverBaseUrl, pending.token); if (useSettingsStore.getState().serverBaseUrl === serverBaseUrl && !useSettingsStore.getState().mockMode) useSettingsStore.setState({ connectionStatus: "connected", errorMessage: "" }); } catch (error) { setMessage(error instanceof Error ? error.message : "Recovery could not be confirmed; updates remain paused."); }
  }}>Keep current library and resume</button>}</section>;
}
