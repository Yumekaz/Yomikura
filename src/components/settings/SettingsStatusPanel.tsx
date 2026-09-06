import { Activity } from "lucide-react";
import { DEFAULT_SERVER_BASE_URL } from "../../config/server";

type Props = { connectionStatus: "connected" | "testing" | "error" | "disconnected" };

export function SettingsStatusPanel({ connectionStatus }: Props) {
  const label = connectionStatus === "testing" ? "Testing" : connectionStatus === "connected" ? "Connected" : connectionStatus === "error" ? "Error" : "Disconnected";
  const tone = connectionStatus === "connected" ? "bg-yomi-jade/10 text-yomi-jade" : connectionStatus === "error" ? "bg-red-500/10 text-red-400" : connectionStatus === "testing" ? "bg-blue-500/10 text-blue-400" : "bg-slate-500/10 text-slate-400";
  return <div className="rounded-md border border-white/10 bg-ink-900 p-5 shadow-panel">
    <h3 className="flex items-center gap-2 font-semibold text-white"><Activity className="h-4 w-4 text-slate-400" />Connection Status</h3>
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between"><span className="text-sm text-slate-400">Status</span><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span></div>
      <div className="flex items-center justify-between"><span className="text-sm text-slate-400">Persisted</span><span className="text-sm text-white">Yes (Local Storage)</span></div>
      <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-400">Default</span><span className="truncate text-right text-sm text-white">{DEFAULT_SERVER_BASE_URL}</span></div>
    </div>
  </div>;
}
