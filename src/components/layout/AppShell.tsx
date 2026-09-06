import { useEffect, useState } from "react";
import { BookOpen, Server, Play, ShieldCheck, ArrowRight, Loader2, Sparkles, ChevronDown, ChevronUp, FolderOpen, HardDrive, RefreshCw, AlertTriangle } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { browseNav, primaryNav, utilityNav, type NavItem } from "../../app/navigation";
import { useSettingsStore, isTauri } from "../../stores/useSettingsStore";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { ErrorBoundary } from "../ErrorBoundary";
import { useTranslation } from "../../hooks/useTranslation";
import { UpdateNotificationBanner } from "../UpdateNotificationBanner";
import { useDeviceProfileBootstrap } from "../../hooks/useDeviceProfile";

function ProfileSwitcher() {
  const { profiles, activeProfileId, setActiveProfileId } = useSettingsStore();
  const queryClient = useQueryClient();

  if (profiles.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-ink-950/60 border border-white/5 hover:border-yomi-jade/30 px-2.5 py-1.5 text-xs text-slate-400 transition-all duration-300 shadow-sm hover:shadow-glow-hover">
      <Server className="h-3.5 w-3.5 text-yomi-jade shrink-0" />
      <select
        value={activeProfileId}
        onChange={(e) => {
          setActiveProfileId(e.target.value);
          queryClient.clear();
        }}
        className="flex-1 bg-transparent text-slate-300 outline-none font-medium cursor-pointer"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id} className="bg-ink-900 text-slate-200">
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function BackendHealthBadge() {
  const { connectionStatus, mockMode, serverBaseUrl } = useSettingsStore();

  let dotColor = "bg-slate-500";
  let textColor = "text-slate-400";
  let statusText = "Disconnected";

  if (connectionStatus === "connected") {
    const port = serverBaseUrl.split(":").pop() || "4567";
    dotColor = "bg-yomi-jade animate-pulse";
    textColor = "text-yomi-mint";
    statusText = `Local Engine: Active (Port ${port})`;
  } else if (connectionStatus === "testing") {
    dotColor = "bg-blue-400 animate-pulse";
    textColor = "text-blue-400";
    statusText = "Connecting...";
  } else if (mockMode) {
    dotColor = "bg-purple-400 animate-pulse";
    textColor = "text-purple-300";
    statusText = "Demo Sandbox Mode";
  } else if (connectionStatus === "error") {
    dotColor = "bg-red-400 animate-pulse";
    textColor = "text-red-400";
    statusText = "Offline";
  }

  return (
    <div className="yomi-engine-status">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className={textColor}>{statusText}</span>
    </div>
  );
}

function AppShell() {
  useEffect(() => () => {
    useDownloadStore.getState().cancelAllDownloads();
  }, []);

  const { t } = useTranslation();
  const { 
    connectionStatus, 
    testConnection, 
    accentColor, 
    themeMode, 
    mockMode, 
    setMockMode, 
    serverBaseUrl, 
    setServerBaseUrl, 
    errorMessage,
    highContrastMode,
    reducedMotion,
  } = useSettingsStore();
  const location = useLocation();

  const [showShortcuts, setShowShortcuts] = useState(false);

  useDeviceProfileBootstrap();

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
    testConnection();
  }, [testConnection]);

  // Effect to apply dynamic theme and accent color variables
  useEffect(() => {
    // 1. Theme application
    const htmlElement = document.documentElement;
    const isDark = 
      themeMode === "dark" || 
      (themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      
    if (isDark) {
      htmlElement.classList.remove("light-theme");
    } else {
      htmlElement.classList.add("light-theme");
    }

    // 2. Accent color application (RGB values)
    const accents: Record<string, string> = {
      // Keep the persisted key for backwards compatibility; it is now the
      // branded warm-paper default rather than the old green accent.
      jade: "239, 234, 226",
      mint: "169, 242, 212",
      gold: "242, 200, 121",
      plum: "182, 155, 255",
      coral: "239, 138, 122"
    };
    
    const rgb = accents[accentColor] || accents.jade;
    htmlElement.style.setProperty("--yomi-accent", rgb);

    htmlElement.classList.toggle("high-contrast", highContrastMode);
    htmlElement.classList.toggle("reduce-motion", reducedMotion);
  }, [themeMode, accentColor, highContrastMode, reducedMotion]);

  const showOfflineBanner = connectionStatus === "error" && !location.pathname.startsWith("/reader/") && mockMode;

  const isUnconnected = connectionStatus === "error" || connectionStatus === "disconnected";
  const showOnboarding = isUnconnected && !mockMode && location.pathname !== "/settings";

  if (showOnboarding) {
    return (
      <WelcomeOnboarding 
        serverBaseUrl={serverBaseUrl}
        setServerBaseUrl={setServerBaseUrl}
        testConnection={testConnection}
        errorMessage={errorMessage}
        setMockMode={setMockMode}
      />
    );
  }

  return (
    <div className="yomi-app-shell text-slate-100">
      <aside className="yomi-sidebar">
        <BrandLockup />
        <BackendHealthBadge />
        
        {/* Profile Switcher */}
        <div className="mt-5 px-1">
          <ProfileSwitcher />
        </div>

        <nav className="mt-6 space-y-1" aria-label="Primary navigation">
          {primaryNav.map((item) => (
            <ShellNavLink key={item.path} item={item} />
          ))}
        </nav>
        <div className="yomi-nav-section">
          <p className="yomi-nav-label">Discover</p>
          <nav className="mt-2 space-y-1" aria-label="Browse navigation">
            {browseNav.map((item) => (
              <ShellNavLink key={item.path} item={item} />
            ))}
          </nav>
        </div>
        <div className="yomi-sidebar-footer">
          {utilityNav.map((item) => <ShellNavLink key={item.path} item={item} />)}
          <p>Private by default. Your library stays on this device.</p>
        </div>
      </aside>
      <main className="yomi-main">
        <div className="px-4 pt-2 lg:px-0">
          <UpdateNotificationBanner />
        </div>
        {showOfflineBanner && (
          <div className="mx-auto my-3 max-w-xl rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 text-center text-xs font-semibold text-amber-300 backdrop-blur-md shadow-md animate-fade-in flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Suwayomi server is offline. Yomikura is running in offline mode.</span>
          </div>
        )}
        <ErrorBoundary>
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
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">D</kbd>
                      <span className="text-slate-500">or</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">➜</kbd>
                      <span className="text-slate-500">or</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">Space</kbd>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Previous Page</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">A</kbd>
                      <span className="text-slate-500">or</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">⬅</kbd>
                      <span className="text-slate-500">or</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">Backspace</kbd>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Exit Reader</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">Esc</kbd>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-yomi-jade">Reader Settings</h3>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Cycle Fit Mode</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">W</kbd>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Cycle Page Spread</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">S</kbd>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Show Keyboard Help</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/5 text-[10px]">?</kbd>
                  </div>
                </div>
              </div>
            </div>
            
            <p className="mt-8 text-[10px] text-slate-500 text-center border-t border-white/5 pt-4">
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
        <img src="/yomikura-logo.png" alt="Yomikura" className="h-full w-full object-cover" />
      </div>
      <div>
        <p>Yomikura</p>
        <span>Desktop reader</span>
      </div>
    </div>
  );
}

function WelcomeOnboarding({
  serverBaseUrl,
  setServerBaseUrl,
  testConnection,
  errorMessage,
  setMockMode,
}: {
  serverBaseUrl: string;
  setServerBaseUrl: (url: string) => void;
  testConnection: () => Promise<boolean>;
  errorMessage: string;
  setMockMode: (mock: boolean) => void;
}) {
  const { serverDataPath, setServerDataPath, setPortableMode } = useSettingsStore();
  const [currentStep, setCurrentStep] = useState<"storage" | "backend" | "ready">("storage");
  const [javaStatus, setJavaStatus] = useState<"checking" | "downloading" | "installed" | "missing">("checking");
  const [serverStatus, setServerStatus] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [localError, setLocalError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inputUrl, setInputUrl] = useState(serverBaseUrl);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  const inTauri = isTauri();

  useEffect(() => {
    if (!inTauri) {
      setCurrentStep("ready");
    } else if (serverDataPath) {
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
          if (!hasJavaPost && active) {
            setJavaStatus("missing");
            return;
          }
        }

        setJavaStatus("installed");
        setServerStatus("starting");

        await invoke<string>("download_suwayomi_jar", { dataPath: serverDataPath });

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
                  setCurrentStep("ready");
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
      if (backendLaunchRequested && !transitioningToReady && isTauri()) {
        void import("@tauri-apps/api/core").then(({ invoke }) => {
          void invoke("stop_backend").catch((err) => {
            console.warn("Failed to stop abandoned local backend:", err);
          });
        });
      }
    };
  }, [currentStep, serverDataPath]);

  const handleSelectCustomFolder = async () => {
    try {
      setPortableMode(false);
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string | null>("select_directory");
      if (path) {
        setServerDataPath(path);
        setCurrentStep("backend");
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  };

  const handleSelectDefaultFolder = async () => {
    try {
      setPortableMode(false);
      const { localDataDir } = await import("@tauri-apps/api/path");
      const localData = await localDataDir();
      const defaultPath = `${localData}/app.yomikura/server-data`.replace(/\\/g, "/");
      setServerDataPath(defaultPath);
      setCurrentStep("backend");
    } catch (err) {
      console.error("Failed to get local data dir:", err);
      setServerDataPath("C:/YomikuraData");
      setCurrentStep("backend");
    }
  };

  const handleSelectPortableFolder = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("get_portable_data_path");
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
    setLocalError("");
    setServerBaseUrl(inputUrl.trim());

    try {
      const ok = await testConnection();
      if (ok) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
        setLocalError(errorMessage || "Failed to reach Suwayomi server.");
      }
    } catch (err: any) {
      setTestStatus("error");
      setLocalError(err.message || "Connection failed.");
    }
  };

  const triggerRetry = () => {
    setCurrentStep("storage");
    setTimeout(() => {
      setCurrentStep("backend");
    }, 50);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-950 via-ink-900 to-ink-950 p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-yomi-jade/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-yomi-jade/5 blur-[150px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-white/10 bg-ink-900/40 p-8 md:p-10 backdrop-blur-xl shadow-2xl animate-fade-in flex flex-col items-center">
        {/* Brand Logo */}
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-glow">
          <img src="/yomikura-logo.png" alt="Yomikura" className="h-full w-full object-cover" />
        </div>

        <h1 className="mt-6 text-3xl font-extrabold text-white tracking-tight text-center">
          Yomikura
        </h1>
        
        {/* STEP 1: STORAGE DIRECTORY PICKER */}
        {currentStep === "storage" && (
          <div className="mt-6 w-full flex flex-col items-center animate-fade-in">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-yomi-jade" />
              Choose Storage Location
            </h2>
            <p className="mt-2 text-xs text-slate-400 text-center max-w-sm leading-relaxed">
              Choose an empty folder for Yomikura, or a folder already created by Yomikura. Downloaded chapters, databases, and library settings will be stored there.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full">
              {/* Option 1: Default AppData */}
              <button
                onClick={handleSelectDefaultFolder}
                className="rounded-xl border border-white/5 bg-ink-950/40 p-5 flex flex-col items-center justify-between text-center hover:border-white/10 hover:bg-white/[0.02] active:scale-[0.99] transition w-full"
              >
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-300">
                    <HardDrive className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-xs font-semibold text-slate-200">Default (C: Drive)</h3>
                  <p className="mt-1.5 text-[10px] text-slate-500 max-w-[160px] leading-normal">
                    Store inside standard system AppData.
                  </p>
                </div>
                <span className="mt-4 text-[10px] font-bold text-yomi-jade hover:underline">
                  Use Default &rarr;
                </span>
              </button>

              {/* Option 2: Custom Folder */}
              <button
                onClick={handleSelectCustomFolder}
                className="rounded-xl border border-white/5 bg-ink-950/40 p-5 flex flex-col items-center justify-between text-center hover:border-white/10 hover:bg-white/[0.02] active:scale-[0.99] transition w-full"
              >
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-jade">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-xs font-semibold text-slate-200">Select Custom folder</h3>
                  <p className="mt-1.5 text-[10px] text-slate-500 max-w-[160px] leading-normal">
                    Choose an empty folder on D:, E:, or another partition.
                  </p>
                </div>
                <span className="mt-4 text-[10px] font-bold text-yomi-jade hover:underline">
                  Browse Folder &rarr;
                </span>
              </button>

              {/* Option 3: Portable (next to app) */}
              <button
                onClick={handleSelectPortableFolder}
                className="rounded-xl border border-white/5 bg-ink-950/40 p-5 flex flex-col items-center justify-between text-center hover:border-white/10 hover:bg-white/[0.02] active:scale-[0.99] transition w-full sm:col-span-2 lg:col-span-1"
              >
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-jade">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-xs font-semibold text-slate-200">Portable mode</h3>
                  <p className="mt-1.5 text-[10px] text-slate-500 max-w-[160px] leading-normal">
                    Store data next to the app — great for USB drives.
                  </p>
                </div>
                <span className="mt-4 text-[10px] font-bold text-yomi-jade hover:underline">
                  Use Portable &rarr;
                </span>
              </button>
            </div>

            <button
              onClick={() => setMockMode(true)}
              className="mt-6 text-[10px] text-slate-500 hover:text-slate-400 hover:underline"
            >
              Skip and Enter Demo Playground Mode
            </button>
          </div>
        )}

        {/* STEP 2: BACKEND & JAVA ENVIRONMENT VALIDATION */}
        {currentStep === "backend" && (
          <div className="mt-6 w-full flex flex-col items-center animate-fade-in text-center">
            {/* Java Check: Loading State */}
            {javaStatus === "checking" && (
              <div className="py-6 flex flex-col items-center">
                <Loader2 className="h-10 w-10 animate-spin text-yomi-jade mb-3" />
                <h3 className="text-sm font-semibold text-slate-200">Checking Java Environment...</h3>
                <p className="text-[11px] text-slate-500 mt-1">Verifying OpenJDK runtime on your system PATH.</p>
              </div>
            )}

            {/* Java Check: Downloading State */}
            {javaStatus === "downloading" && (
              <div className="py-6 flex flex-col items-center w-full max-w-sm">
                <Loader2 className="h-10 w-10 animate-spin text-yomi-jade mb-3" />
                <h3 className="text-sm font-semibold text-slate-200">Setting up Java Runtime...</h3>
                <p className="text-[11px] text-slate-400 mt-2 max-w-xs leading-relaxed">
                  Yomikura is automatically downloading and configuring a private OpenJDK 17 runtime inside your local data directory. This removes setup friction and won't affect any system-wide Java settings.
                </p>
                <div className="mt-5 w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5">
                  <div className="bg-yomi-jade h-full w-2/3 animate-pulse rounded-full" style={{ animationDuration: '2s' }} />
                </div>
                <span className="text-[10px] text-slate-500 mt-3">Downloading Eclipse Temurin JRE 17 ~ 40MB</span>
              </div>
            )}

            {/* Java Check: Missing Error Screen */}
            {javaStatus === "missing" && (
              <div className="w-full flex flex-col items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mb-4 animate-pulse">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-200">Java OpenJDK 17 Required</h3>
                <p className="max-h-48 max-w-lg overflow-auto whitespace-pre-wrap rounded-xl border border-white/5 bg-black/20 p-3 text-left font-mono text-[11px] leading-relaxed text-slate-400 mt-3">
                  Yomikura's local backend requires **Java OpenJDK 17** (or newer) to run. Don't worry—it takes less than a minute to install and runs quietly in the background.
                </p>

                <div className="mt-6 w-full space-y-3">
                  <a
                    href="https://adoptium.net/temurin/releases/?variant=openjdk17&jvmImpl=hotspot"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-yomi-jade py-3 px-4 text-xs font-bold text-ink-950 hover:bg-yomi-jade/90 hover:scale-[1.01] active:scale-[0.99] transition shadow-md"
                  >
                    <span>Download OpenJDK 17 Installer</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>

                  <button
                    onClick={triggerRetry}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2.5 px-4 text-xs font-semibold text-slate-200 hover:bg-white/10 transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>I have installed Java, Check Again</span>
                  </button>

                  <button
                    onClick={() => setMockMode(true)}
                    className="w-full text-xs text-slate-500 hover:text-slate-400 hover:underline pt-2"
                  >
                    Bypass & Run in Demo Sandbox Mode
                  </button>
                </div>
              </div>
            )}

            {/* Java Check: Installed & Starting Backend */}
            {javaStatus === "installed" && serverStatus === "starting" && (
              <div className="py-6 flex flex-col items-center">
                <Loader2 className="h-10 w-10 animate-spin text-yomi-jade mb-3" />
                <h3 className="text-sm font-semibold text-slate-200">Starting local manga engine...</h3>
                <p className="text-[11px] text-slate-500 mt-1.5 max-w-xs leading-normal">
                  Initializing the Suwayomi-Server database. This might take 5-10 seconds on the first launch.
                </p>
              </div>
            )}

            {/* Java Check: Installed & Started successfully */}
            {javaStatus === "installed" && serverStatus === "running" && (
              <div className="py-6 flex flex-col items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-jade mb-3">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Connected successfully!</h3>
                <p className="text-[11px] text-slate-500 mt-1">Starting app, please wait...</p>
              </div>
            )}

            {/* Backend Startup: Error */}
            {serverStatus === "error" && (
              <div className="w-full flex flex-col items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mb-4">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Failed to Start Backend Server</h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
                  {localError}
                </p>

                <div className="mt-6 w-full space-y-2">
                  <button
                    onClick={triggerRetry}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-yomi-jade py-2 px-3 text-xs font-semibold text-ink-950 hover:bg-yomi-jade/90 transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry Startup</span>
                  </button>

                  <button
                    onClick={() => setMockMode(true)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 py-2 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 transition"
                  >
                    <span>Run in Demo Sandbox Mode</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: FALLBACK READY SCREEN (Remote Connection & Demo Bypass) */}
        {currentStep === "ready" && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <p className="mt-2 text-sm text-slate-400 text-center max-w-sm">
              A focused desktop manga reader. Quiet, fast, and completely local.
            </p>

            {/* Feature List */}
            <div className="mt-8 space-y-4 w-full border-t border-white/5 pt-6">
              <div className="flex gap-4 items-start">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-jade">
                  <BookOpen className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Mihon-Inspired Reader</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enjoy layout scaling, RTL reading direction, double page spreads, and vertical webtoon modes.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-jade">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">100% Private & Local</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    No telemetry, tracking, or accounts. All settings, logs, and downloaded chapters stay on your device.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-jade">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Tailored UI Theme System</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Start with Yomikura's ivory-and-ink identity, or choose an optional personal accent.
                  </p>
                </div>
              </div>
            </div>

            {/* Primary CTA: Playground/Sandbox */}
            <div className="mt-8 w-full">
              <button
                onClick={() => setMockMode(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-yomi-jade py-3.5 px-4 text-sm font-bold text-ink-950 hover:bg-yomi-jade/90 hover:scale-[1.01] active:scale-[0.99] transition shadow-md"
              >
                <span>Explore Demo Library</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Advanced Accordion Toggle */}
            <div className="mt-6 w-full border-t border-white/5 pt-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
              >
                <span>Connect Self-Hosted Server (Advanced)</span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {/* Collapsible Content */}
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  showAdvanced ? "max-h-[220px] mt-4 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                }`}
              >
                <div className="rounded-xl border border-white/5 bg-ink-950/40 p-4 space-y-3">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Enter your local or hosted Suwayomi server URL (e.g. <code>http://localhost:4567</code>) to load your live catalog and active sources.
                  </p>
                  
                  <form onSubmit={handleTestAndSave} className="space-y-2.5">
                    <input
                      type="url"
                      required
                      placeholder="http://localhost:4567"
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      className="w-full rounded-lg bg-ink-950 border border-white/10 px-3 py-2 text-xs text-slate-300 outline-none focus:border-yomi-jade/50 transition-colors"
                    />
                    
                    <button
                      type="submit"
                      disabled={testStatus === "testing"}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 py-2 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 transition disabled:opacity-50"
                    >
                      {testStatus === "testing" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-yomi-jade" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <Server className="h-3.5 w-3.5 text-yomi-jade" />
                          <span>Connect & Save</span>
                        </>
                      )}
                    </button>

                    {testStatus === "error" && localError && (
                      <p className="text-[10px] text-red-400 text-center leading-relaxed">{localError}</p>
                    )}
                    {testStatus === "success" && (
                      <p className="text-[10px] text-yomi-jade text-center font-semibold">Connected Successfully!</p>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer legal disclaimer */}
        <p className="mt-8 text-[9px] text-slate-600 text-center leading-relaxed max-w-sm">
          Yomikura hosts no content. Desktop mode may run Suwayomi locally on your device; you are responsible for sources and repositories.
        </p>
      </div>
    </div>
  );
}

function ShellNavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const { t } = useTranslation();
  const translationKey = item.label.toLowerCase().replace(" ", "_") as any;
  const label = t(translationKey) === translationKey ? item.label : t(translationKey);
  return (
    <NavLink
      className={({ isActive }) =>
        `yomi-nav-link group ${isActive ? "is-active" : ""}`
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
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const translationKey = item.label.toLowerCase().replace(" ", "_") as any;
          const label = t(translationKey) === translationKey ? item.label : t(translationKey);
          return (
            <NavLink
              key={item.path}
              className={({ isActive }) =>
                `group flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
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
