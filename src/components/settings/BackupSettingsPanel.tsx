import type { ChangeEvent } from "react";
import { Download, Layout, Loader2, Upload } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";

type BackupMessage = {
  kind: "success" | "error";
  text: string;
};

type BackupSettingsPanelProps = {
  backupMessage: BackupMessage | null;
  creatingBackup: boolean;
  restoringBackup: boolean;
  createBackup: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  exportLibraryCsv: () => void;
};

export function BackupSettingsPanel({
  backupMessage,
  creatingBackup,
  restoringBackup,
  createBackup,
  handleFileChange,
  exportLibraryCsv,
}: BackupSettingsPanelProps) {
  const { backupIntervalHours, setBackupIntervalHours, lastScheduledBackupAt, scheduledBackupStatus, scheduledBackupError, libraryUpdateIntervalHours, setLibraryUpdateIntervalHours, lastLibraryUpdateAt, scheduledLibraryUpdateStatus, scheduledLibraryUpdateError } = useSettingsStore();
  return (
    <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Layout className="h-5 w-5 text-yomi-jade" />
          Backup & Restore
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Export your library metadata, history, and categories from Suwayomi, or restore an
          existing backup file.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-ink-950/35 p-4">
        <label htmlFor="library-update-schedule" className="text-sm font-semibold text-slate-200">Automatic library updates</label>
        <p className="mt-1 text-xs leading-5 text-slate-400">Checks when Yomikura starts and while it remains open. Missed checks run after the next successful connection.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select id="library-update-schedule" value={libraryUpdateIntervalHours} onChange={(event) => setLibraryUpdateIntervalHours(Number(event.target.value))} className="yomi-field min-w-52"><option value={0}>Off</option><option value={6}>Every 6 hours</option><option value={12}>Every 12 hours</option><option value={24}>Daily</option></select>
          <span className="text-xs text-slate-400" role="status">{scheduledLibraryUpdateStatus === "running" ? "Checking library…" : scheduledLibraryUpdateStatus === "error" ? `Last check failed: ${scheduledLibraryUpdateError}` : lastLibraryUpdateAt ? `Last automatic check: ${new Date(lastLibraryUpdateAt).toLocaleString()}` : "No automatic check yet"}</span>
        </div>
      </div>

      {backupMessage && (
        <div className={`flex items-start gap-3 rounded-md border p-4 text-sm ${
          backupMessage.kind === "success"
            ? "border-yomi-jade/20 bg-yomi-jade/10 text-yomi-jade"
            : "border-red-500/20 bg-red-500/10 text-red-400"
        }`}>
          <div>
            <p className="font-medium">{backupMessage.kind === "success" ? "Success" : "Failed"}</p>
            <p className="mt-1">{backupMessage.text}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-ink-950/35 p-4">
        <label htmlFor="backup-schedule" className="text-sm font-semibold text-slate-200">Automatic backup schedule</label>
        <p className="mt-1 text-xs leading-5 text-slate-400">Yomikura checks on startup and while running. Suwayomi creates the backup in its configured backup directory.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select id="backup-schedule" value={backupIntervalHours} onChange={(event) => setBackupIntervalHours(Number(event.target.value))} className="yomi-field min-w-52">
            <option value={0}>Off</option>
            <option value={12}>Every 12 hours</option>
            <option value={24}>Daily</option>
            <option value={168}>Weekly</option>
          </select>
          <span className="text-xs text-slate-400" role="status">
            {scheduledBackupStatus === "running" ? "Creating backup…" : scheduledBackupStatus === "error" ? `Last attempt failed: ${scheduledBackupError}` : lastScheduledBackupAt ? `Last automatic backup: ${new Date(lastScheduledBackupAt).toLocaleString()}` : "No automatic backup yet"}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={createBackup}
          disabled={creatingBackup || restoringBackup}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-yomi-jade px-4 py-3 font-semibold text-ink-950 hover:bg-yomi-jade/90 disabled:opacity-50 transition"
        >
          {creatingBackup ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          Create & Download Backup
        </button>

        <label className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-semibold text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer transition disabled:opacity-50">
          {restoringBackup ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          Upload & Restore Backup
          <input
            type="file"
            accept=".zip,.tachibk,.json"
            onChange={handleFileChange}
            className="hidden"
            disabled={creatingBackup || restoringBackup}
          />
        </label>
      </div>

      <button type="button" onClick={exportLibraryCsv} className="yomi-button yomi-button-secondary w-full sm:w-auto">Export library list as CSV</button>
    </div>
  );
}
