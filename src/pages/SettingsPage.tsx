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
  Plus,
  Trash2,
  Edit2,
  Server,
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
    profiles,
    activeProfileId,
    addProfile,
    updateProfile,
    deleteProfile,
    setActiveProfileId,
  } = useSettingsStore();

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileUrlInput, setProfileUrlInput] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);

  const [localUrl, setLocalUrl] = useState(serverBaseUrl);
  const [activeTab, setActiveTab] = useState<SettingsTab>("connection");
  const [backupMessage, setBackupMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  
  const isMixedContent = useMemo(() => {
    return window.location.protocol === "https:" && localUrl.trim().startsWith("http://");
  }, [localUrl]);

  const queryClient = useQueryClient();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Sync local state if store changes outside
  useEffect(() => {
    setLocalUrl(serverBaseUrl);
  }, [serverBaseUrl]);

  const activeProfile = useMemo(() => {
    return profiles.find(p => p.id === activeProfileId) || profiles[0];
  }, [profiles, activeProfileId]);

  const handleSelectProfile = (id: string) => {
    setActiveProfileId(id);
    queryClient.clear();
    setEditingProfileId(null);
    setIsAddingNew(false);
  };

  const handleAddNewProfile = (e: FormEvent) => {
    e.preventDefault();
    if (!profileNameInput.trim() || !profileUrlInput.trim()) return;
    addProfile(profileNameInput.trim(), profileUrlInput.trim());
    queryClient.clear();
    setProfileNameInput("");
    setProfileUrlInput("");
    setIsAddingNew(false);
  };

  const handleSaveProfileEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editingProfileId) return;
    if (!profileNameInput.trim() || !profileUrlInput.trim()) return;
    updateProfile(editingProfileId, profileNameInput.trim(), profileUrlInput.trim());
    if (editingProfileId === activeProfileId) {
      queryClient.clear();
    }
    setEditingProfileId(null);
    setProfileNameInput("");
    setProfileUrlInput("");
  };

  const startEditProfile = (p: { id: string; name: string; url: string }) => {
    setEditingProfileId(p.id);
    setProfileNameInput(p.name);
    setProfileUrlInput(p.url);
    setIsAddingNew(false);
  };

  const cancelProfileEdit = () => {
    setEditingProfileId(null);
    setIsAddingNew(false);
    setProfileNameInput("");
    setProfileUrlInput("");
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
            <div className="space-y-6">
              {/* Profiles List Card */}
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Server className="h-5 w-5 text-yomi-jade" />
                  Server Profiles
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Switch between local, home, or cloud Suwayomi instances.
                </p>

                {/* Profiles stack */}
                <div className="mt-6 space-y-3">
                  {profiles.map((p) => {
                    const isActive = p.id === activeProfileId;
                    return (
                      <div
                        key={p.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border transition ${
                          isActive
                            ? "border-yomi-jade/30 bg-yomi-jade/5"
                            : "border-white/5 bg-ink-950/30 hover:border-white/10"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`mt-0.5 rounded-lg p-2 ${isActive ? "bg-yomi-jade/10 text-yomi-jade" : "bg-white/5 text-slate-500"}`}>
                            <Server className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-sm text-slate-200 truncate">{p.name}</span>
                            <span className="text-xs text-slate-500 truncate mt-0.5">{p.url}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 sm:justify-end">
                          {isActive ? (
                            <span className="rounded bg-yomi-jade/10 border border-yomi-jade/20 px-2 py-0.5 text-[10px] font-bold text-yomi-jade uppercase tracking-wider">
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSelectProfile(p.id)}
                              className="rounded bg-white/5 border border-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                            >
                              Switch Server
                            </button>
                          )}
                          <button
                            onClick={() => startEditProfile(p)}
                            className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-slate-200 transition"
                            title="Edit Profile"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete profile "${p.name}"?`)) {
                                deleteProfile(p.id);
                              }
                            }}
                            disabled={profiles.length <= 1}
                            className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition disabled:opacity-30 disabled:pointer-events-none"
                            title="Delete Profile"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!editingProfileId && !isAddingNew && (
                  <button
                    onClick={() => {
                      setIsAddingNew(true);
                      setProfileNameInput("");
                      setProfileUrlInput("");
                      setEditingProfileId(null);
                    }}
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Server Profile
                  </button>
                )}
              </div>

              {/* Add / Edit Profile Form Card */}
              {(editingProfileId || isAddingNew) && (
                <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    {editingProfileId ? <Edit2 className="h-4 w-4 text-yomi-jade" /> : <Plus className="h-4 w-4 text-yomi-jade" />}
                    {editingProfileId ? "Edit Server Profile" : "Add Server Profile"}
                  </h2>
                  <form onSubmit={editingProfileId ? handleSaveProfileEdit : handleAddNewProfile} className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider" htmlFor="profile-name">
                          Profile Name
                        </label>
                        <input
                          id="profile-name"
                          type="text"
                          required
                          placeholder="e.g. Home Server"
                          value={profileNameInput}
                          onChange={(e) => setProfileNameInput(e.target.value)}
                          className="w-full rounded bg-ink-950 border border-white/10 px-3 py-2 text-xs text-slate-300 outline-none focus:border-yomi-jade/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider" htmlFor="profile-url">
                          Server URL
                        </label>
                        <input
                          id="profile-url"
                          type="url"
                          required
                          placeholder="http://localhost:4567"
                          value={profileUrlInput}
                          onChange={(e) => setProfileUrlInput(e.target.value)}
                          className="w-full rounded bg-ink-950 border border-white/10 px-3 py-2 text-xs text-slate-300 outline-none focus:border-yomi-jade/50 transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
                      <button
                        type="button"
                        onClick={cancelProfileEdit}
                        className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-yomi-jade px-4 py-2 text-xs font-semibold text-ink-950 hover:bg-yomi-jade/90 transition"
                      >
                        Save Profile
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Connection Status & Test Card for Active Profile */}
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Activity className="h-4.5 w-4.5 text-yomi-jade animate-pulse" />
                  Test Connection: {activeProfile?.name}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Verify the reachability of the currently active Suwayomi server.
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
                    <span className="text-xs font-medium text-slate-300 break-all">{activeProfile?.url}</span>
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        await testConnection();
                      }}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-yomi-jade px-4 text-xs font-semibold text-ink-950 hover:bg-yomi-jade/90 transition disabled:opacity-50 shrink-0"
                      disabled={connectionStatus === "testing"}
                    >
                      {connectionStatus === "testing" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <Activity className="h-3.5 w-3.5" />
                          <span>Test Connection</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isMixedContent && (
                    <div className="mt-2 flex items-start gap-3 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-400">
                      <ServerCrash className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-400" />
                      <div>
                        <p className="font-semibold text-amber-300">Mixed Content Warning</p>
                        <p className="mt-1 leading-relaxed opacity-90">
                          You are accessing Yomikura securely via <strong>HTTPS</strong>, but your server URL is configured with <strong>HTTP</strong>. 
                          Web browsers block insecure API requests from secure pages. To resolve this:
                        </p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 opacity-90">
                          <li>Configure HTTPS on your Suwayomi server and enter a secure <code>https://</code> URL.</li>
                          <li>Or access Yomikura via an insecure local <code>http://</code> address (e.g. <code>http://localhost:5173</code>).</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {connectionStatus === "error" && errorMessage && (
                    <div className="mt-2 flex items-start gap-3 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                      <ServerCrash className="mt-0.5 h-4.5 w-4.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-red-300">Connection Failed</p>
                        <p className="mt-1">{errorMessage}</p>
                      </div>
                    </div>
                  )}

                  {connectionStatus === "connected" && (
                    <div className="mt-2 flex items-start gap-3 rounded-md border border-yomi-jade/20 bg-yomi-jade/10 p-3 text-xs text-yomi-jade">
                      <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-yomi-jade">Connected Successfully</p>
                        <p className="mt-1 opacity-90">Your Suwayomi server is reachable and responding.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
