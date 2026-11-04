import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Puzzle, X } from "lucide-react";
import { useExtensionUpdates } from "./useExtensionUpdates";

export function ExtensionUpdatesBadge() {
  const { outdated, canCheck } = useExtensionUpdates();
  if (!canCheck || !outdated.length) return null;
  return <span className="yomi-chip ml-auto tabular-nums" aria-label={`${outdated.length} extension updates available`}>{outdated.length}</span>;
}

export function ExtensionUpdateNotice() {
  const { outdated, canCheck, backendKey } = useExtensionUpdates();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState("");
  const updateKey = JSON.stringify([backendKey, outdated.map((extension) => `${extension.pkgName}:${extension.versionName}`).sort()]);
  if (!canCheck || !outdated.length || dismissed === updateKey || pathname.startsWith("/reader/") || pathname.startsWith("/extensions")) return null;
  const names = outdated.slice(0, 3).map((extension) => extension.name).join(", ");
  return <div role="status" aria-label="Extension updates" className="yomi-commandbar my-3 flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
    <Puzzle aria-hidden="true" className="h-4 w-4 shrink-0 text-[rgb(var(--yomi-signature))]" />
    <div className="min-w-0 flex-1"><p className="font-semibold text-slate-100">{outdated.length} source extension {outdated.length === 1 ? "update is" : "updates are"} available</p><p className="mt-0.5 break-words text-xs text-slate-400">{names}{outdated.length > 3 ? ` and ${outdated.length - 3} more` : ""}. Review and update when you’re ready.</p></div>
    <Link to="/extensions?view=updates" className="yomi-button yomi-button-secondary text-xs">Review updates</Link>
    <button type="button" onClick={() => setDismissed(updateKey)} className="yomi-utility-button shrink-0" aria-label="Dismiss extension update notice"><X aria-hidden="true" className="h-4 w-4" /></button>
  </div>;
}
