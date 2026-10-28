export interface ReaderExperience {
  background: "black" | "paper" | "gray" | "theme";
  showPageNumber: boolean; keepAwake: boolean; autoFullscreen: boolean;
  showReadingMode: boolean; showTapZones: boolean;
  skipRead: boolean; skipFiltered: boolean; skipDuplicates: boolean; pauseBetweenChapters: boolean;
  tapLayout: "horizontal" | "vertical"; invertTapZones: "none" | "horizontal" | "vertical" | "both"; webtoonTapNavigation: boolean;
  sidePadding: number; hideControlsOnScroll: "off" | "low" | "medium" | "high";
  doubleTapZoom: boolean; disableZoomOut: boolean; autoZoomWide: boolean; zoomAnimationMs: number; zoomStart: "automatic" | "left" | "center" | "right";
  widePages: "fit" | "split" | "rotate"; wideWebtoon: "fit" | "split" | "rotate"; panWidePages: boolean; rotation: 0 | 90 | 180 | 270;
  verticalNavigator: boolean; navigatorLeft: boolean; navigatorHeight: number;
  pageActions: boolean; eInkFlash: boolean;
  exportTitleFolders: boolean;
}
export const DEFAULT_READER_EXPERIENCE: ReaderExperience = {
  background: "black", showPageNumber: false, keepAwake: false, autoFullscreen: false, showReadingMode: true, showTapZones: false,
  skipRead: false, skipFiltered: true, skipDuplicates: false, pauseBetweenChapters: false,
  tapLayout: "horizontal", invertTapZones: "none", webtoonTapNavigation: false, sidePadding: 0, hideControlsOnScroll: "off", doubleTapZoom: true, disableZoomOut: false, autoZoomWide: false, zoomAnimationMs: 180, zoomStart: "automatic",
  widePages: "fit", wideWebtoon: "fit", panWidePages: true, rotation: 0, verticalNavigator: false, navigatorLeft: false, navigatorHeight: 65, pageActions: true, eInkFlash: false,
  exportTitleFolders: true,
};
const oneOf = <T>(value: unknown, options: readonly T[], fallback: T): T => options.includes(value as T) ? value as T : fallback;
export function normalizeReaderExperience(value: unknown): ReaderExperience {
  const input = value && typeof value === "object" ? value as Partial<ReaderExperience> : {};
  const booleans = Object.fromEntries(Object.entries(DEFAULT_READER_EXPERIENCE).filter(([, item]) => typeof item === "boolean").map(([key, fallback]) => [key, typeof input[key as keyof ReaderExperience] === "boolean" ? input[key as keyof ReaderExperience] : fallback]));
  const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  return { ...DEFAULT_READER_EXPERIENCE, ...booleans,
    background: oneOf(input.background, ["black", "paper", "gray", "theme"], "black"), tapLayout: oneOf(input.tapLayout, ["horizontal", "vertical"], "horizontal"),
    invertTapZones: oneOf(input.invertTapZones, ["none", "horizontal", "vertical", "both"], "none"), hideControlsOnScroll: oneOf(input.hideControlsOnScroll, ["off", "low", "medium", "high"], "off"),
    zoomStart: oneOf(input.zoomStart, ["automatic", "left", "center", "right"], "automatic"), widePages: oneOf(input.widePages, ["fit", "split", "rotate"], "fit"), rotation: oneOf(input.rotation, [0, 90, 180, 270], 0),
    wideWebtoon: oneOf(input.wideWebtoon, ["fit", "split", "rotate"], "fit"),
    sidePadding: bounded(input.sidePadding, 0, 0, 25), navigatorHeight: bounded(input.navigatorHeight, 65, 25, 90), zoomAnimationMs: bounded(input.zoomAnimationMs, 180, 0, 500),
  };
}
