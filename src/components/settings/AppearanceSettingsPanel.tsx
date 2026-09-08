import { Globe, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { useSettingsStore } from "../../stores/useSettingsStore";

const accents = [
  { name: "jade", className: "bg-[#efeae2]", label: "Ivory" },
  { name: "mint", className: "bg-teal-400", label: "Mint" },
  { name: "gold", className: "bg-amber-500", label: "Gold" },
  { name: "plum", className: "bg-fuchsia-600", label: "Plum" },
  { name: "coral", className: "bg-rose-500", label: "Coral" },
] as const;

export function AppearanceSettingsPanel() {
  const { t } = useTranslation();
  const { accentColor, setAccentColor, coverDensity, setCoverDensity, themeMode, setThemeMode, highContrastMode, setHighContrastMode, reducedMotion, setReducedMotion, coverDynamicTheme, setCoverDynamicTheme, language, setLanguage } = useSettingsStore();
  return <section className="rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" aria-labelledby="appearance-settings-title">
    <h2 id="appearance-settings-title" className="flex items-center gap-2 text-lg font-semibold text-white"><Palette className="h-5 w-5 text-yomi-jade" />Appearance and theme</h2>
    <p className="mt-2 text-sm text-slate-400">Choose a clear, comfortable reading environment. Changes apply immediately.</p>
    <div className="mt-6 space-y-7">
      <fieldset><legend className="mb-3 text-sm font-medium text-slate-300">Theme mode</legend><div className="grid max-w-md grid-cols-3 gap-3">{(["dark", "light", "system"] as const).map((mode) => { const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor; return <button key={mode} type="button" aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)} className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[.97] ${themeMode === mode ? "border-yomi-jade bg-yomi-jade/10 text-yomi-jade" : "border-white/10 bg-ink-950/40 text-slate-400 hover:text-slate-200"}`}><Icon className="h-5 w-5" /><span className="capitalize">{mode}</span></button>; })}</div></fieldset>
      <fieldset><legend className="mb-3 text-sm font-medium text-slate-300">Accent color</legend><div className="flex flex-wrap gap-3">{accents.map((color) => <button key={color.name} type="button" aria-pressed={accentColor === color.name} onClick={() => setAccentColor(color.name)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[.97] ${accentColor === color.name ? "border-yomi-jade bg-yomi-jade/10 text-white" : "border-white/10 bg-ink-950/40 text-slate-400 hover:text-slate-200"}`}><span className={`h-4 w-4 rounded-full border border-white/20 ${color.className}`} /><span>{color.label}</span></button>)}</div></fieldset>
      <fieldset><legend className="mb-3 text-sm font-medium text-slate-300">Library cover density</legend><div className="grid max-w-md grid-cols-3 gap-3">{(["compact", "normal", "spacious"] as const).map((density) => <button key={density} type="button" aria-pressed={coverDensity === density} onClick={() => setCoverDensity(density)} className={`rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-[background-color,border-color,color,transform] duration-150 active:scale-[.97] ${coverDensity === density ? "border-yomi-jade bg-yomi-jade/10 text-yomi-jade" : "border-white/10 bg-ink-950/40 text-slate-400 hover:text-slate-200"}`}>{density}</button>)}</div></fieldset>
      <fieldset className="space-y-3 border-t border-white/10 pt-6"><legend className="px-1 text-sm font-medium text-slate-300">Accessibility</legend>{[[highContrastMode, setHighContrastMode, t("high_contrast")], [reducedMotion, setReducedMotion, t("reduce_motion")], [coverDynamicTheme, setCoverDynamicTheme, t("cover_theme")]].map(([checked, setter, label]) => <label key={String(label)} className="flex cursor-pointer items-center gap-2.5"><input type="checkbox" checked={checked as boolean} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} className="h-4 w-4 rounded border-white/15 bg-ink-950 text-yomi-jade" /><span className="text-sm text-slate-300">{String(label)}</span></label>)}</fieldset>
      <div className="border-t border-white/10 pt-6"><label htmlFor="appearance-language" className="mb-3 block text-sm font-medium text-slate-300">Language</label><div className="flex max-w-md items-center gap-3"><Globe className="h-5 w-5 shrink-0 text-yomi-jade" /><select id="appearance-language" value={language || "en"} onChange={(event) => setLanguage(event.target.value)} className="yomi-field w-full"><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="ja">日本語</option><option value="pt">Português</option><option value="zh">中文</option><option value="ru">Русский</option><option value="it">Italiano</option><option value="ko">한국어</option></select></div></div>
    </div>
  </section>;
}
