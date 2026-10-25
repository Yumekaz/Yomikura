import { ThemedSelect } from "../ui/ThemedSelect";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Server, ShieldCheck, ArrowRight, Loader2, Sparkles, FolderOpen, HardDrive, RefreshCw, AlertTriangle, CloudOff } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { primaryNav, utilityNav, type NavItem } from "../../app/navigation";
import { useSettingsStore, isTauri } from "../../stores/useSettingsStore";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { PwaUpdateNotice } from "./PwaUpdateNotice";
import { ErrorBoundary } from "../ErrorBoundary";
import { useTranslation } from "../../hooks/useTranslation";
import { UpdateNotificationBanner } from "../UpdateNotificationBanner";
import { useDeviceProfileBootstrap } from "../../hooks/useDeviceProfile";
import { useScheduledBackup } from "../../hooks/useScheduledBackup";
import { useScheduledLibraryUpdate } from "../../hooks/useScheduledLibraryUpdate";
import { getCachedChapters } from "../../api/suwayomi/offlineCache";
import { useProgressSynchronization } from "../../hooks/useProgressSynchronization";
import { ProgressSyncStatus } from "../ProgressSyncStatus";
import { BrandLogo, SidebarCompanion, SanctuaryArt } from "../Brand";
import { applyPalette } from "../../theme/palettes";
import { DesktopDownloadLink } from "../onboarding/DesktopDownloadLink";
import { DEFAULT_SERVER_BASE_URL } from "../../config/server";

function ProfileSwitcher() {
  const { profiles, activeProfileId, setActiveProfileId } = useSettingsStore();
  const queryClient = useQueryClient();

  if (profiles.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-ink-950/60 border border-white/5 hover:border-yomi-jade/30 px-2.5 py-1.5 text-xs text-slate-400 transition-[border-color,background-color] duration-150 shadow-sm">
      <Server className="h-3.5 w-3.5 text-yomi-jade shrink-0" />
      <ThemedSelect
        aria-label="Server profile"
        value={activeProfileId}
        onValueChange={(value) => {
          setActiveProfileId(value);
          queryClient.clear();
        }}
        className="flex-1 bg-transparent text-slate-300 outline-none font-medium cursor-pointer"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id} className="bg-ink-900 text-slate-200">
            {p.name}
          </option>
        ))}
      </ThemedSelect>
    </div>
  );
}

function BackendHealthBadge() {
  const { connectionStatus, mockMode } = useSettingsStore();

  let dotColor = "bg-slate-500";
  let textColor = "text-slate-400";
  let statusText = "Not connected";

  if (mockMode) {
    dotColor = "bg-yomi-jade";
    statusText = "Demo library";
  } else if (connectionStatus === "connected") {
    dotColor = "bg-yomi-jade";
    textColor = "text-yomi-mint";
    statusText = "Ready to read";
  } else if (connectionStatus === "testing") {
    dotColor = "bg-blue-400 animate-pulse";
    textColor = "text-blue-400";
    statusText = "Connecting...";
  } else if (connectionStatus === "error") {
    dotColor = "bg-amber-400";
    textColor = "text-red-400";
    statusText = "Reading offline";
  }

  return (
    <div className="yomi-engine-status" role="status" aria-live="polite">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className={textColor}>{statusText}</span>
    </div>
  );
}

function AppShell() {
  useEffect(() => () => {
    useDownloadStore.getState().pauseForShutdown();
  }, []);

  const { t } = useTranslation();
  const { 
    connectionStatus, 
    testConnection, 
    colorPalette,
    themeMode, 
    mockMode, 
    setMockMode, 
    serverBaseUrl, 
    setServerBaseUrl, 
    errorMessage,
    highContrastMode,
    reducedMotion,
    hasHydrated,
    serverDataPath,
    managedLibraryProfileId,
    activeProfileId,
  } = useSettingsStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [setupActive, setSetupActive] = useState(false);
  const [managedStartupDismissed, setManagedStartupDismissed] = useState(false);
  const [wasOffline, setWasOffline] = useState(connectionStatus === "error");
  useEffect(() => {
    if (connectionStatus === "error") setWasOffline(true);
    if (connectionStatus === "connected" || mockMode) setWasOffline(false);
    if (mockMode) setSetupActive(false);
  }, [connectionStatus, mockMode]);

  useDeviceProfileBootstrap();
  useScheduledBackup();
  useScheduledLibraryUpdate();
  useProgressSynchronization();

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("menu-check-updates", () => {
        window.dispatchEvent(new Event("yomikura-check-updates"));
      });
    })();
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow().setTheme(themeMode === "system" ? null : themeMode),
    ).catch((error) => console.warn("Window appearance could not follow the selected theme:", error));
  }, [themeMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      } else if (e.key === "Escape" && showShortcuts) {
        setShowShortcuts(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showShortcuts]);

  useEffect(() => {
    // Demo mode is an explicit user choice. A healthy local server must not
    // silently switch the application back to live data on the next load.
    if (hasHydrated && !mockMode) {
      void testConnection();
    }
  }, [hasHydrated, mockMode, serverBaseUrl, testConnection]);

  useEffect(() => {
    if (!hasHydrated || (!mockMode && connectionStatus !== "connected")) return;
    void useDownloadStore.getState().restoreDownloadJobs();
  }, [connectionStatus, hasHydrated, mockMode, serverBaseUrl]);

  // Effect to apply dynamic theme and accent color variables
  useEffect(() => {
    // 1. Theme application
    const htmlElement = document.documentElement;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = themeMode === "dark" || themeMode === "system" && systemTheme.matches;
      htmlElement.classList.toggle("light-theme", !dark);
      applyPalette(htmlElement, colorPalette, dark);
    };
    applyTheme();
    if (themeMode === "system") systemTheme.addEventListener("change", applyTheme);

    htmlElement.classList.toggle("high-contrast", highContrastMode);
    htmlElement.classList.toggle("reduce-motion", reducedMotion);
    return () => systemTheme.removeEventListener("change", applyTheme);
  }, [themeMode, colorPalette, highContrastMode, reducedMotion]);

  const showOfflineBanner = (connectionStatus === "error" || connectionStatus === "testing" && wasOffline) && !location.pathname.startsWith("/reader/") && !mockMode;

  const isUnconnected = connectionStatus !== "connected";
  const isSettingsRoute = /^\/settings(?:\/|$)/.test(location.pathname);
  const isHistoryRoute = /^\/history\/?$/.test(location.pathname);
  const isOfflineRoute = /^\/(?:library|downloads|history)\/?$/.test(location.pathname)
    || /^\/(?:manga|reader)\/[^/]+\/?$/.test(location.pathname);
  const checkOfflineCache = hasHydrated && isUnconnected && !mockMode && !setupActive
    && !!serverBaseUrl.trim() && isOfflineRoute;
  const offlineChapters = useQuery({
    // Scope availability to the active backend. Never pass an empty URL, which
    // would ask the cache for chapters belonging to every backend.
    queryKey: ["offline-shell-chapters", serverBaseUrl],
    queryFn: () => getCachedChapters(serverBaseUrl),
    select: (chapters) => chapters.some((chapter) => chapter.pageCount > 0 && chapter.pages.length > 0),
    enabled: checkOfflineCache,
    retry: false,
  });
  const hasSavedPages = isOfflineRoute && offlineChapters.data === true;
  const canOpenOffline = hasSavedPages || isHistoryRoute;
  const checkingOfflineCache = checkOfflineCache && offlineChapters.isFetching && !canOpenOffline;
  const ownsLocalProfile = isTauri() && !!serverDataPath && managedLibraryProfileId === activeProfileId;
  const shouldStartManaged = ownsLocalProfile && isUnconnected && !managedStartupDismissed;
  const showOnboarding = !mockMode && !isSettingsRoute && (setupActive || shouldStartManaged || isUnconnected && !canOpenOffline);

  if (!hasHydrated || checkingOfflineCache) {
    return <div className="yomi-route-loading" role="status" aria-label={checkingOfflineCache ? "Loading saved chapters" : "Loading saved settings"}><span className="yomi-skeleton h-8 w-40" /><span className="yomi-skeleton h-24 w-full" /></div>;
  }

  if (showOnboarding) {
    return (
      <WelcomeOnboarding 
        serverBaseUrl={serverBaseUrl}
        setServerBaseUrl={setServerBaseUrl}
        testConnection={testConnection}
        errorMessage={errorMessage}
        setMockMode={setMockMode}
        onBeginSetup={() => setSetupActive(true)}
        onConnected={() => { setSetupActive(false); setManagedStartupDismissed(false); }}
        onReadOffline={canOpenOffline ? () => { setManagedStartupDismissed(true); setSetupActive(false); } : undefined}
      />
    );
  }

  if (location.pathname.startsWith("/reader/")) {
    return <main id="main-content" className="min-h-screen bg-black" tabIndex={-1}><ErrorBoundary key={`${serverBaseUrl}::${mockMode}`}><Outlet /></ErrorBoundary></main>;
  }

  return (
    <div className="yomi-app-shell text-slate-100">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-ink-950">Skip to content</a>
      <aside className="yomi-sidebar">
        <BrandLockup />
        
        {/* Profile Switcher */}
        <div className="yomi-profile-switcher">
          <ProfileSwitcher />
        </div>

        <nav className="yomi-primary-nav" aria-label="Primary navigation">
          {primaryNav.map((item) => (
            <ShellNavLink key={item.path} item={item} />
          ))}
        </nav>
        <div className="yomi-sidebar-footer">
          <SidebarCompanion />
          {utilityNav.map((item) => <ShellNavLink key={item.path} item={item} />)}
          <BackendHealthBadge />
          <ProgressSyncStatus />
        </div>
      </aside>
      <main id="main-content" className="yomi-main" tabIndex={-1}>
        <div className="px-4 pt-2 lg:px-0">
          <UpdateNotificationBanner />
        </div>
        <PwaUpdateNotice />
        {mockMode && !location.pathname.startsWith("/reader/") && (
          <div className="yomi-demo-notice">
            <span><Sparkles aria-hidden="true" />Demo library <span className="yomi-demo-description">· Explore with original sample books. Your library stays separate.</span></span>
            <button type="button" onClick={() => { setMockMode(false); navigate("/settings/connection"); }}>Connect your library <ArrowRight aria-hidden="true" /></button>
          </div>
        )}
        {showOfflineBanner && (
          <div className="yomi-offline-notice">
            <CloudOff aria-hidden="true" />
            <div role="status"><strong>Reading offline</strong><p>{hasSavedPages ? "Your saved chapters are here. Progress will sync when your library reconnects." : isHistoryRoute ? "Your recent reading stays on this device. Reconnect to open chapters from your library." : "Your library couldn’t be reached. Reconnect when you’re ready."}</p></div>
            <button type="button" className="yomi-button yomi-button-secondary" disabled={connectionStatus === "testing"} onClick={() => void testConnection()}>{connectionStatus === "testing" ? "Reconnecting…" : "Reconnect"}</button>
          </div>
        )}
        <ErrorBoundary key={`${serverBaseUrl}::${mockMode}`}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <MobileNav />
      {showShortcuts && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in"
          onClick={() => setShowShortcuts(false)}
        >
          <div 
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-900/80 p-8 backdrop-blur-2xl shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowShortcuts(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 text-sm font-semibold transition"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6 border-b border-white/5 pb-3">
              <Sparkles className="h-5 w-5 text-yomi-jade" />
              Keyboard Shortcuts Help
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-yomi-jade">Navigation</h3>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Next Page</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">D</kbd>
                      <span className="text-slate-500">or</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">➜</kbd>
                      <span className="text-slate-500">or</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">Space</kbd>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Previous Page</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">A</kbd>
                      <span className="text-slate-500">or</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">⬅</kbd>
                      <span className="text-slate-500">or</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">Backspace</kbd>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Exit Reader</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">Esc</kbd>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-yomi-jade">Reader Settings</h3>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Cycle Fit Mode</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">W</kbd>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Cycle Page Spread</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">S</kbd>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Show Keyboard Help</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-xs">?</kbd>
                  </div>
                </div>
              </div>
            </div>
            
            <p className="mt-8 text-xs text-slate-500 text-center border-t border-white/5 pt-4">
              Press <kbd className="px-1 rounded bg-white/5 border border-white/5">?</kbd> at any time to toggle this help cheatsheet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function BrandLockup() {
  return (
    <div className="yomi-brand">
      <div className="yomi-brand-mark">
        <BrandLogo />
      </div>
      <div>
        <p>Yomikura</p>
        <span>Your reading sanctuary</span>
      </div>
    </div>
  );
}

export function WelcomeOnboarding({
  serverBaseUrl,
  setServerBaseUrl,
  testConnection,
  errorMessage,
  setMockMode,
  onBeginSetup,
  onConnected,
  onReadOffline,
}: {
  serverBaseUrl: string;
  setServerBaseUrl: (url: string) => void;
  testConnection: () => Promise<boolean>;
  errorMessage: string;
  setMockMode: (mock: boolean) => void;
  onBeginSetup: () => void;
  onConnected: () => void;
  onReadOffline?: () => void;
}) {
  const { serverDataPath, setServerDataPath, setPortableMode, managedLibraryProfileId, activeProfileId } = useSettingsStore();
  const [currentStep, setCurrentStep] = useState<"storage" | "backend" | "ready">(isTauri() ? "storage" : "ready");
  const [javaStatus, setJavaStatus] = useState<"checking" | "downloading" | "installed" | "missing">("checking");
  const [serverStatus, setServerStatus] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [localError, setLocalError] = useState("");
  const [inputUrl, setInputUrl] = useState(serverBaseUrl === DEFAULT_SERVER_BASE_URL ? "" : serverBaseUrl);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [retryEpoch, setRetryEpoch] = useState(0);
  const stopAttempt = useRef<() => Promise<void>>(async () => {});

  const inTauri = isTauri();

  const friendlyStartupError = (error: string) => {
    const normalized = error.toLowerCase();
    if (normalized.includes("access is denied") || normalized.includes("permission denied") || normalized.includes("not writable")) {
      return "Yomikura cannot write to the selected storage folder. Choose a different folder that belongs to your Windows account, then try again.";
    }
    if (normalized.includes("java") || normalized.includes("jre")) {
      return "Yomikura could not start its private Java runtime. Retry once; if that does not help, choose a different storage folder so it can set up a fresh runtime.";
    }
    if (normalized.includes("did not open port") || normalized.includes("did not answer")) {
      return "The local reading engine took too long to start. Retry once. If it happens again, choose a different storage folder so Yomikura can rebuild its local engine safely.";
    }
    if (normalized.includes("download")) {
      return "Yomikura could not download a required local component. Check your connection, then retry. Your library and downloaded chapters are safe.";
    }
    return "The local reading engine could not start. Retry once; if it continues, choose a different storage folder. Your existing library data will not be changed.";
  };

  useEffect(() => {
    if (!inTauri) {
      setCurrentStep("ready");
    } else if (serverDataPath && (managedLibraryProfileId === activeProfileId || !managedLibraryProfileId && activeProfileId === "default" && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(serverBaseUrl))) {
      onBeginSetup();
      if (!managedLibraryProfileId) setServerDataPath(serverDataPath);
      setCurrentStep("backend");
    }
  }, [inTauri, serverDataPath]);

  useEffect(() => {
    if (currentStep !== "backend") return;

    let active = true;
    let backendLaunchRequested = false;
    let transitioningToReady = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const stopOwnedAttempt = async () => {
      if (!backendLaunchRequested || transitioningToReady) return;
      backendLaunchRequested = false;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_backend");
    };
    stopAttempt.current = stopOwnedAttempt;

    const runBackendLifecycle = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");

        setJavaStatus("checking");
        const hasJava = await invoke<boolean>("check_java_installed", { dataPath: serverDataPath });
        if (!active) return;

        if (!hasJava) {
          setJavaStatus("downloading");
          try {
            await invoke("download_and_install_jre", { dataPath: serverDataPath });
          } catch (err: any) {
            console.error("Local JRE auto-install failed:", err);
            if (active) {
              setJavaStatus("missing");
              setLocalError(err.message || String(err));
            }
            return;
          }
          if (!active) return;

          const hasJavaPost = await invoke<boolean>("check_java_installed", { dataPath: serverDataPath });
          if (!active) return;
          if (!hasJavaPost && active) {
            setJavaStatus("missing");
            return;
          }
        }

        setJavaStatus("installed");
        setServerStatus("starting");

        await invoke<string>("download_suwayomi_jar", { dataPath: serverDataPath });
        if (!active) return;

        backendLaunchRequested = true;
        const port = await invoke<number>("start_backend", { dataPath: serverDataPath });
        if (!active) return;

        setServerBaseUrl(`http://127.0.0.1:${port}`);

        let attempts = 0;
        const checkConnection = async () => {
          attempts++;
          try {
            const ok = await testConnection();
            if (ok && active) {
              setServerStatus("running");
              finishTimer = setTimeout(() => {
                if (active) {
                  transitioningToReady = true;
                  onConnected();
                }
              }, 1000);
              return true;
            }
          } catch {
            // silent retry
          }

          if (attempts > 12 && active) {
            setServerStatus("error");
            setLocalError("Suwayomi opened its local port but did not answer the application health check. Retry once, then open the logs from Settings if it continues.");
            return true;
          }
          return false;
        };

        const pollConnection = async () => {
          const done = await checkConnection();
          if (!done && active) {
            retryTimer = setTimeout(pollConnection, 1000);
          }
        };
        await pollConnection();
      } catch (err: any) {
        if (active) {
          setServerStatus("error");
          setLocalError(err.message || String(err));
        }
      }
    };

    runBackendLifecycle();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (finishTimer) clearTimeout(finishTimer);
      void stopOwnedAttempt().catch((err) => console.warn("Failed to stop abandoned local backend:", err));
    };
  }, [currentStep, serverDataPath, retryEpoch]);

  const chooseLocalProfile = () => {
    const settings = useSettingsStore.getState();
    const local = settings.profiles.find((profile) => profile.id === settings.managedLibraryProfileId);
    if (local) settings.setActiveProfileId(local.id);
    else if (settings.profiles.length === 1 && settings.activeProfileId === "default" && settings.serverBaseUrl === DEFAULT_SERVER_BASE_URL) settings.updateProfile("default", "On this device", DEFAULT_SERVER_BASE_URL);
    else {
      settings.addProfile("On this device", DEFAULT_SERVER_BASE_URL);
      const profiles = useSettingsStore.getState().profiles;
      const added = profiles[profiles.length - 1];
      if (added) settings.setActiveProfileId(added.id);
    }
  };

  const handleSelectCustomFolder = async () => {
    try {
      setLocalError("");
      setPortableMode(false);
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string | null>("select_directory");
      if (path) {
        onBeginSetup();
        chooseLocalProfile();
        setServerDataPath(path);
        setCurrentStep("backend");
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  };

  const handleSelectDefaultFolder = async () => {
    try {
      setLocalError("");
      setPortableMode(false);
      onBeginSetup();
      const { appLocalDataDir } = await import("@tauri-apps/api/path");
      const localData = await appLocalDataDir();
      const defaultPath = `${localData.replace(/[\\/]+$/, "")}/server-data`.replace(/\\/g, "/");
      chooseLocalProfile();
      setServerDataPath(defaultPath);
      setCurrentStep("backend");
    } catch (err) {
      console.error("Failed to get local data dir:", err);
      setLocalError("We couldn’t open your usual library location. Choose another folder and try again.");
    }
  };

  const handleSelectPortableFolder = async () => {
    try {
      setLocalError("");
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("get_portable_data_path");
      onBeginSetup();
      chooseLocalProfile();
      setPortableMode(true);
      setServerDataPath(path);
      setCurrentStep("backend");
    } catch (err) {
      console.error("Failed to get portable data path:", err);
    }
  };

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    setTestStatus("testing");
    onBeginSetup();
    setLocalError("");
    if (inTauri && managedLibraryProfileId === activeProfileId) {
      const settings = useSettingsStore.getState();
      settings.addProfile("Connected library", inputUrl.trim());
      const profiles = useSettingsStore.getState().profiles;
      const added = profiles[profiles.length - 1];
      if (added) settings.setActiveProfileId(added.id);
    }
    setServerBaseUrl(inputUrl.trim());

    try {
      const ok = await testConnection();
      if (ok) {
        setTestStatus("success");
        onConnected();
      } else {
        setTestStatus("error");
        setLocalError(errorMessage || "Failed to reach Suwayomi server.");
      }
    } catch (err: any) {
      setTestStatus("error");
      setLocalError(err.message || "Connection failed.");
    }
  };

  const triggerRetry = async () => {
    try {
      await stopAttempt.current();
      setLocalError(""); setJavaStatus("checking"); setServerStatus("idle");
      setRetryEpoch((value) => value + 1);
    } catch (error) { setLocalError(String(error)); }
  };

  const chooseAnotherStorage = async () => {
    try {
      await stopAttempt.current();
      setLocalError(""); setJavaStatus("checking"); setServerStatus("idle"); setCurrentStep("storage");
    } catch (error) { setLocalError(String(error)); }
  };

  const openDiagnosticLogs = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_logs_folder", { dataPath: serverDataPath });
    } catch (error) {
      console.warn("Could not open local diagnostics:", error);
    }
  };

  return (
    <div className="yomi-onboarding">
      <div className="yomi-welcome-art" aria-hidden="true"><SanctuaryArt /><div><span>YOMIKURA</span><p>Stories feel brighter here.</p></div></div>
      <div className="yomi-setup-panel">
        {/* Brand Logo */}
        <div className="yomi-welcome-logo">
          <BrandLogo />
        </div>

        <h1 className="yomi-welcome-brand">
          Yomikura
        </h1>
        
        {(currentStep === "storage" || currentStep === "ready") && (
          <div className="yomi-welcome-ready">
            <h2>Your next story starts here.</h2>
            <p>{inTauri ? "We’ll prepare your private library and everything it needs. Choose your books and start reading." : "The desktop app prepares your private library for you. Pick your sources, find a story, and make yourself at home."}</p>
            {inTauri ? <>
              <button type="button" onClick={() => void handleSelectDefaultFolder()} className="yomi-button yomi-button-primary yomi-welcome-primary">Set up my library<ArrowRight aria-hidden="true" /></button>
              <span className="yomi-welcome-hint">A one-time download. We’ll take care of the setup.</span>
              <details className="yomi-setup-options"><summary>Choose where to keep my library</summary><p>The recommended location works for most readers. You can also use another drive or keep your library beside the app.</p><div><button type="button" className="yomi-button yomi-button-secondary" onClick={() => void handleSelectCustomFolder()}><FolderOpen aria-hidden="true" />Choose a folder</button><button type="button" className="yomi-button yomi-button-secondary" onClick={() => void handleSelectPortableFolder()}><HardDrive aria-hidden="true" />Portable mode</button></div></details>
              {localError && <p className="yomi-setup-error" role="alert">{localError}</p>}
            </> : <><DesktopDownloadLink /><span className="yomi-welcome-hint">Install once. Your library opens right in the app.</span></>}
            <details className="yomi-connect-details">
              <summary>Connect an existing library</summary>
              <p>Already have a Suwayomi library? Connect it here to read in your browser or on another device.</p>
              <form onSubmit={handleTestAndSave}>
                <label htmlFor="welcome-library-address">Library address</label>
                <input id="welcome-library-address" type="url" required placeholder="Paste your library’s address" value={inputUrl} onChange={(event) => setInputUrl(event.target.value)} className="yomi-field" />
                <button type="submit" disabled={testStatus === "testing"} className="yomi-button yomi-button-secondary">{testStatus === "testing" ? <><Loader2 className="animate-spin" />Connecting…</> : <><Server />Connect & Save</>}</button>
                {testStatus === "error" && <p role="alert">We couldn’t reach your library. Check its address and connection, then try again.</p>}
              </form>
              {testStatus === "error" && localError && <details className="yomi-error-details"><summary>Technical details</summary><pre>{localError}</pre></details>}
            </details>
            <div className="yomi-demo-choice"><span>Just looking around?</span><button type="button" onClick={() => setMockMode(true)}>Explore Demo Library<ArrowRight aria-hidden="true" /></button></div>
          </div>
        )}

        {currentStep === "backend" && (
          <div className="yomi-local-setup" aria-live="polite">
            {javaStatus !== "missing" && serverStatus !== "error" ? <>
              <span className="yomi-setup-emblem">{serverStatus === "running" ? <ShieldCheck aria-hidden="true" /> : <Loader2 className="animate-spin" aria-hidden="true" />}</span>
              <h2>{serverStatus === "running" ? "Your library is ready." : "Making room for your stories…"}</h2>
              <p>{javaStatus === "downloading" ? "Downloading the reading essentials. This is only needed the first time." : serverStatus === "starting" ? "Preparing your library. We’ll open it as soon as it’s ready." : "Checking what’s already available on this computer."}</p>
              <ol className="yomi-setup-progress" aria-label="Library setup progress"><li data-complete={javaStatus === "installed"}><span aria-hidden="true">1</span>Prepare reading essentials</li><li data-complete={serverStatus === "running"}><span aria-hidden="true">2</span>Open your private library</li></ol>
            </> : <>
              <span className="yomi-setup-emblem"><AlertTriangle aria-hidden="true" /></span><h2>Your library couldn’t start.</h2><p>{friendlyStartupError(localError)}</p>
              <div className="yomi-setup-actions"><button type="button" className="yomi-button yomi-button-primary" onClick={() => void triggerRetry()}><RefreshCw aria-hidden="true" />Try again</button><button type="button" className="yomi-button yomi-button-secondary" onClick={() => void chooseAnotherStorage()}>Choose another folder</button></div>
              <details className="yomi-error-details"><summary>Help with setup</summary><p>Retry when your connection is available. For a managed or work computer, a different folder may help.</p><button type="button" className="yomi-button yomi-button-secondary" onClick={() => void openDiagnosticLogs()}>Open setup logs</button><pre>{localError}</pre><a href="https://adoptium.net/temurin/releases/?version=21&package=jre" target="_blank" rel="noreferrer">Manual runtime download</a></details>
              <button type="button" className="yomi-quiet-button" onClick={() => setMockMode(true)}>Explore the demo while you wait</button>
            </>}
            {onReadOffline && <button type="button" className="yomi-button yomi-button-secondary" onClick={onReadOffline}>Continue offline</button>}
          </div>
        )}

        {/* Footer legal disclaimer */}
        <p className="yomi-welcome-footer">
          Your books. Your reading room.
        </p>
      </div>
    </div>
  );
}

function ShellNavLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const isDiscovery = item.path === "/browse/sources" && (/^\/browse(?:\/|$)/.test(pathname) || /^\/extensions(?:\/|$)/.test(pathname));
  const Icon = item.icon;
  const { t } = useTranslation();
  const translationKey = item.label.toLowerCase().replace(" ", "_") as any;
  const label = t(translationKey) === translationKey ? item.label : t(translationKey);
  return (
    <NavLink
      className={({ isActive }) =>
        `yomi-nav-link group ${isActive || isDiscovery ? "is-active" : ""}`
      }
      to={item.path}
    >
      {({ isActive }) => (
        <>
          <Icon className="h-[18px] w-[18px]" />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/5 bg-ink-900/60 backdrop-blur-xl px-2 py-2 lg:hidden"
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-6 gap-1">
        {[...primaryNav, ...utilityNav].map((item) => {
          const Icon = item.icon;
          const translationKey = item.label.toLowerCase().replace(" ", "_") as any;
          const label = t(translationKey) === translationKey ? item.label : t(translationKey);
          return (
            <NavLink
              key={item.path}
              className={({ isActive }) =>
                `group flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium transition-[color,background-color,transform] duration-150 active:scale-[.97] ${
                  isActive ? "bg-yomi-jade/15 text-yomi-mint scale-[1.03]" : "text-slate-500 hover:text-slate-300"
                }`
              }
              to={item.path}
            >
              <Icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default AppShell;
