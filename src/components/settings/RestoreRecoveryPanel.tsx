import { useEffect, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { pendingLibraryRestore, finishLibraryRestore, LIBRARY_RESTORE_EVENT } from "../../api/suwayomi/restoreIdentity";
import { validateServerBaseUrl } from "../../config/server";
import { useFeedback } from "../ui/FeedbackProvider";
import { RESTORE_BACKUP_MUTATION_KEY } from "./backupRestore";

const messages = {
  checking: "Checking restore status…",
  running: "Suwayomi is restoring your library. Device updates are paused until completion is confirmed.",
  unconfirmed: "The restore upload was not confirmed. Check the current library and Suwayomi before resuming. Your safety copy is retained.",
  expired: "Suwayomi no longer has a result for this restore. Device updates remain paused while you review the current library. Your safety copy is retained.",
  failed: "Suwayomi reported that the restore failed. Review the current library before resuming updates. Your safety copy is retained.",
  unreachable: "Restore status could not be checked. Device updates remain paused. Reconnect and check again. Your safety copy is retained.",
};
type RecoveryState = keyof typeof messages;

async function fetchRestoreStatus(server: string, id: string, signal = AbortSignal.timeout(10000)) {
  const client = createGraphqlClient(`${server.replace(/\/+$/, "")}/api/graphql`, undefined, "live");
  const result = await client.GetRestoreStatus({ id }, undefined, signal);
  if (result.restoreStatus === undefined) throw new Error("Suwayomi did not return a restore status.");
  return result.restoreStatus;
}

function isCurrentRestore(server: string, token: string) {
  const current = useSettingsStore.getState();
  return !current.mockMode && current.serverBaseUrl === server && pendingLibraryRestore(server)?.token === token;
}

async function resumeLibrary(server: string, token: string) {
  if (!isCurrentRestore(server, token)) return false;
  await finishLibraryRestore(server, token);
  const current = useSettingsStore.getState();
  if (current.serverBaseUrl === server && !current.mockMode) {
    useSettingsStore.setState({ connectionStatus: "connected", errorMessage: "" });
    return true;
  }
  return false;
}

export function RestoreRecoveryPanel() {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const { confirm, notify } = useFeedback();
  const uploading = useIsMutating({ mutationKey: RESTORE_BACKUP_MUTATION_KEY }) > 0;
  const [revision, setRevision] = useState(0);
  const [recovery, setRecovery] = useState<{ token: string; state: RecoveryState }>();
  const [recovering, setRecovering] = useState(false);
  const pending = !mockMode && validateServerBaseUrl(serverBaseUrl).valid ? pendingLibraryRestore(serverBaseUrl) : undefined;
  const token = pending?.token;
  const jobId = pending?.id;

  useEffect(() => {
    const changed = () => setRevision((value) => value + 1);
    window.addEventListener(LIBRARY_RESTORE_EVENT, changed);
    return () => window.removeEventListener(LIBRARY_RESTORE_EVENT, changed);
  }, []);

  useEffect(() => {
    if (!token || uploading || recovering) return;
    const active = new AbortController();
    let checking = false;
    const update = (state: RecoveryState) => {
      if (!active.signal.aborted) setRecovery({ token, state });
    };
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        if (!jobId) {
          update("unconfirmed");
          return;
        }
        const status = await fetchRestoreStatus(serverBaseUrl, jobId, AbortSignal.any([active.signal, AbortSignal.timeout(10000)]));
        if (active.signal.aborted) return;
        if (status?.state === "SUCCESS") {
          if (await resumeLibrary(serverBaseUrl, token)) notify("Restore confirmed. Earlier device updates are kept separate. Your safety copy is retained.", "success");
        } else {
          update(status === null ? "expired" : status.state === "FAILURE" ? "failed" : "running");
        }
      } catch {
        update("unreachable");
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = jobId ? window.setInterval(() => void check(), 5000) : undefined;
    return () => {
      active.abort();
      window.clearInterval(timer);
    };
  }, [token, jobId, uploading, recovering, revision, serverBaseUrl, notify]);

  if (!token) return null;
  const state = !uploading && recovery?.token === token ? recovery.state : "checking";
  const reviewAvailable = state === "unconfirmed" || state === "expired" || state === "failed";

  const keepCurrentLibrary = async () => {
    if (!reviewAvailable || recovering || !isCurrentRestore(serverBaseUrl, token)) return;
    setRecovering(true);
    try {
      const accepted = await confirm({
        title: "Keep the current library?",
        detail: "Check in Suwayomi that no restore is running and that this is the library you intend to keep. Yomikura will give it a fresh identity and resume updates. Earlier device data and the safety backup remain available for review.",
        confirmLabel: "Keep current library",
      });
      if (!accepted || !isCurrentRestore(serverBaseUrl, token)) return;
      const latestId = pendingLibraryRestore(serverBaseUrl)?.id;
      if (latestId !== jobId) return;
      const status = latestId ? await fetchRestoreStatus(serverBaseUrl, latestId) : null;
      if (status && status.state !== "FAILURE" && status.state !== "SUCCESS") {
        setRecovery({ token, state: "running" });
        return;
      }
      if (await resumeLibrary(serverBaseUrl, token)) notify("Current library retained. Earlier device data and the safety copy are available for review.", "success");
    } catch {
      setRecovery({ token, state: "unreachable" });
    } finally {
      setRecovering(false);
    }
  };

  return <section className="yomi-content-surface mb-5 p-5" aria-label="Restore recovery">
    <h3 className="font-semibold">Restore needs confirmation</h3>
    <p role="status" className="my-3 text-sm text-slate-400">{messages[state]}</p>
    <div className="flex flex-wrap items-center gap-3">
      <button className="yomi-button yomi-button-secondary" disabled={uploading || recovering} onClick={() => setRevision((value) => value + 1)}>Check restore status</button>
      {reviewAvailable && <button className="yomi-button yomi-button-secondary" disabled={recovering} onClick={() => void keepCurrentLibrary()}>Keep current library and resume</button>}
      <Link className="yomi-text-link" to="/settings/backup">Open backups</Link>
    </div>
  </section>;
}
