import { PALETTES } from "../theme/palettes";
import { normalizeDownloadExperience } from "./downloadExperience";
import { normalizeReaderExperience } from "./readerExperience";
import { useSettingsStore } from "./useSettingsStore";

const options = {
  readerMode: ["WEBTOON", "LTR", "RTL"],
  fitMode: ["FIT_SCREEN", "FIT_WIDTH", "FIT_HEIGHT"],
  pageSpread: ["SINGLE", "DOUBLE", "DOUBLE_COVER"],
  colorPalette: PALETTES.map(({ id }) => id),
  coverDensity: ["compact", "normal", "spacious"],
  themeMode: ["dark", "light", "system"],
  pageTransition: ["fade", "slide", "none"],
  readerNavigationMode: ["edge", "wide", "disabled"],
  libraryViewMode: ["grid", "list"],
} as const;
const toggles = ["showReadingSpirit", "cropBorders", "highContrastMode", "reducedMotion", "infiniteChapterReading", "coverDynamicTheme", "librarySortDescending"] as const;
const keyActions = ["prevPage", "nextPage", "toggleOverlay", "cycleFit", "cycleSpread"] as const;
type Settings = ReturnType<typeof useSettingsStore.getState>;
type PortableKeys = keyof typeof options | typeof toggles[number] | "customKeybinds" | "imageFilters";
export type RecoveryPreferences = Partial<Pick<Settings, PortableKeys>> & {
  reader: ReturnType<typeof normalizeReaderExperience>;
  downloads: Pick<ReturnType<typeof normalizeDownloadExperience>, "unmeteredOnly" | "preloadUnmeteredOnly" | "connectionCost" | "pageConcurrency" | "preloadPages" | "splitTallImages">;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isImageAdjustment(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 400;
}

export function parseRecoveryPreferences(value: unknown): RecoveryPreferences {
  const input = record(value);
  const optionsAndToggles = Object.fromEntries([
    ...Object.entries(options).filter(([key, allowed]) => allowed.some((choice) => choice === input[key])).map(([key]) => [key, input[key]]),
    ...toggles.filter((key) => typeof input[key] === "boolean").map((key) => [key, input[key]]),
  ]) as Partial<Pick<Settings, PortableKeys>>;
  const keys = record(input.customKeybinds);
  const customKeybinds = Object.fromEntries(keyActions.flatMap((action) => {
    const entries = keys[action];
    return Array.isArray(entries) && entries.length <= 20 && entries.every((key) => typeof key === "string" && key.length <= 40) ? [[action, entries]] : [];
  }));
  const { grayscale, invert, brightness, contrast } = record(input.imageFilters);
  const { unmeteredOnly, preloadUnmeteredOnly, connectionCost, pageConcurrency, preloadPages, splitTallImages } = normalizeDownloadExperience(input.downloads);
  return {
    ...optionsAndToggles,
    ...(Object.keys(customKeybinds).length ? { customKeybinds } : {}),
    ...(isImageAdjustment(grayscale) && isImageAdjustment(invert) && isImageAdjustment(brightness) && isImageAdjustment(contrast)
      ? { imageFilters: { grayscale, invert, brightness, contrast } } : {}),
    reader: normalizeReaderExperience(input.reader),
    downloads: { unmeteredOnly, preloadUnmeteredOnly, connectionCost, pageConcurrency, preloadPages, splitTallImages },
  };
}

export function captureRecoveryPreferences() {
  const settings = useSettingsStore.getState();
  return parseRecoveryPreferences({ ...settings, reader: settings.experience.reader, downloads: settings.experience.downloads });
}

export function applyRecoveryPreferences({ reader, downloads, customKeybinds, ...settings }: RecoveryPreferences) {
  useSettingsStore.setState((current) => ({
    ...settings,
    ...(customKeybinds ? { customKeybinds: { ...current.customKeybinds, ...customKeybinds } } : {}),
    experience: { ...current.experience, reader, downloads: { ...current.experience.downloads, ...downloads } },
  }));
}
