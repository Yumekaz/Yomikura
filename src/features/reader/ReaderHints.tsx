import { useEffect, useState } from "react";
import type { ReaderMode } from "../../stores/useSettingsStore";
import type { ReaderExperience } from "../../stores/readerExperience";
import { readerTapAction } from "./tapNavigation";
export function ReaderHints({ mode, preferences }: { mode: ReaderMode; preferences: ReaderExperience }) {
  const [show, setShow] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setShow(false), preferences.showTapZones ? 3000 : 2000); return () => clearTimeout(timer); }, [preferences.showTapZones]);
  if (!show) return null;
  const label = mode === "WEBTOON" ? "Vertical reading" : mode === "RTL" ? "Read right to left" : "Read left to right";
  const canNavigate = mode !== "WEBTOON" || preferences.webtoonTapNavigation;
  return <>{preferences.showReadingMode && <p className="yomi-reader-mode-hint" role="status">{label}</p>}{preferences.showTapZones && <div className={`yomi-tap-hints ${preferences.tapLayout === "vertical" ? "is-vertical" : ""}`} aria-hidden="true">{[.1, .5, .9].map((fraction) => {
    const action = canNavigate ? readerTapAction(fraction * 100, fraction * 100, 100, 100, false, mode === "RTL", preferences) : "controls";
    return <span key={fraction}>{action === "next" ? mode === "WEBTOON" ? "Scroll down" : "Next page" : action === "previous" ? mode === "WEBTOON" ? "Scroll up" : "Previous page" : "Show controls"}</span>;
  })}</div>}</>;
}
