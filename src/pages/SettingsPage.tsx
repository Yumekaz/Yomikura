import { FormEvent, useEffect, useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  ServerCrash,
  Save,
  Activity,
  Upload,
  Download,
  BookOpen,
  Layout,
} from "lucide-react";
import { useSettingsStore, ReaderMode } from "../stores/useSettingsStore";
import { DEFAULT_SERVER_BASE_URL } from "../config/server";
import { createGraphqlClient } from "../api/graphql/client";
import { getErrorMessage } from "../api/suwayomi/errors";

type SettingsTab = "connection" | "reader" | "backup";

function SettingsPage() {
  const {
    serverBaseUrl,
    setServerBaseUrl,
    testConnection,
    connectionStatus,
    errorMessage,
    readerMode,
    setReaderMode,
  } = useSettingsStore();

  const [localUrl, setLocalUrl] = useState(serverBaseUrl);
  const [activeTab, setActiveTab] = useState<SettingsTab>("connection");
  const [backupMessage, setBackupMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const queryClient = useQueryClient();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Sync local state if store changes outside
  useEffect(() => {
    setLocalUrl(serverBaseUrl);
  }, [serverBaseUrl]);

  const handleSaveAndTest = async (e: FormEvent) => {
    e.preventDefault();
    if (!localUrl) return;
    const urlChanged = localUrl.trim() !== serverBaseUrl;
    setServerBaseUrl(localUrl);
    if (urlChanged) {
      queryClient.clear();
    }
    await testConnection();
  };

  // Mutation: Create Backup
  const { mutate: createBackup, isPending: creatingBackup } = useMutation({
    mutationFn: () => sdk.CreateBackup({ input: {} }),
    onMutate: () => {
      setBackupMessage(null);
    },
    onSuccess: (data) => {
      const backupUrl = data?.createBackup?.url;
      if (backupUrl) {
        const fullUrl = backupUrl.startsWith("http")
          ? backupUrl
          : `${serverBaseUrl.replace(/\/$/, "")}${backupUrl.startsWith("/") ? "" : "/"}${backupUrl}`;

        // Auto trigger file download
        const a = document.createElement("a");
        a.href = fullUrl;
        a.download = backupUrl.split("/").pop() || "suwayomi_backup.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setBackupMessage({
          kind: "success",
          text: "Backup created and download started successfully!",
        });
      } else {
        setBackupMessage({
          kind: "error",
          text: "Server did not return a valid backup URL.",
        });
      }
    },
    onError: (err) => {
      setBackupMessage({
        kind: "error",
        text: `Failed to create backup: ${getErrorMessage(err)}`,
      });
    },
  });

  // Mutation: Restore Backup
  const { mutate: restoreBackup, isPending: restoringBackup } = useMutation({
    mutationFn: (file: File) =>
      sdk.RestoreBackup({
        input: {
          backup: file,
        },
      }),
    onMutate: () => {
      setBackupMessage(null);
    },
    onSuccess: () => {
      setBackupMessage({
        kind: "success",
        text: "Backup restored successfully! Refreshing library cache...",
      });
      queryClient.invalidateQueries();
    },
    onError: (err) => {
      setBackupMessage({
        kind: "error",
        text: `Failed to restore backup: ${getErrorMessage(err)}`,
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmRestore = window.confirm(
      "Warning: Restoring a backup is a destructive action that will overwrite your library, history, and categories. Do you want to proceed?"
    );

    if (confirmRestore) {
      restoreBackup(file);
    }
    // Reset file input
    e.target.value = "";
  };

  return (
    <section className="min-h-screen px-5 py-6 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-semibold text-yomi-jade">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Application Settings</h1>
        </div>

        {/* Tabs Bar */}
        <div className="flex gap-2 border-b border-white/5 pb-px">
          {(["connection", "reader", "backup"] as SettingsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? "border-yomi-jade text-yomi-jade"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              } capitalize`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main Content Area based on active tab */}
        <div className="space-y-6">
          {activeTab === "connection" && (
            <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-yomi-jade" />
                Suwayomi Server Connection
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Configure the URL of your Suwayomi instance. Yomikura connects directly to this server 
                for library management, extensions, and content.
              </p>

              <form onSubmit={handleSaveAndTest} className="mt-6">
                <label className="block px-1 pb-2 text-sm font-medium text-slate-300" htmlFor="settings-server-url">
                  Server URL
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="settings-server-url"
                    className="min-h-12 flex-1 rounded-md border border-white/10 bg-ink-950 px-4 text-sm text-slate-300 outline-none placeholder:text-slate-600 focus:border-yomi-jade/50 focus:ring-1 focus:ring-yomi-jade/50 transition-colors"
                    placeholder={DEFAULT_SERVER_BASE_URL}
                    value={localUrl}
                    onChange={(e) => setLocalUrl(e.target.value)}
                    disabled={connectionStatus === "testing"}
                    required
                  />
                  <button
                    className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-yomi-jade px-5 text-sm font-semibold text-ink-950 transition-colors hover:bg-yomi-jade/90 disabled:opacity-70"
                    type="submit"
                    disabled={!localUrl || connectionStatus === "testing"}
                  >
                    {connectionStatus === "testing" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save & Test</span>
                      </>
                    )}
                  </button>
                </div>

                {connectionStatus === "error" && errorMessage && (
                  <div className="mt-4 flex items-start gap-3 rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                    <ServerCrash className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-medium text-red-300">Connection Failed</p>
                      <p className="mt-1">{errorMessage}</p>
                    </div>
                  </div>
                )}

                {connectionStatus === "connected" && (
                  <div className="mt-4 flex items-start gap-3 rounded-md border border-yomi-jade/20 bg-yomi-jade/10 p-4 text-sm text-yomi-jade">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-medium text-yomi-jade">Connected Successfully</p>
                      <p className="mt-1 opacity-90">Your Suwayomi server is reachable and responding.</p>
                    </div>
                  </div>
                )}
              </form>
            </div>
          )}

          {activeTab === "reader" && (
            <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-yomi-jade" />
                Reader Preferences
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Configure your default layout and reading preferences.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block px-1 pb-2 text-sm font-medium text-slate-300">
                    Reading Mode
                  </label>
                  <select
                    value={readerMode}
                    onChange={(e) => setReaderMode(e.target.value as ReaderMode)}
                    className="w-full sm:w-72 rounded-md border border-white/10 bg-ink-950 px-4 py-2.5 text-sm text-slate-300 outline-none focus:border-yomi-jade/50 focus:ring-1 focus:ring-yomi-jade/50 transition-colors"
                  >
                    <option value="WEBTOON">Vertical Webtoon</option>
                    <option value="LTR">Left to Right (Single Page)</option>
                    <option value="RTL">Right to Left (Single Page)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === "backup" && (
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
                {/* Create Backup */}
                <button
                  onClick={() => createBackup()}
                  disabled={creatingBackup || restoringBackup}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-yomi-jade px-4 py-3 font-semibold text-ink-950 hover:bg-yomi-jade/90 disabled:opacity-50 transition"
                >
                  {creatingBackup ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Download className="h-5 w-5" />
                  )}
                  Create & Download Backup
                </button>

                {/* Restore Backup */}
                <label className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-semibold text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer transition disabled:opacity-50">
                  {restoringBackup ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5" />
                  )}
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
          )}
        </div>

        {/* Sidebar Info Panel */}
        <div className="space-y-4">
          <div className="rounded-md border border-white/10 bg-ink-900 p-5 shadow-panel">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <Activity className="h-4 w-4 text-slate-400" />
              Connection Status
            </h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Status</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  connectionStatus === "connected" ? "bg-yomi-jade/10 text-yomi-jade" :
                  connectionStatus === "error" ? "bg-red-500/10 text-red-400" :
                  connectionStatus === "testing" ? "bg-blue-500/10 text-blue-400" :
                  "bg-slate-500/10 text-slate-400"
                }`}>
                  {connectionStatus === "testing" ? "Testing" :
                   connectionStatus === "connected" ? "Connected" :
                   connectionStatus === "error" ? "Error" : "Disconnected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Persisted</span>
                <span className="text-sm text-white">Yes (Local Storage)</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-400">Default</span>
                <span className="truncate text-right text-sm text-white">{DEFAULT_SERVER_BASE_URL}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SettingsPage;
