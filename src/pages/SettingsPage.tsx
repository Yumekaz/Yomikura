import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2, ServerCrash, Save, Activity } from "lucide-react";
import { useSettingsStore } from "../stores/useSettingsStore";

function SettingsPage() {
  const { serverBaseUrl, setServerBaseUrl, testConnection, connectionStatus, errorMessage } = useSettingsStore();
  const [localUrl, setLocalUrl] = useState(serverBaseUrl);

  // Sync local state if store changes outside
  useEffect(() => {
    setLocalUrl(serverBaseUrl);
  }, [serverBaseUrl]);

  const handleSaveAndTest = async (e: FormEvent) => {
    e.preventDefault();
    if (!localUrl) return;
    setServerBaseUrl(localUrl);
    await testConnection();
  };

  return (
    <section className="min-h-screen px-5 py-6 sm:px-8 lg:px-10">
      <header className="flex items-center justify-between border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-semibold text-yomi-jade">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Server Connection</h1>
        </div>
      </header>
      
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
            <h2 className="text-lg font-semibold text-white">Suwayomi Server</h2>
            <p className="mt-2 text-sm text-slate-400">
              Configure the URL of your Suwayomi instance. Yomikura connects directly to this server 
              for library management, extensions, and content.
            </p>
            
            <form onSubmit={handleSaveAndTest} className="mt-6">
              <label className="block px-1 pb-2 text-sm font-medium text-slate-300" htmlFor="settings-server-url">
                Server URL
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="settings-server-url"
                  className="min-h-12 flex-1 rounded-md border border-white/10 bg-ink-950 px-4 text-sm text-slate-300 outline-none placeholder:text-slate-600 focus:border-yomi-jade/50 focus:ring-1 focus:ring-yomi-jade/50 transition-colors"
                  placeholder="http://localhost:4567"
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  disabled={connectionStatus === "testing"}
                  required
                />
                <button
                  className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-yomi-jade px-5 text-sm font-semibold text-ink-950 transition-colors hover:bg-yomi-jade/90 disabled:opacity-70"
                  type="submit"
                  disabled={!localUrl || connectionStatus === "testing"}
                >
                  {connectionStatus === "testing" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save & Test</span>
                    </>
                  )}
                </button>
              </div>
              
              {connectionStatus === "error" && errorMessage && (
                <div className="mt-4 flex items-start gap-3 rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                  <ServerCrash className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium text-red-300">Connection Failed</p>
                    <p className="mt-1">{errorMessage}</p>
                  </div>
                </div>
              )}
              
              {connectionStatus === "connected" && (
                <div className="mt-4 flex items-start gap-3 rounded-md border border-yomi-jade/20 bg-yomi-jade/10 p-4 text-sm text-yomi-jade">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium text-yomi-jade">Connected Successfully</p>
                    <p className="mt-1 opacity-90">Your Suwayomi server is reachable and responding.</p>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-white/10 bg-ink-900 p-5 shadow-panel">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <Activity className="h-4 w-4 text-slate-400" />
              Connection Status
            </h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Status</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  connectionStatus === "connected" ? "bg-yomi-jade/10 text-yomi-jade" :
                  connectionStatus === "error" ? "bg-red-500/10 text-red-400" :
                  connectionStatus === "testing" ? "bg-blue-500/10 text-blue-400" :
                  "bg-slate-500/10 text-slate-400"
                }`}>
                  {connectionStatus === "testing" ? "Testing" :
                   connectionStatus === "connected" ? "Connected" :
                   connectionStatus === "error" ? "Error" : "Disconnected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Persisted</span>
                <span className="text-sm text-white">Yes (Local Storage)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SettingsPage;
