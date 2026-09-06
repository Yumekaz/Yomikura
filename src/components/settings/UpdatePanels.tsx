import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { APP_VERSION } from "../../utils/appVersion";

export function TauriUpdaterRow() {
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
          case "Started":
            totalBytes = event.data.contentLength || 0;
            setDownloadProgress({ downloaded: 0, total: totalBytes });
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            setDownloadProgress({ downloaded: downloadedBytes, total: totalBytes });
            break;
          case "Finished":
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
        <button onClick={handleCheckUpdate} disabled={checking || downloading} className="flex items-center gap-1.5 rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 hover:bg-yomi-jade/20 px-3 py-1.5 text-xs font-semibold text-yomi-jade transition disabled:opacity-50">
          {checking ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Checking...</span></> : <span>Check for Updates</span>}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 leading-normal" role="alert">{error}</p>}
      {checked && !checking && !updateInfo && !error && <p className="text-xs text-yomi-jade flex items-center gap-1.5 font-semibold" role="status"><CheckCircle2 className="h-4 w-4" />Yomikura is up to date! (v{APP_VERSION})</p>}
      {updateInfo && <div className="rounded-lg bg-white/[0.02] border border-white/5 p-4 space-y-3 animate-fade-in">
        <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-200">Update Available: v{updateInfo.version}</span></div>
        <button onClick={handleInstallUpdate} disabled={downloading} className="w-full flex items-center justify-center gap-2 rounded-lg bg-yomi-jade py-2 px-4 text-xs font-bold text-ink-950 hover:bg-yomi-jade/90 transition disabled:opacity-50">
          {downloading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>{downloadProgress ? `Downloading: ${Math.round((downloadProgress.downloaded / (downloadProgress.total || 1)) * 100)}%` : "Installing update..."}</span></> : <span>Download &amp; Relaunch Update</span>}
        </button>
      </div>}
    </div>
  );
}

export function SuwayomiServerUpdaterRow() {
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
      const infoResponse = await fetch(`${cleanUrl}/api/graphql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "query { aboutServer { version } }" }) });
      if (infoResponse.ok) {
        const infoData = await infoResponse.json();
        setRunningVersion(infoData.data?.aboutServer?.version || "Unknown");
      } else setRunningVersion("Unknown (server info endpoint unavailable)");
      const res = await fetch("https://api.github.com/repos/Suwayomi/Suwayomi-Server/releases/latest");
      if (!res.ok) throw new Error("Failed to check GitHub releases API.");
      const data = await res.json();
      setLatestVersion(data.tag_name ? data.tag_name.replace(/^v/, "") : null);
    } catch (err: any) {
      console.error("Suwayomi Server update check failed:", err);
      setError(err.message || String(err));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { void checkServerUpdate(); }, [serverBaseUrl]);
  const hasUpdate = useMemo(() => Boolean(latestVersion && runningVersion && latestVersion !== runningVersion && !runningVersion.includes("dev")), [latestVersion, runningVersion]);

  return <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-ink-950/30 p-5">
    <div className="flex items-center justify-between"><div><span className="font-semibold text-sm text-slate-200">Suwayomi Server Engine</span><p className="text-xs text-slate-500 mt-1">Running: {runningVersion || "Checking..."} | Latest: {latestVersion || "Checking..."}</p></div><button onClick={() => void checkServerUpdate()} disabled={checking} className="rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 hover:bg-yomi-jade/20 px-3 py-1.5 text-xs font-semibold text-yomi-jade transition disabled:opacity-50">{checking ? "Checking..." : "Check"}</button></div>
    {hasUpdate && <div className="rounded-lg bg-yomi-jade/10 border border-yomi-jade/20 p-3 flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse"><span className="text-[11px] text-yomi-mint font-semibold">Update available! Version {latestVersion} is out.</span><a href="https://github.com/Suwayomi/Suwayomi-Server/releases/latest" target="_blank" rel="noreferrer" className="rounded bg-yomi-jade text-ink-950 px-3 py-1 text-[10px] font-bold hover:bg-yomi-jade/90 transition shrink-0">Download Release</a></div>}
    {error && <span className="text-[10px] text-red-400" role="alert">Failed to check server updates: {error}</span>}
  </div>;
}
