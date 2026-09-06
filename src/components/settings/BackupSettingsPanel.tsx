import type { ChangeEvent } from "react";
import { Download, Layout, Loader2, Upload } from "lucide-react";

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
};

export function BackupSettingsPanel({
  backupMessage,
  creatingBackup,
  restoringBackup,
  createBackup,
  handleFileChange,
}: BackupSettingsPanelProps) {
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
    </div>
  );
}
