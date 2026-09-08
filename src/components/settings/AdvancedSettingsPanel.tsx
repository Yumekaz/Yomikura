import { HardDrive, Sliders, Wrench } from "lucide-react";
import { ExtensionHealthPanel } from "../ExtensionHealthPanel";
import { DuplicateScanner } from "../library/DuplicateScanner";
import { LocalImportSection } from "../library/LocalImportSection";
import { useFeedback } from "../ui/FeedbackProvider";
import { useTranslation } from "../../hooks/useTranslation";
import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import { OpdsPanel } from "./OpdsPanel";
import { TrackerSettingsPanel } from "./TrackerSettingsPanel";

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-[background-color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yomi-signature))] ${checked ? "border-transparent bg-yomi-jade" : "border-white/15 bg-ink-950"}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${checked ? "translate-x-5 bg-ink-950" : "translate-x-0"}`} />
    </button>
  );
}

export function AdvancedSettingsPanel() {
  const { t } = useTranslation();
  const { confirm, notify } = useFeedback();
  const { mockMode, setMockMode, portableMode, setPortableMode, serverDataPath, resetAllSettings } = useSettingsStore();

  const openStorage = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_logs_folder", { dataPath: serverDataPath });
    } catch (error: any) {
      notify(`Failed to open directory: ${error?.message || String(error)}`, "error");
    }
  };

  const togglePortable = async () => {
    const next = !portableMode;
    setPortableMode(next);
    if (!next || !isTauri()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      useSettingsStore.getState().setServerDataPath(await invoke<string>("get_portable_data_path"));
    } catch (error: any) {
      setPortableMode(false);
      notify(`Portable mode could not be enabled: ${error?.message || String(error)}`, "error");
    }
  };

  const resetOnboarding = async () => {
    if (!(await confirm({ title: "Run setup again?", detail: "Yomikura will disconnect the active profile and show onboarding after reload. Your library and downloads are not deleted.", confirmLabel: "Reset setup", danger: true }))) return;
    useSettingsStore.setState({ connectionStatus: "disconnected", serverBaseUrl: "", activeProfileId: "", serverDataPath: "" });
    notify("Setup was reset. Reloading Yomikura…", "success");
    window.location.reload();
  };

  const resetConfiguration = async () => {
    if (!(await confirm({ title: "Reset all settings?", detail: "Server profiles, appearance, reader preferences, and browse options will return to defaults.", confirmLabel: "Continue", danger: true }))) return;
    if (!(await confirm({ title: "Final confirmation", detail: "This settings reset cannot be undone. Offline chapter files are not affected.", confirmLabel: "Reset settings", danger: true }))) return;
    resetAllSettings();
    notify("All settings were reset.", "success");
  };

  const hardReset = async () => {
    if (!(await confirm({ title: "Wipe Yomikura-managed data?", detail: "Settings and the default local cache will be deleted. A custom storage folder is deliberately left untouched.", confirmLabel: "Continue", danger: true }))) return;
    if (!(await confirm({ title: "Wipe and restart?", detail: "This is the final confirmation. Yomikura-managed local data cannot be restored afterward.", confirmLabel: "Wipe and restart", danger: true }))) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("wipe_all_data");
    } catch (error: any) {
      notify(`Hard reset failed: ${error?.message || String(error)}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      <LocalImportSection />

      <section className="rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" aria-labelledby="integrations-title">
        <h2 id="integrations-title" className="flex items-center gap-2 text-lg font-semibold text-white"><Sliders className="h-5 w-5 text-yomi-jade" />Integrations</h2>
        <p className="mt-2 text-sm text-slate-400">Feeds, accounts, and source diagnostics.</p>
        <div className="mt-6 space-y-6">
          <div><h3 className="mb-3 text-sm font-semibold text-slate-200">{t("opds_feed")}</h3><OpdsPanel /></div>
          <div className="border-t border-white/10 pt-6"><h3 className="mb-3 text-sm font-semibold text-slate-200">{t("tracker_settings")}</h3><TrackerSettingsPanel /></div>
          <div className="border-t border-white/10 pt-6"><h3 className="mb-3 text-sm font-semibold text-slate-200">{t("extension_health")}</h3><ExtensionHealthPanel /></div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" aria-labelledby="maintenance-title">
        <h2 id="maintenance-title" className="flex items-center gap-2 text-lg font-semibold text-white"><HardDrive className="h-5 w-5 text-yomi-jade" />Storage and library maintenance</h2>
        <div className="mt-6 space-y-6">
          {isTauri() && <div className="flex items-start justify-between gap-5"><div><h3 className="text-sm font-semibold text-slate-200">Application storage</h3><p className="mt-1 max-w-lg text-xs leading-5 text-slate-400">Open the folder containing databases, extensions, configuration, and logs.</p></div><button type="button" onClick={() => void openStorage()} className="yomi-button yomi-button-secondary shrink-0">Open folder</button></div>}
          {isTauri() && <div className="flex items-start justify-between gap-5 border-t border-white/10 pt-6"><div><h3 className="text-sm font-semibold text-slate-200">{t("portable_mode")}</h3><p className="mt-1 max-w-lg text-xs leading-5 text-slate-400">Keep Suwayomi data beside the application for a portable installation.</p></div><Switch checked={portableMode} label="Portable mode" onChange={() => void togglePortable()} /></div>}
          <div className="border-t border-white/10 pt-6"><DuplicateScanner /></div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" aria-labelledby="developer-title">
        <h2 id="developer-title" className="flex items-center gap-2 text-lg font-semibold text-white"><Wrench className="h-5 w-5 text-yomi-jade" />Developer and recovery tools</h2>
        <p className="mt-2 text-sm text-slate-400">Simulation and destructive recovery controls. Most readers never need these.</p>
        <div className="mt-6 space-y-6">
          <div className="flex items-start justify-between gap-5"><div><h3 className="text-sm font-semibold text-slate-200">Demo Sandbox Mode</h3><p className="mt-1 max-w-lg text-xs leading-5 text-slate-400">Preview Yomikura using isolated sample data when no server is available.</p></div><Switch checked={mockMode} label="Demo Sandbox Mode" onChange={() => setMockMode(!mockMode)} /></div>
          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-6"><button type="button" onClick={() => void resetOnboarding()} className="yomi-button yomi-button-secondary">Reset onboarding</button><button type="button" onClick={() => void resetConfiguration()} className="yomi-button yomi-button-secondary text-red-200">Reset settings</button>{isTauri() && <button type="button" onClick={() => void hardReset()} className="yomi-button yomi-button-danger">Wipe and restart</button>}</div>
        </div>
      </section>
    </div>
  );
}
