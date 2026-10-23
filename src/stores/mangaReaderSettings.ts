import type { ProgressBackend } from "../api/suwayomi/backendIdentity";
import type { MangaOverride } from "./useSettingsStore";

export const mangaReaderSettingsKey = (backend: ProgressBackend, mangaId: string | number) => JSON.stringify([backend.key, String(mangaId)]);

/** Earlier releases stored only a numeric manga ID, with no evidence of its owning server. */
export function legacyMangaSettings(overrides: Record<string, MangaOverride>) {
  return Object.entries(overrides).filter(([id, value]) => /^\d+$/.test(id) && value && typeof value === "object" && !Array.isArray(value));
}

export function mergeMangaSettings(base: MangaOverride | undefined, patch: MangaOverride): MangaOverride {
  return { ...base, ...patch, ...(patch.imageFilters ? { imageFilters: { ...base?.imageFilters, ...patch.imageFilters } } : {}) };
}
