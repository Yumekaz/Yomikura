import { useSettingsStore } from "../stores/useSettingsStore";
import { paletteFor } from "../theme/palettes";

export function BrandLogo({ className = "" }: { className?: string }) {
  const palette = useSettingsStore((state) => state.colorPalette);
  return <img src={`/identity/logo-${paletteFor(palette).id}.webp`} alt="" aria-hidden="true" className={`yomi-logo-image ${className}`} width={64} height={64} decoding="async" />;
}

/** Decorative companion. It never appears over a comic or carries information. */
export function ReadingSpirit({ mood = "reading", className = "" }: { mood?: "reading" | "resting"; className?: string }) {
  const palette = useSettingsStore((state) => state.colorPalette);
  const visible = useSettingsStore((state) => state.showReadingSpirit);
  if (!visible) return null;
  return <img src={mood === "resting" ? "/identity/spirit-resting.webp" : `/identity/spirit-reading-${paletteFor(palette).id}.webp`} alt="" aria-hidden="true" className={`yomi-reading-spirit ${className}`} width={180} height={180} decoding="async" />;
}

/** One painted environment, blended into the sidebar rather than a cutout. */
export function SidebarCompanion() {
  const palette = useSettingsStore((state) => state.colorPalette);
  const visible = useSettingsStore((state) => state.showReadingSpirit);
  if (!visible) return null;
  const id = paletteFor(palette).id;
  return <figure className="yomi-sidebar-companion" aria-hidden="true">
    <div className="yomi-sidebar-scene">
      <img className="yomi-sidebar-scene-dark" src={`/identity/sidebar-${id}-dark.webp`} alt="" width={384} height={384} decoding="async" />
      <img className="yomi-sidebar-scene-light" src={`/identity/sidebar-${id}-light.webp`} alt="" width={384} height={384} decoding="async" />
    </div>
    <figcaption>Between the pages.</figcaption>
  </figure>;
}

export function SanctuaryArt() {
  return <picture className="yomi-sanctuary-art" aria-hidden="true">
    <img className="yomi-sanctuary-night" src="/identity/sanctuary-ember.webp" alt="" />
    <img className="yomi-sanctuary-day" src="/identity/sanctuary-paper.webp" alt="" />
  </picture>;
}
