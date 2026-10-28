export interface DownloadExperience {
  unmeteredOnly: boolean;
  preloadUnmeteredOnly: boolean;
  connectionCost: "automatic" | "metered" | "unmetered";
  pageConcurrency: number;
  preloadPages: number;
  keepBookmarked: boolean;
  excludedCategories: Record<string, number[]>;
  keepRecentChapters: number;
  cleanupDelayHours: number;
  removeAfterMarkedRead: boolean;
}
export const DEFAULT_DOWNLOAD_EXPERIENCE: DownloadExperience = { unmeteredOnly: false, preloadUnmeteredOnly: false, connectionCost: "automatic", pageConcurrency: 1, preloadPages: 3, keepBookmarked: true, excludedCategories: {}, keepRecentChapters: 0, cleanupDelayHours: 0, removeAfterMarkedRead: false };
export function normalizeDownloadExperience(value: unknown): DownloadExperience {
  const input = value && typeof value === "object" ? value as Partial<DownloadExperience> : {};
  const count = (value: unknown, fallback: number, max: number, min = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
  return { ...DEFAULT_DOWNLOAD_EXPERIENCE,
    unmeteredOnly: input.unmeteredOnly === true, preloadUnmeteredOnly: input.preloadUnmeteredOnly === true,
    connectionCost: input.connectionCost === "metered" || input.connectionCost === "unmetered" ? input.connectionCost : "automatic",
    pageConcurrency: count(input.pageConcurrency, 1, 6, 1), preloadPages: count(input.preloadPages, 3, 10),
    keepBookmarked: input.keepBookmarked !== false, keepRecentChapters: count(input.keepRecentChapters, 0, 20), cleanupDelayHours: count(input.cleanupDelayHours, 0, 720), removeAfterMarkedRead: input.removeAfterMarkedRead === true,
    excludedCategories: input.excludedCategories && typeof input.excludedCategories === "object" ? Object.fromEntries(Object.entries(input.excludedCategories).filter(([, ids]) => Array.isArray(ids)).map(([key, ids]) => [key, [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id >= 0))]])) : {},
  };
}
