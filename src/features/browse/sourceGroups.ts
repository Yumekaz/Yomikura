export interface SourceSummary { id: unknown; name: string; lang: string; iconUrl?: string | null; supportsLatest?: boolean; isConfigurable?: boolean; isNsfw?: boolean }
export function groupReadingSources<T extends SourceSummary>(sources: T[], pinned: string[], recent: string[]) {
  const byId = new Map(sources.map((source) => [String(source.id), source]));
  const pins = pinned.map((id) => byId.get(id)).filter((source): source is T => !!source);
  const pinIds = new Set(pins.map((source) => String(source.id)));
  const last = recent.map((id) => byId.get(id)).find((source): source is T => !!source);
  const languages = new Map<string, T[]>();
  for (const source of sources) if (!pinIds.has(String(source.id))) {
    const lang = source.lang || "all";
    languages.set(lang, [...(languages.get(lang) ?? []), source]);
  }
  return { lastUsed: last ? [last] : [], pinned: pins, languages: [...languages].sort(([a], [b]) => a.localeCompare(b)).map(([language, items]) => ({ language, items: items.sort((a, b) => a.name.localeCompare(b.name)) })) };
}
