import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "../../stores/useSettingsStore";
import type { ReaderExperience } from "../../stores/readerExperience";
const fullscreenReaders = new Set<symbol>();
let enteredFullscreen = false;
const restoreFullscreenIfUnused = () => { queueMicrotask(() => { if (fullscreenReaders.size || !enteredFullscreen) return; enteredFullscreen = false; if (isTauri()) void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().setFullscreen(false)).catch(() => undefined); else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); }); };

export function useReaderDisplay(preferences: ReaderExperience, setControlsVisible: (visible: boolean) => void) {
  const [fullscreen, setFullscreen] = useState(false), [wakeState, setWakeState] = useState<"off" | "active" | "unavailable">("off");
  const wakeOwner = useRef(crypto.randomUUID()).current;
  const toggleFullscreen = useCallback(async () => {
    if (isTauri()) { const window = (await import("@tauri-apps/api/window")).getCurrentWindow(); const previous = await window.isFullscreen(); await window.setFullscreen(!previous); enteredFullscreen = !previous; setFullscreen(!previous); }
    else if (document.fullscreenElement) { await document.exitFullscreen(); enteredFullscreen = false; }
    else { await document.documentElement.requestFullscreen(); enteredFullscreen = true; }
  }, []);
  useEffect(() => {
    const owner = Symbol(); fullscreenReaders.add(owner);
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    let active = true;
    if (preferences.autoFullscreen && isTauri()) void (async () => {
      const window = (await import("@tauri-apps/api/window")).getCurrentWindow(); const previous = await window.isFullscreen();
      if (active && !previous) { await window.setFullscreen(true); enteredFullscreen = true; setFullscreen(true); restoreFullscreenIfUnused(); }
    })().catch(() => undefined);
    return () => { active = false; fullscreenReaders.delete(owner); document.removeEventListener("fullscreenchange", changed); restoreFullscreenIfUnused(); };
  }, [preferences.autoFullscreen]);
  useEffect(() => {
    if (!preferences.keepAwake) { setWakeState("off"); return; }
    let active = true;
    let lock: WakeLockSentinel | undefined;
    let native = false;
    let acquiring = false;
    const releaseNative = () => import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_reader_keep_awake", { enabled: false, owner: wakeOwner }));
    const acquire = async () => {
      if (document.visibilityState !== "visible" || !active || acquiring || lock && !lock.released) return;
      acquiring = true;
      try {
        if (isTauri()) try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_reader_keep_awake", { enabled: true, owner: wakeOwner }); native = true; } catch { /* Other desktop systems may support the standard screen wake API. */ }
        if (!native) { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); else throw new Error("Screen wake is unavailable"); }
        if (!active || document.visibilityState !== "visible") { if (native) await releaseNative(); else await lock?.release(); return; }
        setWakeState("active");
      } catch { if (active) setWakeState("unavailable"); }
      finally { acquiring = false; }
    };
    const visibility = () => { if (document.visibilityState === "visible") void acquire(); else { void lock?.release().catch(() => undefined); lock = undefined; if (native) { native = false; void releaseNative().catch(() => undefined); } if (active) setWakeState("off"); } };
    void acquire(); document.addEventListener("visibilitychange", visibility); window.addEventListener("focus", acquire);
    const renewal = window.setInterval(() => { if (native && active && document.visibilityState === "visible") void import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_reader_keep_awake", { enabled: true, owner: wakeOwner })).catch(() => setWakeState("unavailable")); }, 25_000);
    return () => { active = false; window.clearInterval(renewal); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("focus", acquire); void lock?.release().catch(() => undefined); if (native) void releaseNative().catch(() => undefined); };
  }, [preferences.keepAwake, wakeOwner]);
  useEffect(() => {
    if (preferences.hideControlsOnScroll === "off") return;
    let previous = window.scrollY, travelled = 0;
    const threshold = preferences.hideControlsOnScroll === "high" ? 24 : preferences.hideControlsOnScroll === "medium" ? 70 : 150;
    const scroll = () => { const current = window.scrollY; travelled += Math.abs(current - previous); previous = current; if (travelled >= threshold) { setControlsVisible(false); travelled = 0; } };
    window.addEventListener("scroll", scroll, { passive: true }); return () => window.removeEventListener("scroll", scroll);
  }, [preferences.hideControlsOnScroll, setControlsVisible]);
  return { fullscreen, toggleFullscreen, wakeState };
}
