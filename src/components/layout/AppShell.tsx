import { useEffect, useState } from "react";
import { BookOpen, Server, Play, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { browseNav, primaryNav, type NavItem } from "../../app/navigation";
import { useSettingsStore } from "../../stores/useSettingsStore";
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
  const [inputUrl, setInputUrl] = useState(serverBaseUrl);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [localError, setLocalError] = useState("");

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-950 via-ink-900 to-ink-950 p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-yomi-jade/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-yomi-jade/5 blur-[150px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-ink-900/40 p-8 md:p-12 backdrop-blur-xl shadow-2xl animate-fade-in flex flex-col items-center">
        {/* Brand Logo */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yomi-jade/10 border border-yomi-jade/20 text-yomi-jade font-bold text-3xl shadow-glow">
          <BookOpen className="h-8 w-8" />
        </div>

        <h1 className="mt-6 text-3xl font-extrabold text-white tracking-tight text-center sm:text-4xl">
          Welcome to Yomikura
        </h1>
        <p className="mt-3 text-sm text-slate-400 text-center max-w-md">
          A premium, Mihon-inspired web manga reader frontend. Experience your catalog with beautiful layout scaling, LTR/RTL reading, and instant dark themes.
        </p>

        {/* Options Grid */}
        <div className="mt-10 grid gap-6 md:grid-cols-2 w-full">
          {/* Card 1: Live Server */}
          <div className="rounded-xl border border-white/5 bg-ink-950/40 p-6 flex flex-col justify-between hover:border-white/10 transition">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Server className="h-4.5 w-4.5 text-yomi-jade" />
                Connect Live Server
              </div>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Connect directly to your local or hosted Suwayomi server instance to load your live library and extensions.
              </p>
            </div>

            <form onSubmit={handleTestAndSave} className="mt-6 space-y-3">
              <input
                type="url"
                required
                placeholder="http://localhost:4567"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="w-full rounded bg-ink-950 border border-white/10 px-3 py-2 text-xs text-slate-300 outline-none focus:border-yomi-jade/50 transition-colors"
              />
              <button
                type="submit"
                disabled={testStatus === "testing"}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-yomi-jade py-2 px-3 text-xs font-semibold text-ink-950 hover:bg-yomi-jade/90 transition disabled:opacity-50"
              >
                {testStatus === "testing" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <span>Connect & Save</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>

              {testStatus === "error" && localError && (
                <p className="text-[10px] text-red-400 leading-relaxed">{localError}</p>
              )}
              {testStatus === "success" && (
                <p className="text-[10px] text-yomi-jade font-semibold">Connected Successfully!</p>
              )}
            </form>
          </div>

          {/* Card 2: Demo Sandbox */}
          <div className="rounded-xl border border-white/5 bg-ink-950/40 p-6 flex flex-col justify-between hover:border-white/10 transition">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Play className="h-4.5 w-4.5 text-yomi-jade" />
                Explore Sandbox
              </div>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                No server configuration required. Instantly explore the reader interface, theme configurations, and library with public-domain demo content.
              </p>
            </div>

            <button
              onClick={() => setMockMode(true)}
              className="mt-6 w-full flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 py-2 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 transition"
            >
              <Play className="h-3.5 w-3.5 fill-current text-yomi-jade" />
              Enter Playground
            </button>
          </div>
        </div>

        {/* Footer legal disclaimer */}
        <p className="mt-8 text-[10px] text-slate-600 text-center leading-relaxed max-w-lg">
          Yomikura is a frontend shell and hosts zero content. Users are responsible for configuring their own server and sources.
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
