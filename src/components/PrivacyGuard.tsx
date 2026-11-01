import { useEffect, useRef, useState, type ReactNode } from "react";
import { isTauri, useSettingsStore } from "../stores/useSettingsStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DesktopStatus } from "./settings/DesktopSettingsPanel";

export function PrivacyGuard({ children }: { children: ReactNode }) {
  const enabled = useSettingsStore((state) => state.experience.privacyCurtain);
  const desktop = isTauri(), client = useQueryClient();
  const status = useQuery({ queryKey: ["desktop-preferences"], enabled: desktop, retry: false, queryFn: async () => (await import("@tauri-apps/api/core")).invoke<DesktopStatus>("get_desktop_preferences") });
  const [away, setAway] = useState(false), [localLocked, setLocked] = useState(false), content = useRef<HTMLDivElement>(null);
  const locked = desktop && (localLocked || status.isPending || status.isError || status.data?.locked === true);
  const hidden = away || locked;
  const unlock = useMutation({ mutationFn: async () => { await (await import("@tauri-apps/api/core")).invoke("unlock_reading_room"); const confirmed = await status.refetch(); if (confirmed.data?.locked !== false) throw new Error("Unlocking wasn’t confirmed."); setLocked(false); } });
  useEffect(() => {
    const refresh = () => { setAway(enabled && (document.visibilityState === "hidden" || !document.hasFocus())); if (desktop && status.data?.preferences.requireUnlock && !document.hasFocus()) setLocked(true); };
    const blur = () => { setAway(enabled); if (desktop && status.data?.preferences.requireUnlock) setLocked(true); };
    refresh(); window.addEventListener("blur", blur); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("blur", blur); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [enabled, desktop, status.data?.preferences.requireUnlock]);
  useEffect(() => {
    if (!desktop) return;
    let active = true, unsubscribe: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) => listen("yomikura-window-locked", () => { setLocked(true); void client.invalidateQueries({ queryKey: ["desktop-preferences"] }); })).then((stop) => { if (active) unsubscribe = stop; else stop(); });
    return () => { active = false; unsubscribe?.(); };
  }, [desktop, client]);
  useEffect(() => { if (content.current) content.current.inert = hidden; }, [hidden]);
  return <><div ref={content} className="yomi-privacy-content" style={{ display: "contents", visibility: hidden ? "hidden" : undefined }} aria-hidden={hidden || undefined}>{children}</div>{hidden && <div className="yomi-privacy-curtain"><img src="/identity/spirit-resting.webp" alt="" width={120} height={120} /><h1>{locked ? "Your reading room is locked." : "A moment of quiet."}</h1><p role="status">{locked ? status.isPending ? "Checking window preferences…" : "Unlock to return to your stories." : "Your books are out of view while you’re away."}</p>{locked && !status.isPending && <button className="yomi-button yomi-button-primary" disabled={unlock.isPending} onClick={() => status.isError ? void status.refetch() : unlock.mutate()}>{status.isError ? "Retry window preferences" : unlock.isPending ? "Waiting for Windows…" : "Unlock with Windows Hello"}</button>}{unlock.isError && <p role="alert">Verification wasn’t completed. Your reading room is still locked.</p>}</div>}</>;
}
