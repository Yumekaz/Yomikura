import { useEffect, useState } from "react";
import { BookOpen, Palette, Plus, Sliders, Trash2 } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { type ReaderMode, useSettingsStore } from "../../stores/useSettingsStore";

export function ReaderSettingsPanel() {
  const { t } = useTranslation();
  const store = useSettingsStore();
  const [presetName, setPresetName] = useState("");
  const [addingPreset, setAddingPreset] = useState(false);
  const [recordingAction, setRecordingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingAction) return;
    const record = (event: KeyboardEvent) => {
      event.preventDefault();
      const key = event.key.toLowerCase();
      const keys = store.customKeybinds[recordingAction] || [];
      if (!keys.includes(key)) store.setCustomKeybinds({ ...store.customKeybinds, [recordingAction]: [...keys, key] });
      setRecordingAction(null);
    };
    window.addEventListener("keydown", record, { once: true });
    return () => window.removeEventListener("keydown", record);
  }, [recordingAction, store]);

  const friendlyName: Record<string, string> = { prevPage: "Previous page", nextPage: "Next page", toggleOverlay: "Toggle controls or exit", cycleFit: "Cycle fit mode", cycleSpread: "Cycle page spread" };
  const resetKeybinds = () => store.setCustomKeybinds({ prevPage: ["arrowleft", "a", "backspace"], nextPage: ["arrowright", "d", " ", "enter"], toggleOverlay: ["escape"], cycleFit: ["w"], cycleSpread: ["s"] });

  return <div className="space-y-6">
    <section className="rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" aria-labelledby="reader-preferences-title">
      <h2 id="reader-preferences-title" className="flex items-center gap-2 text-lg font-semibold text-white"><BookOpen className="h-5 w-5 text-yomi-jade" />Reader preferences</h2>
      <p className="mt-2 text-sm text-slate-400">Defaults apply everywhere unless a title has its own override.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="text-sm text-slate-300">Reading mode<select value={store.readerMode} onChange={(event) => store.setReaderMode(event.target.value as ReaderMode)} className="yomi-field mt-2 w-full"><option value="WEBTOON">Vertical webtoon</option><option value="LTR">Left to right</option><option value="RTL">Right to left</option></select></label>
        <label className="text-sm text-slate-300">Navigation zones<select value={store.readerNavigationMode} onChange={(event) => store.setReaderNavigationMode(event.target.value as typeof store.readerNavigationMode)} className="yomi-field mt-2 w-full"><option value="edge">Edge zones</option><option value="wide">Wide zones</option><option value="disabled">Click toggles controls</option></select></label>
        <label className="text-sm text-slate-300">Page transitions<select value={store.pageTransition} onChange={(event) => store.setPageTransition(event.target.value as typeof store.pageTransition)} className="yomi-field mt-2 w-full"><option value="none">None</option><option value="fade">Fade</option><option value="slide">Slide</option></select></label>
        <label className="text-sm text-slate-300">Download ahead<select value={store.autoDownloadCount} onChange={(event) => store.setAutoDownloadCount(Number(event.target.value))} className="yomi-field mt-2 w-full"><option value={0}>Disabled</option><option value={1}>Next chapter</option><option value={3}>Next 3 chapters</option><option value={5}>Next 5 chapters</option><option value={10}>Next 10 chapters</option></select></label>
        <label className="text-sm text-slate-300">Concurrent chapter downloads<select value={store.downloadConcurrency} onChange={(event) => store.setDownloadConcurrency(Number(event.target.value))} className="yomi-field mt-2 w-full"><option value={1}>1 — conservative</option><option value={2}>2 — recommended</option><option value={3}>3 — faster</option><option value={4}>4 — maximum</option></select></label>
      </div>
      <div className="mt-6 space-y-3 border-t border-white/10 pt-6"><label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={store.infiniteChapterReading} onChange={(event) => store.setInfiniteChapterReading(event.target.checked)} />{t("infinite_reading")}</label><label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={store.autoDeleteReadChapters} onChange={(event) => store.setAutoDeleteReadChapters(event.target.checked)} />{t("auto_delete_read")}</label></div>
    </section>

    <section className="rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" aria-labelledby="reader-presets-title">
      <h2 id="reader-presets-title" className="flex items-center gap-2 text-lg font-semibold text-white"><Palette className="h-5 w-5 text-yomi-jade" />Reader layout presets</h2>
      <p className="mt-2 text-sm text-slate-400">Save and reuse combinations of mode, fit, and page spread.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{store.settingsProfiles.map((preset) => <div key={preset.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-ink-950/30 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{preset.name}</p><p className="mt-1 truncate text-xs text-slate-400">{preset.readerMode} · {preset.fitMode} · {preset.pageSpread}</p></div><div className="flex gap-2"><button type="button" className="yomi-button yomi-button-secondary min-h-8 px-3" onClick={() => store.applySettingsProfile(preset.id)}>Apply</button><button type="button" className="yomi-icon-button danger h-8 w-8" aria-label={`Delete preset ${preset.name}`} onClick={() => store.deleteSettingsProfile(preset.id)}><Trash2 /></button></div></div>)}</div>
      <div className="mt-5 border-t border-white/10 pt-5">{addingPreset ? <form className="flex max-w-lg gap-2" onSubmit={(event) => { event.preventDefault(); if (!presetName.trim()) return; store.addSettingsProfile(presetName.trim(), { readerMode: store.readerMode, fitMode: store.fitMode, pageSpread: store.pageSpread }); setPresetName(""); setAddingPreset(false); }}><input className="yomi-field min-w-0 flex-1" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" aria-label="Preset name" /><button className="yomi-button yomi-button-primary" type="submit">Save</button><button className="yomi-button yomi-button-secondary" type="button" onClick={() => setAddingPreset(false)}>Cancel</button></form> : <button type="button" className="yomi-button yomi-button-secondary" onClick={() => setAddingPreset(true)}><Plus />Save current layout</button>}</div>
    </section>

    <section className="rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" aria-labelledby="reader-shortcuts-title">
      <h2 id="reader-shortcuts-title" className="flex items-center gap-2 text-lg font-semibold text-white"><Sliders className="h-5 w-5 text-yomi-jade" />Keyboard shortcuts</h2>
      <p className="mt-2 text-sm text-slate-400">Record keys for frequent reader actions. Keyboard actions remain immediate and unanimated.</p>
      <div className="mt-5 space-y-3">{Object.entries(store.customKeybinds).map(([action, keys]) => <div key={action} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-ink-950/30 p-3"><div><p className="text-sm font-semibold text-slate-200">{friendlyName[action] || action}</p><div className="mt-2 flex flex-wrap gap-1.5">{keys.length ? keys.map((key) => <span key={key} className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold uppercase text-slate-300">{key === " " ? "Space" : key}<button type="button" aria-label={`Remove ${key || "Space"} from ${friendlyName[action] || action}`} className="ml-1 text-slate-400 hover:text-red-300" onClick={() => store.setCustomKeybinds({ ...store.customKeybinds, [action]: keys.filter((item) => item !== key) })}>×</button></span>) : <span className="text-xs text-slate-400">No keys bound</span>}</div></div><button type="button" className={`yomi-button ${recordingAction === action ? "yomi-button-danger" : "yomi-button-secondary"}`} onClick={() => setRecordingAction(action)}>{recordingAction === action ? "Press a key…" : "Record"}</button></div>)}</div>
      <button type="button" className="yomi-button yomi-button-secondary mt-5" onClick={resetKeybinds}>Reset shortcuts</button>
    </section>
  </div>;
}
