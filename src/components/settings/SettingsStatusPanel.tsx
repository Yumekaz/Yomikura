import { Activity } from "lucide-react";
import { DEFAULT_SERVER_BASE_URL } from "../../config/server";

type Props = { connectionStatus: "connected" | "testing" | "error" | "disconnected"; mockMode?: boolean };

export function SettingsStatusPanel({ connectionStatus, mockMode = false }: Props) {
  const label = mockMode ? "Demo sandbox" : connectionStatus === "testing" ? "Testing" : connectionStatus === "connected" ? "Connected" : connectionStatus === "error" ? "Error" : "Disconnected";
  const tone = mockMode ? "bg-violet-500/10 text-violet-300" : connectionStatus === "connected" ? "bg-yomi-jade/10 text-yomi-jade" : connectionStatus === "error" ? "bg-red-500/10 text-red-400" : connectionStatus === "testing" ? "bg-blue-500/10 text-blue-400" : "bg-slate-500/10 text-slate-400";
  return (
    <div className="yomi-settings-status" role="status" aria-label={`Connection status: ${label}`}>
      <div className="yomi-settings-status-title"><Activity className="h-4 w-4" /><span>Runtime</span></div>
      <div className="yomi-settings-status-item"><span>Status</span><strong className={`rounded-full px-2 py-0.5 ${tone}`}>{label}</strong></div>
      <div className="yomi-settings-status-item"><span>Preferences</span><strong>Saved locally</strong></div>
      <div className="yomi-settings-status-item min-w-0"><span>Default server</span><strong className="truncate">{DEFAULT_SERVER_BASE_URL}</strong></div>
    </div>
  );
}
