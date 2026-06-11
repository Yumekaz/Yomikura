import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, X, Server } from "lucide-react";
import { isTauri } from "../stores/useSettingsStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { APP_VERSION } from "../utils/appVersion";

type AppUpdate = { version: string; download: () => Promise<void> };

export function UpdateNotificationBanner() {
  const { serverBaseUrl, connectionStatus } = useSettingsStore();
  const [appUpdate, setAppUpdate] = useState<AppUpdate | null>(null);
  const [serverUpdate, setServerUpdate] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!cancelled && update) {
          setAppUpdate({
            version: update.version,
            download: async () => {
              setInstalling(true);
              await update.downloadAndInstall();
              const { relaunch } = await import("@tauri-apps/plugin-process");
              await relaunch();
            },
          });
        }
      } catch {
        // offline or dev build
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (connectionStatus !== "connected" || !serverBaseUrl) return;

    let cancelled = false;
    (async () => {
      try {
        const cleanUrl = serverBaseUrl.replace(/\/$/, "");
        const [infoRes, latestRes] = await Promise.all([
          fetch(`${cleanUrl}/api/v1/info`),
          fetch("https://api.github.com/repos/Suwayomi/Suwayomi-Server/releases/latest"),
        ]);
        if (!infoRes.ok || !latestRes.ok || cancelled) return;

        const info = await infoRes.json();
        const latest = await latestRes.json();
        const running = String(info.version || "");
        const tag = String(latest.tag_name || "").replace(/^v/, "");
        if (tag && running && tag !== running && !running.includes("dev")) {
          setServerUpdate(tag);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectionStatus, serverBaseUrl]);

  useEffect(() => {
    const handler = () => {
      setDismissed(false);
      if (isTauri()) {
        import("@tauri-apps/plugin-updater")
          .then(({ check }) => check())
          .then((update) => {
            if (update) {
              setAppUpdate({
                version: update.version,
                download: async () => {
                  setInstalling(true);
                  await update.downloadAndInstall();
                  const { relaunch } = await import("@tauri-apps/plugin-process");
                  await relaunch();
                },
              });
            }
          })
          .catch(() => undefined);
      }
    };
    window.addEventListener("yomikura-check-updates", handler);
    return () => window.removeEventListener("yomikura-check-updates", handler);
  }, []);

  if (dismissed || (!appUpdate && !serverUpdate)) return null;

  return (
    <div
      className="mx-auto mb-3 flex max-w-3xl flex-col gap-2 rounded-xl border border-yomi-jade/25 bg-yomi-jade/10 px-4 py-3 text-xs text-yomi-mint backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      {appUpdate && (
        <div className="flex items-center justify-between gap-3">
          <span>
            Yomikura v{APP_VERSION} → <strong>v{appUpdate.version}</strong> available
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={installing}
              onClick={() => appUpdate.download()}
              className="inline-flex items-center gap-1 rounded-lg bg-yomi-jade px-3 py-1 font-bold text-ink-950 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {installing ? "Installing…" : "Update"}
            </button>
            <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {serverUpdate && (
        <div className="flex items-center justify-between gap-3 border-t border-yomi-jade/15 pt-2">
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />
            Suwayomi Server <strong>v{serverUpdate}</strong> is available
          </span>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/Suwayomi/Suwayomi-Server/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-yomi-jade/30 px-3 py-1 font-semibold hover:bg-yomi-jade/15"
            >
              Download
            </a>
            <Link to="/settings" className="rounded-lg px-2 py-1 hover:underline">
              Settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}