import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BACKUPS_CHANGED_EVENT, backupErrorMessage, listLibraryBackups, openLibraryBackupFolder, readLibraryBackup, removeLibraryBackup, type LibraryBackup } from "../../api/suwayomi/backupStorage";
import { exportLibraryBackup } from "../../api/suwayomi/libraryBackups";
import { normalizeCacheServerUrl } from "../../api/suwayomi/offlineCache";
import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import { useFeedback } from "../ui/FeedbackProvider";

export function SavedBackupsPanel({ busy, onRestore }: { busy: boolean; onRestore: (file: File) => Promise<void> }) {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const server = normalizeCacheServerUrl(serverBaseUrl);
  const client = useQueryClient();
  const { confirm } = useFeedback();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const queryKey = ["library-backups", server];
  const backups = useQuery({ queryKey, queryFn: () => listLibraryBackups(server), enabled: !!server && !mockMode });

  useEffect(() => {
    setMessage("");
    const refresh = () => { void client.invalidateQueries({ queryKey: ["library-backups", server] }); };
    window.addEventListener(BACKUPS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(BACKUPS_CHANGED_EVENT, refresh);
  }, [client, server]);

  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(backupErrorMessage(error)); }
    finally { setWorking(false); }
  };

  const restore = async (backup: LibraryBackup) => {
    const { bytes } = await readLibraryBackup(server, backup.id);
    await onRestore(new File([new Uint8Array(bytes)], backup.fileName, { type: "application/gzip" }));
  };

  return <section aria-label="Saved backups" className="space-y-3 border-t border-white/10 pt-5">
    <h3 className="font-semibold text-slate-200">Saved backups</h3>
    <p className="text-xs leading-5 text-slate-400">
      {isTauri() ? "Copies are retained in this app’s backup folder." : "Copies are retained in this browser. Export a copy to keep it if browser data is cleared."}
      {" "}Only backups for the selected server are shown. Downloaded pages and Yomikura settings are not included.
    </p>
    {isTauri() && <button type="button" className="yomi-button yomi-button-secondary" disabled={busy || working} onClick={() => void run(openLibraryBackupFolder)}>Open backup folder</button>}
    {(message || backups.error) && <p role="alert" className="text-sm text-red-400">{message || backupErrorMessage(backups.error)}</p>}
    {backups.isPending && !mockMode ? <p className="text-sm text-slate-400">Loading saved backups…</p> : !backups.data?.length && <p className="text-sm text-slate-400">No saved backups for this server.</p>}
    <ul className="space-y-3">
      {backups.data?.map((backup) => <li key={backup.id} className="rounded-lg border border-white/10 p-3">
        <p className="break-all text-sm font-medium text-slate-200">{backup.fileName}</p>
        <p className="mt-1 text-xs text-slate-400">{backup.purpose === "safety" ? "Safety copy" : backup.purpose === "scheduled" ? "Automatic" : "Manual"} · {new Date(backup.createdAt).toLocaleString()} · {Math.ceil(backup.size / 1024)} KB</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="yomi-button yomi-button-secondary" disabled={busy || working} onClick={() => void run(() => exportLibraryBackup(server, backup.id))}>Export</button>
          <button type="button" className="yomi-button yomi-button-secondary" disabled={busy || working || mockMode} onClick={() => void run(() => restore(backup))}>Restore</button>
          <button type="button" className="yomi-button yomi-button-secondary" disabled={busy || working} onClick={() => void run(async () => {
            if (await confirm({ title: "Remove saved backup?", detail: `Remove “${backup.fileName}” from this device? Keep an exported recovery copy before removing it.`, confirmLabel: "Remove backup", danger: true })) {
              await removeLibraryBackup(server, backup.id);
            }
          })}>Remove</button>
        </div>
      </li>)}
    </ul>
  </section>;
}
