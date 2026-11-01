import { useSettingsStore } from "../../stores/useSettingsStore";
export function parseChapterTimestamp(value: string | number): number | null {
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    return numeric < 30_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatChapterDate(value: string | number): string {
  const timestamp = parseChapterTimestamp(value);
  if (timestamp === null) return "Unknown date";
  const date = new Date(timestamp), format = useSettingsStore.getState().experience.chapterDateFormat;
  if (format === "iso") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return date.toLocaleDateString(undefined, format === "long" ? { year: "numeric", month: "long", day: "numeric" } : undefined);
}
