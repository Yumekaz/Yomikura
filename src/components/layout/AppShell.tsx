import { useEffect, useState } from "react";
import { BookOpen, Server, Play, ShieldCheck, ArrowRight, Loader2, Sparkles, ChevronDown, ChevronUp, FolderOpen, HardDrive, RefreshCw, AlertTriangle } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { browseNav, primaryNav, type NavItem } from "../../app/navigation";
import { useSettingsStore, isTauri } from "../../stores/useSettingsStore";
import { ErrorBoundary } from "../ErrorBoundary";

function ProfileSwitcher() {
  const { profiles, activeProfileId, setActiveProfileId } = useSettingsStore();
  const queryClient = useQueryClient();

  if (profiles.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-ink-950/60 border border-white/5 px-2.5 py-1.5 text-xs text-slate-400">
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

function AppShell() {
  const { 
    connectionStatus, 
    testConnection, 
    accentColor, 
    themeMode, 
    mockMode, 
    setMockMode, 
    serverBaseUrl, 
    setServerBaseUrl, 
    errorMessage 
  } = useSettingsStore();
  const location = useLocation();

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
      jade: "125, 216, 189",
      mint: "169, 242, 212",
      gold: "242, 200, 121",
      plum: "182, 155, 255",
      coral: "239, 138, 122"
    };
    
    const rgb = accents[accentColor] || accents.jade;
    htmlElement.style.setProperty("--yomi-accent", rgb);
  }, [themeMode, accentColor]);

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
    <div className="min-h-screen bg-ink-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-ink-900/95 px-4 py-5 lg:block">
        <BrandLockup />
        
        {/* Profile Switcher */}
        <div className="mt-5 px-1">
          <ProfileSwitcher />
        </div>

        <nav className="mt-6 space-y-1" aria-label="Primary navigation">
          {primaryNav.map((item) => (
            <ShellNavLink key={item.path} item={item} />
          ))}
        </nav>
        <div className="mt-8 border-t border-white/10 pt-5">
          <p className="px-3 text-xs font-semibold uppercase text-slate-500">Browse</p>
          <nav className="mt-2 space-y-1" aria-label="Browse navigation">
            {browseNav.map((item) => (
              <ShellNavLink key={item.path} item={item} />
            ))}
          </nav>
        </div>
      </aside>
      <main className="min-h-screen pb-24 lg:pl-64">
        {showOfflineBanner && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs font-medium text-amber-200">
            Suwayomi server is offline. Yomikura is running in offline mode.
          </div>
        )}
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <MobileNav />
    </div>
  );
}

export function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-yomi-jade text-ink-950">
        <BookOpen className="h-5 w-5" />
      </div>
      <div>
        <p className="text-base font-semibold text-white">Yomikura</p>
        <p className="text-xs text-slate-500">Suwayomi web reader</p>
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
  const { serverDataPath, setServerDataPath } = useSettingsStore();
  const [currentStep, setCurrentStep] = useState<"storage" | "backend" | "ready">("storage");
  const [javaStatus, setJavaStatus] = useState<"checking" | "installed" | "missing">("checking");
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
    let pollInterval: any;

    const runBackendLifecycle = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");

        setJavaStatus("checking");
        const hasJava = await invoke<boolean>("check_java_installed");
        if (!active) return;

        if (!hasJava) {
          setJavaStatus("missing");
          return;
        }

        setJavaStatus("installed");
        setServerStatus("starting");

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
              setTimeout(() => {
                if (active) setCurrentStep("ready");
              }, 1000);
              return true;
            }
          } catch {
            // silent retry
          }

          if (attempts > 30 && active) {
            setServerStatus("error");
            setLocalError("Local manga server startup timed out. Check suwayomi.log in AppData folder.");
            return true;
          }
          return false;
        };

        const done = await checkConnection();
        if (!done && active) {
          pollInterval = setInterval(checkConnection, 1500);
        }
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
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [currentStep, serverDataPath]);

  const handleSelectCustomFolder = async () => {
    try {
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
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-jade font-bold text-3xl shadow-glow">
          <BookOpen className="h-8 w-8" />
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
              Select where downloaded manga chapters, databases, and library configurations will be stored. You can select a folder on any drive (C:, D:, E: etc.) to save disk space.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 w-full">
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
                    Choose any folder on D:, E:, or secondary partitions.
                  </p>
                </div>
                <span className="mt-4 text-[10px] font-bold text-yomi-jade hover:underline">
                  Browse Folder &rarr;
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

            {/* Java Check: Missing Error Screen */}
            {javaStatus === "missing" && (
              <div className="w-full flex flex-col items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mb-4 animate-pulse">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-200">Java OpenJDK 17 Required</h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
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
              A premium, Mihon-inspired web manga reader frontend. Clean, fast, and completely local.
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
                    Switch instantly between light and dark themes with curated accents (Jade, Mint, Gold, Plum, Coral).
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
          Yomikura is a frontend reader and hosts no content. Users are responsible for configuring their own server and sources.
        </p>
      </div>
    </div>
  );
}

function ShellNavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
          isActive
            ? "bg-yomi-jade/15 text-yomi-mint"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
        }`
      }
      to={item.path}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </NavLink>
  );
}

function MobileNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-ink-900/95 px-2 py-2 backdrop-blur lg:hidden"
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-6 gap-1">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium ${
                  isActive ? "bg-yomi-jade/15 text-yomi-mint" : "text-slate-500"
                }`
              }
              to={item.path}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default AppShell;
