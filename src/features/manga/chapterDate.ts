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
  return timestamp === null ? "Unknown date" : new Date(timestamp).toLocaleDateString();
}
