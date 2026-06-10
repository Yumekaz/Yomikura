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
  HardDrive,
  AlertCircle,
  Palette,
  Sliders,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useSettingsStore, ReaderMode, ServerProfile, isTauri } from "../stores/useSettingsStore";
import { DEFAULT_SERVER_BASE_URL } from "../config/server";
import { createGraphqlClient } from "../api/graphql/client";
import { getErrorMessage } from "../api/suwayomi/errors";
import { useDownloadStore } from "../stores/useDownloadStore";
import { DuplicateScanner } from "../components/library/DuplicateScanner";

type SettingsTab = "connection" | "appearance" | "reader" | "backup" | "offline" | "advanced" | "about";

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

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

function TauriUpdaterRow() {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [checked, setChecked] = useState(false);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setError(null);
    setChecked(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      setUpdateInfo(update || null);
    } catch (err: any) {
      console.error("Update check failed:", err);
      setError(err.message || String(err));
    } finally {
      setChecking(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo) return;
    setDownloading(true);
    setError(null);
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await updateInfo.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength || 0;
            setDownloadProgress({ downloaded: 0, total: totalBytes });
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            setDownloadProgress({ downloaded: downloadedBytes, total: totalBytes });
            break;
          case 'Finished':
            setDownloadProgress(null);
            break;
        }
      });

      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err: any) {
      console.error("Update installation failed:", err);
      setError(err.message || String(err));
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/5 bg-ink-950/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Application Updates</h3>
          <p className="text-xs text-slate-500 mt-1">Keep Yomikura native client up to date.</p>
        </div>
        <button
          onClick={handleCheckUpdate}
          disabled={checking || downloading}
          className="flex items-center gap-1.5 rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 hover:bg-yomi-jade/20 px-3 py-1.5 text-xs font-semibold text-yomi-jade transition disabled:opacity-50"
        >
          {checking ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Checking...</span>
            </>
          ) : (
            <span>Check for Updates</span>
          )}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 leading-normal">{error}</p>
      )}

      {checked && !checking && !updateInfo && !error && (
        <p className="text-xs text-yomi-jade flex items-center gap-1.5 font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          Yomikura is up to date! (v0.1.5)
        </p>
      )}

      {updateInfo && (
        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">
              Update Available: v{updateInfo.version}
            </span>
          </div>
          <button
            onClick={handleInstallUpdate}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-yomi-jade py-2 px-4 text-xs font-bold text-ink-950 hover:bg-yomi-jade/90 transition disabled:opacity-50"
          >
            {downloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {downloadProgress 
                    ? `Downloading: ${Math.round((downloadProgress.downloaded / (downloadProgress.total || 1)) * 100)}%`
                    : "Installing update..."}
                </span>
              </>
            ) : (
              <span>Download & Relaunch Update</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function SuwayomiServerUpdaterRow() {
  const { serverBaseUrl } = useSettingsStore();
  const [checking, setChecking] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [runningVersion, setRunningVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkServerUpdate = async () => {
    setChecking(true);
    setError(null);
    try {
      const cleanUrl = serverBaseUrl.replace(/\/$/, "");
      const infoResponse = await fetch(`${cleanUrl}/api/v1/info`);
      if (infoResponse.ok) {
        const infoData = await infoResponse.json();
        setRunningVersion(infoData.version || "Unknown");
      } else {
        setRunningVersion("2.2.2100");
      }

      const res = await fetch("https://api.github.com/repos/Suwayomi/Suwayomi-Server/releases/latest");
      if (res.ok) {
        const data = await res.json();
        const tag = data.tag_name ? data.tag_name.replace(/^v/, "") : null;
        setLatestVersion(tag);
      } else {
        throw new Error("Failed to check GitHub releases API.");
      }
    } catch (err: any) {
      console.error("Suwayomi Server update check failed:", err);
      setError(err.message || String(err));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkServerUpdate();
  }, [serverBaseUrl]);

  const hasUpdate = useMemo(() => {
    if (!latestVersion || !runningVersion) return false;
    return latestVersion !== runningVersion && !runningVersion.includes("dev");
  }, [latestVersion, runningVersion]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-ink-950/30 p-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-sm text-slate-200">Suwayomi Server Engine</span>
          <p className="text-xs text-slate-500 mt-1">
            Running: {runningVersion || "Checking..."} | Latest: {latestVersion || "Checking..."}
          </p>
        </div>
        <button
          onClick={checkServerUpdate}
          disabled={checking}
          className="rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 hover:bg-yomi-jade/20 px-3 py-1.5 text-xs font-semibold text-yomi-jade transition disabled:opacity-50"
        >
          {checking ? "Checking..." : "Check"}
        </button>
      </div>

      {hasUpdate && (
        <div className="rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 p-3 flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse">
          <span className="text-[11px] text-yomi-mint font-semibold">
            Update available! Version {latestVersion} is out.
          </span>
          <a
            href="https://github.com/Suwayomi/Suwayomi-Server/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="rounded bg-yomi-jade text-ink-950 px-3 py-1 text-[10px] font-bold hover:bg-yomi-jade/90 transition shrink-0"
          >
            Download Release
          </a>
        </div>
      )}

      {error && (
        <span className="text-[10px] text-red-400">Failed to check server updates: {error}</span>
      )}
    </div>
  );
}

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
    accentColor,
    setAccentColor,
    coverDensity,
    setCoverDensity,
    themeMode,
    setThemeMode,
    mockMode,
    setMockMode,
    resetAllSettings,
    serverDataPath,
    customKeybinds,
    setCustomKeybinds,
  } = useSettingsStore();

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileUrlInput, setProfileUrlInput] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);

  const [localUrl, setLocalUrl] = useState(serverBaseUrl);
  const [activeTab, setActiveTab] = useState<SettingsTab>("connection");
  const [backupMessage, setBackupMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  
  const { 
    cachedChapters, 
    loadCachedChapters, 
    deleteChapter, 
    clearAll, 
    storageUsage, 
    storageQuota 
  } = useDownloadStore();

  const [recordingAction, setRecordingAction] = useState<string | null>(null);

  const startRecording = (action: string) => {
    setRecordingAction(action);
  };

  useEffect(() => {
    if (!recordingAction) return;

    const handleKeyRecord = (e: KeyboardEvent) => {
      e.preventDefault();
      const key = e.key.toLowerCase();
      
      const newKeybinds = { ...customKeybinds };
      const currentKeys = newKeybinds[recordingAction] || [];
      if (!currentKeys.includes(key)) {
        newKeybinds[recordingAction] = [...currentKeys, key];
        setCustomKeybinds(newKeybinds);
      }
      setRecordingAction(null);
    };

    window.addEventListener("keydown", handleKeyRecord);
    return () => window.removeEventListener("keydown", handleKeyRecord);
  }, [recordingAction, customKeybinds, setCustomKeybinds]);

  const handleRemoveKey = (action: string, keyToRemove: string) => {
    const newKeybinds = { ...customKeybinds };
    newKeybinds[action] = (newKeybinds[action] || []).filter(k => k !== keyToRemove);
    setCustomKeybinds(newKeybinds);
  };

  const handleResetKeybinds = () => {
    setCustomKeybinds({
      prevPage: ["arrowleft", "a", "backspace"],
      nextPage: ["arrowright", "d", " ", "enter"],
      toggleOverlay: ["escape"],
      cycleFit: ["w"],
      cycleSpread: ["s"]
    });
  };

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
      alert("Failed to export profiles: " + err);
    }
  };

  const handleImportProfiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
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

        const confirmMerge = window.confirm(
          `Found ${validProfiles.length} profiles. Do you want to merge them with your existing profiles? (Cancel will overwrite them entirely)`
        );

        let finalProfiles = [...profiles];
        if (confirmMerge) {
          for (const vp of validProfiles) {
            const exists = finalProfiles.some(p => p.url === vp.url || p.id === vp.id);
            if (!exists) {
              finalProfiles.push(vp);
            }
          }
        } else {
          const confirmOverwrite = window.confirm(
            "Are you sure you want to overwrite all your existing server profiles? This cannot be undone."
          );
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

        alert("Server profiles imported successfully!");
      } catch (err: any) {
        alert("Failed to import profiles: " + err.message);
      }
    };
    reader.readAsText(file);
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
        <div className="flex gap-2 border-b border-white/5 pb-px overflow-x-auto">
          {(["connection", "appearance", "reader", "backup", "offline", "advanced", "about"] as SettingsTab[]).map((tab) => (
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

              {/* Portability: Backup Server Profiles */}
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Download className="h-4.5 w-4.5 text-yomi-jade" />
                  Portability: Backup Server Profiles
                </h3>
                <p className="mt-1 text-xs text-slate-500">
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

          {activeTab === "appearance" && (
            <div className="space-y-6">
              {/* Theme Selection */}
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Palette className="h-5 w-5 text-yomi-jade" />
                  Appearance & Theme
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Customize theme colors, accents, and visual layout.
                </p>

                <div className="mt-6 space-y-6">
                  <div>
                    <label className="block px-1 pb-3 text-sm font-medium text-slate-300">
                      Theme Mode
                    </label>
                    <div className="grid grid-cols-3 gap-3 max-w-md">
                      {(["dark", "light", "system"] as const).map((mode) => {
                        const isSelected = themeMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setThemeMode(mode)}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-sm font-medium transition ${
                              isSelected
                                ? "border-yomi-jade bg-yomi-jade/10 text-yomi-jade"
                                : "border-white/5 bg-ink-950/40 text-slate-400 hover:border-white/10 hover:text-slate-200"
                            }`}
                          >
                            {mode === "light" && <Sun className="h-5 w-5 text-yomi-jade" />}
                            {mode === "dark" && <Moon className="h-5 w-5 text-yomi-jade" />}
                            {mode === "system" && <Monitor className="h-5 w-5 text-yomi-jade" />}
                            <span className="capitalize">{mode}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div>
                    <label className="block px-1 pb-3 text-sm font-medium text-slate-300">
                      Accent Color
                    </label>
                    <div className="flex flex-wrap gap-4">
                      {[
                        { name: "jade", class: "bg-emerald-500", label: "Jade" },
                        { name: "mint", class: "bg-teal-400", label: "Mint" },
                        { name: "gold", class: "bg-amber-500", label: "Gold" },
                        { name: "plum", class: "bg-fuchsia-600", label: "Plum" },
                        { name: "coral", class: "bg-rose-500", label: "Coral" },
                      ].map((color) => {
                        const isSelected = accentColor === color.name;
                        return (
                          <button
                            key={color.name}
                            type="button"
                            onClick={() => setAccentColor(color.name as any)}
                            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                              isSelected
                                ? "border-yomi-jade bg-yomi-jade/10 text-white"
                                : "border-white/5 bg-ink-950/40 text-slate-400 hover:border-white/10 hover:text-slate-200"
                            }`}
                          >
                            <span className={`h-4.5 w-4.5 rounded-full ${color.class} border border-white/15`} />
                            <span>{color.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cover Density */}
                  <div>
                    <label className="block px-1 pb-3 text-sm font-medium text-slate-300">
                      Library Cover Grid Density
                    </label>
                    <div className="grid grid-cols-3 gap-3 max-w-md">
                      {(["compact", "normal", "spacious"] as const).map((density) => {
                        const isSelected = coverDensity === density;
                        return (
                          <button
                            key={density}
                            type="button"
                            onClick={() => setCoverDensity(density)}
                            className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition ${
                              isSelected
                                ? "border-yomi-jade bg-yomi-jade/10 text-yomi-jade"
                                : "border-white/5 bg-ink-950/40 text-slate-400 hover:border-white/10 hover:text-slate-200"
                            }`}
                          >
                            <span className="capitalize">{density}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "reader" && (
            <div className="space-y-6">
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

              {/* Custom Keyboard Shortcuts */}
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-yomi-jade" />
                  Custom Keyboard Shortcuts
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Map reader navigation controls to custom keys. Click Record, then press any key.
                </p>

                <div className="mt-6 space-y-4 max-w-xl">
                  {Object.entries(customKeybinds || {}).map(([action, keys]) => {
                    const friendlyName: Record<string, string> = {
                      prevPage: "Previous Page",
                      nextPage: "Next Page",
                      toggleOverlay: "Toggle Reader Overlay / Exit",
                      cycleFit: "Cycle Scale/Fit Mode",
                      cycleSpread: "Cycle Page Layout Spread"
                    };

                    const isRecording = recordingAction === action;

                    return (
                      <div key={action} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-white/5 bg-ink-950/20 animate-fade-in">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-200">
                            {friendlyName[action] || action}
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {keys.map((k) => (
                              <span key={k} className="inline-flex items-center gap-1 rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300 uppercase">
                                {k === " " ? "SPACE" : k}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveKey(action, k)}
                                  className="text-slate-500 hover:text-red-400 font-bold ml-1"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                            {keys.length === 0 && (
                              <span className="text-[10px] text-slate-600">No keys bound</span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => startRecording(action)}
                          className={`rounded px-3 py-1.5 text-xs font-bold transition ${
                            isRecording
                              ? "bg-red-500/20 text-red-400 border border-red-500/35 animate-pulse"
                              : "bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300"
                          }`}
                        >
                          {isRecording ? "Press Key..." : "Record"}
                        </button>
                      </div>
                    );
                  })}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleResetKeybinds}
                      className="rounded border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
                    >
                      Reset to Defaults
                    </button>
                  </div>
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

          {activeTab === "offline" && (
            <div className="space-y-6">
              {/* Storage Quota Card */}
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-yomi-jade" />
                  Offline Storage Space
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Manage browser space allocated for cached chapters and reader images.
                </p>

                {/* Quota Progress Bar */}
                <div className="mt-6">
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    <span>Space Used</span>
                    <span>{formatBytes(storageUsage)} / {formatBytes(storageQuota || 10 * 1024 * 1024 * 1024)}</span>
                  </div>
                  <div className="w-full bg-ink-950 rounded-full h-3.5 border border-white/5 p-0.5 overflow-hidden">
                    <div 
                      className="bg-yomi-jade h-full rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${Math.min(100, Math.max(1, storageQuota ? (storageUsage / storageQuota) * 100 : 0))}%` 
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-medium">
                    <span>Used: {storageQuota ? ((storageUsage / storageQuota) * 100).toFixed(2) : "0"}%</span>
                    <span>Capacity: {formatBytes(storageQuota)}</span>
                  </div>
                </div>

                <div className="mt-6 border-t border-white/5 pt-5 flex justify-end">
                  <button
                    onClick={async () => {
                      if (window.confirm("Are you sure you want to clear all offline cached chapters? This will purge all browser storage.")) {
                        await clearAll();
                      }
                    }}
                    disabled={cachedChapters.length === 0}
                    className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 hover:text-red-300 transition disabled:opacity-30 disabled:pointer-events-none"
                  >
                    Clear Offline Cache
                  </button>
                </div>
              </div>

              {/* Cached Chapters Registry Card */}
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-yomi-jade" />
                  Cached Chapters ({cachedChapters.length})
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Chapters currently saved inside browser memory for offline reading.
                </p>

                {cachedChapters.length === 0 ? (
                  <div className="mt-8 rounded-xl border border-dashed border-white/5 bg-ink-950/20 py-12 text-center text-slate-500 text-sm">
                    No chapters cached yet. Use the download buttons on the manga details pages to save files.
                  </div>
                ) : (
                  <div className="mt-6 divide-y divide-white/5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {cachedChapters.map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-3.5 gap-4">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-slate-200 truncate">{c.mangaTitle}</h4>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{c.name}</p>
                          <div className="flex gap-2 text-[10px] text-slate-500 mt-1 font-medium">
                            <span>{c.pageCount} Pages</span>
                            <span>•</span>
                            <span>{formatBytes(c.totalSizeBytes)}</span>
                            <span>•</span>
                            <span>Saved {new Date(c.cachedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            if (window.confirm(`Delete cached files for "${c.name}"?`)) {
                              await deleteChapter(c.id);
                            }
                          }}
                          className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
                          title="Delete Cache"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "advanced" && (
            <div className="space-y-6">
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-yomi-jade" />
                  Advanced Settings
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Developer tools, simulations, and complete local state resets.
                </p>

                <div className="mt-6 space-y-6">
                  {/* Mock Mode Toggle */}
                  <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-white/5 bg-ink-950/30">
                    <div className="space-y-1">
                      <span className="font-semibold text-sm text-slate-200">
                        Demo Mode / Playground Simulation
                      </span>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-lg">
                        Enables a simulation mode loaded with mockup catalogs and offline readers. 
                        Useful for previewing Yomikura's premium interfaces when a Suwayomi server backend is unavailable.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMockMode(!mockMode)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        mockMode ? "bg-yomi-jade" : "bg-ink-950 border-white/10"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          mockMode ? "translate-x-5 bg-ink-950" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Local Storage Directory (Tauri only) */}
                  {isTauri() && (
                    <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-white/5 bg-ink-950/30">
                      <div className="space-y-1">
                        <span className="font-semibold text-sm text-slate-200">
                          Application Storage Directory
                        </span>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-lg">
                          Open the local directory containing Suwayomi-Server databases, extensions, configuration files, and execution logs.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { invoke } = await import("@tauri-apps/api/core");
                            await invoke("open_logs_folder", { dataPath: serverDataPath });
                          } catch (err: any) {
                            console.error("Failed to open storage directory:", err);
                            alert("Failed to open directory: " + (err.message || String(err)));
                          }
                        }}
                        className="rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition shrink-0"
                      >
                        Open Directory
                      </button>
                    </div>
                  )}

                  {/* Duplicate Manga Scanner */}
                  <div className="border-t border-white/5 pt-6">
                    <DuplicateScanner />
                  </div>

                  {/* Reset All Settings */}
                  <div className="border-t border-white/5 pt-6 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">Reset Yomikura Configuration</h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Restores all connection profiles, appearances, accent themes, reader configurations, and browse options to factory defaults.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const confirmFirst = window.confirm(
                          "Are you sure you want to reset all Yomikura settings? This will clear all configured server profiles."
                        );
                        if (confirmFirst) {
                          const confirmSecond = window.confirm(
                            "This action cannot be undone. Are you absolutely sure?"
                          );
                          if (confirmSecond) {
                            resetAllSettings();
                            alert("All settings have been successfully reset.");
                          }
                        }
                      }}
                      className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 hover:text-red-300 transition"
                    >
                      Reset All Settings
                    </button>
                  </div>

                  {/* Desktop App Hard Reset (Tauri context only) */}
                  {isTauri() && (
                    <div className="flex items-center justify-between border-t border-white/5 pt-6">
                      <div>
                        <h3 className="text-sm font-medium text-red-400">Total Hard Reset</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Wipes all settings, downloaded chapters, and local caches completely from your computer, then restarts the application.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const confirm1 = window.confirm(
                            "WARNING: This will delete ALL downloaded manga chapters and settings from your device. Are you sure?"
                          );
                          if (confirm1) {
                            const confirm2 = window.confirm(
                              "This will completely wipe your local Yomikura folder and restart. Are you absolutely sure?"
                            );
                            if (confirm2) {
                              try {
                                const { invoke } = await import("@tauri-apps/api/core");
                                await invoke("wipe_all_data");
                              } catch (err) {
                                alert("Failed to execute hard reset: " + err);
                              }
                            }
                          }
                        }}
                        className="rounded-lg border border-red-600 bg-red-600/10 px-4 py-2.5 text-xs font-semibold text-red-200 hover:bg-red-600 hover:text-white transition shadow-sm"
                      >
                        Wipe & Restart
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "about" && (
            <div className="space-y-6">
              <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
                <div className="flex flex-col items-center text-center pb-6 border-b border-white/5">
                  <div className="h-16 w-16 rounded-2xl bg-yomi-jade/10 border border-yomi-jade/20 flex items-center justify-center text-yomi-jade font-bold text-3xl shadow-glow">
                    Y
                  </div>
                  <h2 className="mt-4 text-2xl font-bold text-white tracking-tight">Yomikura</h2>
                  <p className="text-xs font-semibold text-yomi-jade uppercase tracking-wider mt-1">Version 0.1.5</p>
                  <p className="mt-3 text-sm text-slate-400 max-w-md">
                    A premium web & PWA manga reader frontend inspired by Mihon/Tachiyomi UX. 
                    Built for speed, aesthetics, and modularity.
                  </p>
                </div>

                <div className="mt-6 space-y-6">
                  {/* Tauri Updater Section */}
                  {isTauri() && (
                    <TauriUpdaterRow />
                  )}

                  {/* Suwayomi Server Updater Section */}
                  <SuwayomiServerUpdaterRow />

                  {/* Legal Disclaimer Box */}
                  <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-5">
                    <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                      <AlertCircle className="h-4.5 w-4.5" />
                      Section 19.2 Legal Disclaimer
                    </h3>
                    <p className="mt-2 text-xs text-slate-400 leading-relaxed font-serif italic">
                      This project is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider. 
                      This application hosts zero content.{" "}
                      {isTauri() ? (
                        <span>
                          In desktop mode, Yomikura automatically runs a bundled local instance of the Suwayomi server for convenience. Users are responsible for configuring their own sources, repositories, and local library data.
                        </span>
                      ) : (
                        <span>
                          Users are responsible for configuring their own server, sources, and repositories.
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="rounded-lg bg-ink-950/30 border border-white/5 p-4">
                      <span className="font-semibold text-slate-300 block mb-1">Inspirations</span>
                      <span className="text-slate-500">Mihon App & Tachiyomi ecosystem</span>
                    </div>
                    <div className="rounded-lg bg-ink-950/30 border border-white/5 p-4">
                      <span className="font-semibold text-slate-300 block mb-1">Architecture</span>
                      <span className="text-slate-500">Zustand, React Query, Vite, Tailwind CSS</span>
                    </div>
                  </div>
                </div>
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
