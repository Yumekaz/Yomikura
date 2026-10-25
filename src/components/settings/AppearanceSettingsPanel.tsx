import { Globe, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { PALETTES, paletteFor } from "../../theme/palettes";

export function AppearanceSettingsPanel() {
  const { t } = useTranslation();
  const { colorPalette, setColorPalette, showReadingSpirit, setShowReadingSpirit, coverDensity, setCoverDensity, themeMode, setThemeMode, highContrastMode, setHighContrastMode, reducedMotion, setReducedMotion, coverDynamicTheme, setCoverDynamicTheme, language, setLanguage } = useSettingsStore();
  const selected = paletteFor(colorPalette);
  return <section className="yomi-appearance" aria-labelledby="appearance-settings-title">
    <div className="yomi-appearance-heading"><h2 id="appearance-settings-title">Appearance and theme</h2><p>A reading room that feels like you.</p></div>
    <fieldset className="yomi-appearance-section">
      <legend>Appearance</legend>
      <div className="yomi-appearance-modes">
        {(["dark", "light", "system"] as const).map((mode) => {
          const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
          return <button key={mode} type="button" aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)}><Icon aria-hidden="true" /><span>{mode[0].toUpperCase() + mode.slice(1)}</span></button>;
        })}
      </div>
    </fieldset>
    <fieldset className="yomi-appearance-section">
      <legend>Color palette</legend><p className="yomi-setting-description">Each palette includes a complete light and dark theme, with matching logo and spirit details.</p>
      <div className="yomi-palette-grid">
        {PALETTES.map((palette) => {
          const tokens = themeMode === "light" ? palette.light : palette.dark;
          return <button key={palette.id} type="button" className="yomi-palette-card" aria-label={palette.name} aria-pressed={selected.id === palette.id} onClick={() => setColorPalette(palette.id)}>
            <div className="yomi-palette-art" style={{ background: tokens.surface, color: tokens.strong }}>
              <img src={`/identity/logo-${palette.id}.webp`} width={50} height={50} alt="" />
              <span style={{ color: tokens.accent }}>Yomikura</span>
              <img className="yomi-palette-spirit" src={`/identity/spirit-reading-${palette.id}.webp`} width={72} height={72} alt="" />
            </div>
            <div className="yomi-palette-copy"><strong>{palette.name}</strong><span>{palette.description}</span><div className="yomi-palette-swatches" aria-hidden="true">{palette.swatches.map((color) => <i key={color} style={{ background: color }} />)}</div></div>
            <span className="yomi-palette-selection" aria-hidden="true">{selected.id === palette.id ? "Selected" : "Choose palette"}</span>
          </button>;
        })}
      </div>
    </fieldset>
    <div className="yomi-appearance-section yomi-companion-setting">
      <div><h3>Reading spirit</h3><p className="yomi-setting-description">A little company on your shelf and quiet screens. Always out of the way while you read.</p></div>
      <label className="yomi-switch"><input type="checkbox" checked={showReadingSpirit} onChange={(event) => setShowReadingSpirit(event.target.checked)} aria-label="Show reading spirit" /><span aria-hidden="true" /></label>
    </div>
    <fieldset className="yomi-appearance-section">
      <legend>Library cover density</legend><div className="yomi-density-options">{(["compact", "normal", "spacious"] as const).map((density) => <button key={density} type="button" aria-pressed={coverDensity === density} onClick={() => setCoverDensity(density)}>{density[0].toUpperCase() + density.slice(1)}</button>)}</div>
    </fieldset>
    <fieldset className="yomi-appearance-section">
      <legend>Comfort and accessibility</legend>
      <div className="yomi-comfort-options">
        {[[highContrastMode, setHighContrastMode, t("high_contrast")], [reducedMotion, setReducedMotion, t("reduce_motion")], [coverDynamicTheme, setCoverDynamicTheme, "Atmosphere from book cover"]].map(([checked, setter, label]) => <label key={String(label)}><input type="checkbox" checked={checked as boolean} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} /><span>{String(label)}</span></label>)}
      </div>
    </fieldset>
    <div className="yomi-appearance-section">
      <label htmlFor="appearance-language">Language</label><div className="yomi-language-control"><Globe aria-hidden="true" /><select id="appearance-language" value={language || "en"} onChange={(event) => setLanguage(event.target.value)} className="yomi-field"><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="ja">日本語</option><option value="pt">Português</option><option value="zh">中文</option><option value="ru">Русский</option><option value="it">Italiano</option><option value="ko">한국어</option></select></div>
    </div>
  </section>;
}
