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
  Layout,
  Plus,
  Trash2,
  Edit2,
  Server,
  AlertCircle,
} from "lucide-react";
import { useSettingsStore, ServerProfile } from "../stores/useSettingsStore";
import { createGraphqlClient } from "../api/graphql/client";
import { getErrorMessage } from "../api/suwayomi/errors";
import { useDownloadStore } from "../stores/useDownloadStore";
import { useTranslation } from "../hooks/useTranslation";
import { AboutSettingsPanel } from "../components/settings/AboutSettingsPanel";
import { SettingsStatusPanel } from "../components/settings/SettingsStatusPanel";
import { OfflineSettingsPanel } from "../components/settings/OfflineSettingsPanel";
import { BackupSettingsPanel } from "../components/settings/BackupSettingsPanel";
import { useFeedback } from "../components/ui/FeedbackProvider";
import { useNavigate, useParams } from "react-router-dom";
import { SettingsSearch, type SettingsSection } from "../components/settings/SettingsSearch";
import { AdvancedSettingsPanel } from "../components/settings/AdvancedSettingsPanel";
import { AppearanceSettingsPanel } from "../components/settings/AppearanceSettingsPanel";
import { ReaderSettingsPanel } from "../components/settings/ReaderSettingsPanel";
import { validateBackupFile } from "../components/settings/backupValidation";
import { fetchAllLibrary } from "../api/library/fetchAllLibrary";

type SettingsTab = SettingsSection;
const SETTINGS_TABS: SettingsTab[] = ["connection", "appearance", "reader", "backup", "offline", "advanced", "about"];

const RESTORE_BACKUP_UPLOAD_QUERY = `
  mutation RestoreBackup($input: RestoreBackupInput!) {
    restoreBackup(input: $input) {
      status {
        state
      }
    }
  }
`;

async function restoreBackupUpload(endpoint: string, file: File) {
  const formData = new FormData();
  formData.append(
    "operations",
    JSON.stringify({
      query: RESTORE_BACKUP_UPLOAD_QUERY,
      variables: {
        input: {
          backup: null,
        },
      },
    })
  );
  formData.append("map", JSON.stringify({ "0": ["variables.input.backup"] }));
  formData.append("0", file, file.name);

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.errors?.map((item: { message?: string }) => item.message).filter(Boolean).join("; ") || `HTTP ${response.status}`);
  }

  if (result?.errors?.length) {
    throw new Error(result.errors.map((item: { message?: string }) => item.message).filter(Boolean).join("; ") || "Restore failed.");
  }

  return result?.data;
}

function SettingsPage() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const { t } = useTranslation();
  const { confirm, notify } = useFeedback();
  const {
    serverBaseUrl,
    setServerBaseUrl,
    testConnection,
    connectionStatus,
    errorMessage,
    profiles,
    activeProfileId,
    addProfile,
    updateProfile,
    deleteProfile,
    setActiveProfileId,
    mockMode,
  } = useSettingsStore();

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileUrlInput, setProfileUrlInput] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);


  const [localUrl, setLocalUrl] = useState(serverBaseUrl);
  const routeTab = SETTINGS_TABS.includes(section as SettingsTab) ? section as SettingsTab : "connection";
  const [activeTab, setActiveTab] = useState<SettingsTab>(routeTab);
  const [backupMessage, setBackupMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => setActiveTab(routeTab), [routeTab]);

  const selectSettingsTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    navigate(tab === "connection" ? "/settings" : `/settings/${tab}`);
  };
  
  const { 
    cachedChapters, 
    loadCachedChapters, 
    deleteChapter, 
    clearAll, 
    storageUsage, 
    storageQuota 
  } = useDownloadStore();

  useEffect(() => {
    void loadCachedChapters();
  }, [loadCachedChapters]);

  const isMixedContent = useMemo(() => {
    return window.location.protocol === "https:" && localUrl.trim().startsWith("http://");
  }, [localUrl]);

  const queryClient = useQueryClient();

  const graphqlEndpoint = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return `${cleanUrl}/api/graphql`;
  }, [serverBaseUrl]);

  const sdk = useMemo(() => createGraphqlClient(graphqlEndpoint), [graphqlEndpoint]);

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
    mutationFn: (file: File) => restoreBackupUpload(graphqlEndpoint, file),
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = await validateBackupFile(file);
    if (validationError) {
      setBackupMessage({ kind: "error", text: validationError });
      e.target.value = "";
      return;
    }

    const confirmRestore = await confirm({ title: "Restore this backup?", detail: "Yomikura will first ask Suwayomi to create a safety backup, then restore this file. Library, history, and categories may change.", confirmLabel: "Back up and restore", danger: true });

    if (confirmRestore) {
      setBackupMessage({ kind: "success", text: "Creating a safety backup before restore…" });
      try {
        const safety = await sdk.CreateBackup({ input: {} });
        if (!safety.createBackup?.url) throw new Error("Suwayomi did not confirm the safety backup.");
        restoreBackup(file);
      } catch (error) {
        setBackupMessage({ kind: "error", text: `Restore stopped because a safety backup could not be created: ${getErrorMessage(error)}` });
      }
    }
    // Reset file input
    e.target.value = "";
  };

  const exportLibraryCsv = async () => {
    try {
      const mangas = await fetchAllLibrary(sdk, { inLibrary: { equalTo: true } });
      const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const rows = [["Title", "Unread chapters", "Downloaded chapters"], ...mangas.filter(Boolean).map((manga) => [manga!.title, manga!.unreadCount, manga!.downloadCount])];
      const blob = new Blob([rows.map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `yomikura-library-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      notify(`${mangas.length} library titles exported.`, "success");
    } catch (error) {
      notify(`Library export failed: ${getErrorMessage(error)}`, "error");
    }
  };

  const handleExportProfiles = () => {
    try {
      const dataStr = JSON.stringify(profiles, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = 'yomikura_profiles.json';
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (err) {
      notify("Failed to export profiles: " + err, "error");
    }
  };

  const handleImportProfiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== "string") return;
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) {
          throw new Error("Profiles backup must be a JSON array.");
        }
        
        const validProfiles: ServerProfile[] = [];
        for (const item of imported) {
          if (item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string" && typeof item.url === "string") {
            validProfiles.push({
              id: item.id,
              name: item.name.trim(),
              url: item.url.trim()
            });
          }
        }
        
        if (validProfiles.length === 0) {
          throw new Error("No valid server profiles found in the backup file.");
        }

        const confirmMerge = await confirm({ title: "Import server profiles", detail: `Found ${validProfiles.length} valid profiles. Merge them with your existing profiles?`, confirmLabel: "Merge profiles", cancelLabel: "Review overwrite" });

        let finalProfiles = [...profiles];
        if (confirmMerge) {
          for (const vp of validProfiles) {
            const exists = finalProfiles.some(p => p.url === vp.url || p.id === vp.id);
            if (!exists) {
              finalProfiles.push(vp);
            }
          }
        } else {
          const confirmOverwrite = await confirm({ title: "Overwrite every profile?", detail: "All existing server profiles will be replaced by this file. This cannot be undone.", confirmLabel: "Overwrite profiles", danger: true });
          if (!confirmOverwrite) {
            e.target.value = "";
            return;
          }
          finalProfiles = validProfiles;
        }

        useSettingsStore.setState({ profiles: finalProfiles });
        
        const activeExists = finalProfiles.some(p => p.id === activeProfileId);
        if (!activeExists && finalProfiles.length > 0) {
          setActiveProfileId(finalProfiles[0].id);
        }

        notify("Server profiles imported successfully.", "success");
      } catch (err: any) {
        notify("Failed to import profiles: " + err.message, "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <section className="yomi-page yomi-settings">
      <header className="yomi-page-header !items-start !mb-0">
        <div>
          <p className="yomi-eyebrow">Workspace</p>
          <h1>Settings</h1>
          <p>Reader preferences, storage, and server controls.</p>
        </div>
        <SettingsSearch onSelect={selectSettingsTab} />
      </header>

        <div className="yomi-settings-tabs">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => selectSettingsTab(tab)}
              className={` ${
                activeTab === tab
                  ? "is-active"
                  : ""
              }`}
            >
              {tab === "appearance" ? t("theme") : tab === "offline" ? t("offline") : tab}
            </button>
          ))}
        </div>

      <div className="mt-4"><SettingsStatusPanel connectionStatus={connectionStatus} mockMode={mockMode} /></div>

      <div className="mt-6">
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
                            <span className="mt-0.5 truncate text-xs text-slate-400">{p.url}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 sm:justify-end">
                          {isActive ? (
                            <span className="rounded bg-yomi-jade/10 border border-yomi-jade/20 px-2 py-0.5 text-xs font-bold text-yomi-jade uppercase tracking-wider">
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
                            onClick={async () => {
                              if (await confirm({ title: "Delete server profile?", detail: `“${p.name}” will be removed. The server itself and its files are not changed.`, confirmLabel: "Delete profile", danger: true })) deleteProfile(p.id);
                            }}
                            disabled={profiles.length <= 1}
                            className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition disabled:opacity-30 disabled:pointer-events-none"
                            title="Delete Profile"
                            aria-label={`Delete ${p.name} profile`}
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
                <p className="mt-1 text-xs text-slate-400">
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

              {/* Portability: Backup Server Profiles */}
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Download className="h-4.5 w-4.5 text-yomi-jade" />
                  Portability: Backup Server Profiles
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Export your Yomikura connection profiles to share them across devices, or import a previously exported backup file.
                </p>
                <div className="mt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleExportProfiles}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-yomi-jade px-4 py-2.5 text-xs font-semibold text-ink-950 hover:bg-yomi-jade/90 transition"
                  >
                    <Download className="h-4 w-4" />
                    Export Profiles
                  </button>
                  <label className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer transition">
                    <Upload className="h-4 w-4" />
                    Import Profiles
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportProfiles}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "appearance" && <AppearanceSettingsPanel />}

          {activeTab === "reader" && <ReaderSettingsPanel />}

          {activeTab === "backup" && (
            <BackupSettingsPanel
              backupMessage={backupMessage}
              creatingBackup={creatingBackup}
              restoringBackup={restoringBackup}
              createBackup={() => createBackup()}
              handleFileChange={handleFileChange}
              exportLibraryCsv={() => void exportLibraryCsv()}
            />
          )}

          {activeTab === "offline" && (
            <OfflineSettingsPanel
              cachedChapters={cachedChapters}
              storageUsage={storageUsage}
              storageQuota={storageQuota}
              clearAll={clearAll}
              deleteChapter={deleteChapter}
              confirm={confirm}
            />
          )}

          {activeTab === "advanced" && <AdvancedSettingsPanel />}

          {activeTab === "about" && <AboutSettingsPanel />}
        </div>

      </div>
    </section>
  );
}

export default SettingsPage;
