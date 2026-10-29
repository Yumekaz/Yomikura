import { DEFAULT_READER_EXPERIENCE, normalizeReaderExperience, type ReaderExperience } from "./readerExperience";
import { DEFAULT_DOWNLOAD_EXPERIENCE, normalizeDownloadExperience, type DownloadExperience } from "./downloadExperience";
export type FilterChoice = "any" | "include" | "exclude";
export type LibraryFilterName = "downloaded" | "unread" | "started" | "bookmarked" | "completed";
export type LibraryFilterSet = Record<LibraryFilterName, FilterChoice>;
export const EMPTY_LIBRARY_FILTERS: LibraryFilterSet = { downloaded: "any", unread: "any", started: "any", bookmarked: "any", completed: "any" };
export interface ExperiencePreferences {
  reader: ReaderExperience;
  downloads: DownloadExperience;
  sourcePins: Record<string, string[]>;
  recentSources: Record<string, string[]>;
  hideLibraryEntries: boolean;
  applyContentFilterToInstalled: boolean;
  libraryFilters: Record<string, LibraryFilterSet>;
  perCategorySort: boolean;
  categorySorts: Record<string, { mode: string; descending: boolean }>;
  libraryUpdateRuns: Record<string, { requestedAt: number; status: "idle" | "running" | "success" | "error"; error: string }>;
}
export const DEFAULT_EXPERIENCE: ExperiencePreferences = { reader: DEFAULT_READER_EXPERIENCE, downloads: DEFAULT_DOWNLOAD_EXPERIENCE, sourcePins: {}, recentSources: {}, hideLibraryEntries: false, applyContentFilterToInstalled: false, libraryFilters: {}, perCategorySort: false, categorySorts: {}, libraryUpdateRuns: {} };

export function normalizeLibraryFilters(value?: Partial<LibraryFilterSet>): LibraryFilterSet {
  return Object.fromEntries(Object.keys(EMPTY_LIBRARY_FILTERS).map((key) => {
    const choice = value?.[key as LibraryFilterName];
    return [key, choice === "include" || choice === "exclude" ? choice : "any"];
  })) as LibraryFilterSet;
}
export function nextFilterChoice(value: FilterChoice): FilterChoice {
  return value === "any" ? "include" : value === "include" ? "exclude" : "any";
}
export function normalizeExperience(value: unknown): ExperiencePreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_EXPERIENCE };
  const input = value as Partial<ExperiencePreferences>;
  const ids = (map: unknown): Record<string, string[]> => !map || typeof map !== "object" ? {} : Object.fromEntries(Object.entries(map).filter(([, list]) => Array.isArray(list)).map(([key, list]) => [key, [...new Set((list as unknown[]).filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 100))]]));
  return { ...DEFAULT_EXPERIENCE, ...input,
    reader: normalizeReaderExperience(input.reader),
    downloads: normalizeDownloadExperience(input.downloads),
    sourcePins: ids(input.sourcePins), recentSources: ids(input.recentSources),
    hideLibraryEntries: input.hideLibraryEntries === true, applyContentFilterToInstalled: input.applyContentFilterToInstalled === true,
    perCategorySort: input.perCategorySort === true,
    libraryUpdateRuns: input.libraryUpdateRuns && typeof input.libraryUpdateRuns === "object" ? Object.fromEntries(Object.entries(input.libraryUpdateRuns).filter(([, value]) => value && typeof value === "object").map(([key, value]) => [key, { requestedAt: Number.isFinite(value.requestedAt) ? Math.max(0, value.requestedAt) : 0, status: ["idle", "running", "success", "error"].includes(value.status) ? value.status : "idle", error: typeof value.error === "string" ? value.error.slice(0, 500) : "" }])) : {},
    libraryFilters: input.libraryFilters && typeof input.libraryFilters === "object" ? Object.fromEntries(Object.entries(input.libraryFilters).map(([key, filters]) => [key, normalizeLibraryFilters(filters)])) : {},
    categorySorts: input.categorySorts && typeof input.categorySorts === "object" ? Object.fromEntries(Object.entries(input.categorySorts).filter(([, choice]) => choice && typeof choice.mode === "string").map(([key, choice]) => [key, { mode: choice.mode, descending: choice.descending === true }])) : {},
  };
}
