import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { collectLibraryPages } from "../../api/library/collectLibraryPages";
import { getCachedChapters } from "../../api/suwayomi/offlineCache";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import { nextFilterChoice, type FilterChoice } from "../../stores/experiencePreferences";
import { calendarDays, libraryStatistics, localDay, releaseEstimate, type InsightBook } from "./libraryInsights";
type Backend = NonNullable<ReturnType<typeof useProgressBackend>>;

export default function InsightsPage() {
  const backend = useProgressBackend(), calendar = useLocation().pathname === "/upcoming";
  return backend ? <LibraryInsights key={`${backend.key}:${calendar}`} backend={backend} calendar={calendar} /> : <div className="yomi-workspace"><h1>{calendar ? "Upcoming" : "Reading statistics"}</h1><p>Connect your library to see its reading activity.</p></div>;
}
function LibraryInsights({ backend, calendar }: { backend: Backend; calendar: boolean }) {
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live"), [backend]);
  const library = useQuery({ queryKey: ["library-insights", backend.key], queryFn: ({ signal }) => collectLibraryPages(async (after) => (await sdk.GetLibraryInsights({ after }, undefined, AbortSignal.any([signal, AbortSignal.timeout(20000)]))).mangas), staleTime: 60000, retry: false });
  return <div className="yomi-workspace">
    <div className="yomi-workspace-head"><div><h1>{calendar ? "Upcoming" : "Your reading, in perspective."}</h1><p>{calendar ? "A little something to look forward to." : "A quiet look at the stories in your library."}</p></div><button type="button" className="yomi-icon-button" disabled={library.isFetching} aria-label="Refresh library insights" onClick={() => void library.refetch()}><RefreshCw className={library.isFetching ? "animate-spin" : ""} /></button></div>
    <nav className="mb-6 flex gap-5 text-sm" aria-label="Reading insights"><Link className="yomi-text-link" aria-current={calendar ? "page" : undefined} to="/upcoming">Release calendar</Link><Link className="yomi-text-link" aria-current={!calendar ? "page" : undefined} to="/statistics">Statistics</Link></nav>
    {library.isPending ? <p role="status">Opening your library…</p> : library.isError ? <div className="yomi-surface p-6" role="alert"><p>The complete library couldn’t be loaded. Your books and progress are safe.</p><button className="yomi-button yomi-button-secondary mt-4" onClick={() => void library.refetch()}>Retry library insights</button></div> : calendar ? <ReleaseCalendar books={library.data} sdk={sdk} backendKey={backend.key} /> : <ReadingStatistics books={library.data} backend={backend} />}
  </div>;
}
function ReadingStatistics({ books, backend }: { books: InsightBook[]; backend: Backend }) {
  const stats = libraryStatistics(books);
  const device = useQuery({ queryKey: ["library-insights-device", backend.key], queryFn: async () => (await getCachedChapters(backend.serverBaseUrl)).filter((chapter) => !!chapter.isDemo === backend.isDemo && books.some((book) => book.id === chapter.mangaId && book.title === chapter.mangaTitle)).length, retry: false });
  const numbers = [["Books in your library", stats.books], ["Books started", stats.started], ["Completed & caught up", stats.completed], ["Chapters read", stats.read], ["Available chapters", stats.chapters], ["Saved on the server", stats.downloaded], ["Saved on this device", device.isError ? "Unavailable" : device.data ?? "…"], ["Books linked to a tracker", stats.tracked]];
  const genres = [...stats.genres].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  return <><dl className="yomi-statistics-grid">{numbers.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{typeof value === "number" ? value.toLocaleString() : value}</dd></div>)}</dl><p className="mt-5 text-xs leading-6 text-slate-400">Counts reflect the complete connected library. Device and server copies may overlap. Chapters are counted as listed by each source, including alternate translations. Reading time and comparable tracker ratings aren’t supplied by this library.</p>{genres.length > 0 && <section className="yomi-surface mt-8 p-6" aria-labelledby="genres-title"><h2 id="genres-title" className="font-display text-2xl text-slate-100">The worlds you return to</h2><div className="mt-5 space-y-4">{genres.map(([name, count]) => <div key={name}><div className="mb-2 flex justify-between gap-4 text-sm text-slate-300"><span>{name}</span><span>{count.toLocaleString()} {count === 1 ? "book" : "books"}</span></div><div className="h-1 rounded bg-white/10"><div className="h-full rounded bg-yomi-jade" style={{ width: `${count / Math.max(1, books.length) * 100}%` }} /></div></div>)}</div></section>}</>;
}
function ReleaseCalendar({ books, sdk, backendKey }: { books: InsightBook[]; sdk: ReturnType<typeof createGraphqlClient>; backendKey: string }) {
  const client = useQueryClient();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<number | null>(null), [limit, setLimit] = useState(24), [filters, setFilters] = useState<Record<number, FilterChoice>>({});
  const categories = [...new Map(books.flatMap((book) => book.categories.nodes).map((item) => [item.id, item])).values()];
  const include = categories.filter((item) => filters[item.id] === "include").map((item) => item.id), exclude = categories.filter((item) => filters[item.id] === "exclude").map((item) => item.id);
  const candidates = books.filter((book) => ["ONGOING", "PUBLISHING_FINISHED"].includes(book.status) && (!include.length || book.categories.nodes.some((item) => include.includes(item.id))) && !book.categories.nodes.some((item) => exclude.includes(item.id))).sort((a, b) => a.title.localeCompare(b.title));
  const considered = candidates.slice(0, limit);
  const estimates = useQuery({ queryKey: ["release-estimates", backendKey, considered.map((book) => book.id)], queryFn: async ({ signal }) => {
    const results: { book: InsightBook; estimate: ReturnType<typeof releaseEstimate>; error: boolean }[] = new Array(considered.length); let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, considered.length) }, async () => { for (;;) {
      const index = next++; if (index >= considered.length) return; signal.throwIfAborted(); const book = considered[index];
      try {
        const data = await client.fetchQuery({ queryKey: ["release-sample", backendKey, book.id], queryFn: ({ signal: inner }) => sdk.GetReleaseSample({ id: book.id }, undefined, AbortSignal.any([signal, inner, AbortSignal.timeout(15000)])), staleTime: 3600000, retry: false });
        results[index] = { book, estimate: releaseEstimate(data.chapters.nodes), error: false };
      } catch { signal.throwIfAborted(); results[index] = { book, estimate: null, error: true }; }
    } })); return results;
  }, retry: false });
  const rows = estimates.data ?? [], events = new Map<number, number>();
  for (const row of rows) if (row.estimate && !row.estimate.overdue) events.set(row.estimate.date, (events.get(row.estimate.date) ?? 0) + 1);
  const changeMonth = (offset: number) => { setMonth((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1)); setSelected(null); };
  const matching = rows.filter((row) => row.estimate && !row.estimate.overdue && (selected !== null ? row.estimate.date === selected : new Date(row.estimate.date).getMonth() === month.getMonth() && new Date(row.estimate.date).getFullYear() === month.getFullYear()));
  return <>
    <p className="mb-5 max-w-2xl text-sm leading-6 text-slate-400">These are estimates from recent chapter dates, never promised releases. Irregular, sparse and overdue patterns stay outside the calendar.</p>
    {categories.length > 0 && <details className="mb-5 text-sm text-slate-300"><summary className="cursor-pointer">Filter collections</summary><div className="mt-3 flex flex-wrap gap-2">{categories.map((item) => <button type="button" className="yomi-button yomi-button-secondary" aria-label={`${item.name}: ${filters[item.id] ?? "any"}`} key={item.id} onClick={() => setFilters((current) => ({ ...current, [item.id]: nextFilterChoice(current[item.id] ?? "any") }))}>{item.name}{filters[item.id] === "include" ? " · Include" : filters[item.id] === "exclude" ? " · Exclude" : ""}</button>)}</div><p className="mt-2 text-xs">Click a collection to include, exclude, or clear it.</p></details>}
    <section className="yomi-surface p-4 sm:p-6" aria-label="Release calendar"><div className="mb-5 flex items-center justify-between"><h2 className="font-display text-2xl text-slate-100" aria-live="polite">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><div className="flex gap-2"><button className="yomi-icon-button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft /></button><button className="yomi-button yomi-button-secondary" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelected(null); }}>This month</button><button className="yomi-icon-button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight /></button></div></div>
      <div className="yomi-calendar-grid">{Array.from({ length: 7 }, (_, index) => <span key={`week-${index}`} className="yomi-calendar-weekday">{new Date(2024, 0, index + 1).toLocaleDateString(undefined, { weekday: "short" })}</span>)}{calendarDays(month.getFullYear(), month.getMonth()).map((time, index) => time === null ? <span key={`blank-${index}`} /> : <button type="button" key={time} className={`yomi-calendar-day ${time === localDay(Date.now()) ? "is-today" : ""}`} aria-pressed={selected === time} aria-label={`${new Date(time).toLocaleDateString(undefined, { dateStyle: "full" })}, ${events.get(time) ?? 0} estimated releases`} onClick={() => setSelected(selected === time ? null : time)}><span>{new Date(time).getDate()}</span>{events.has(time) && <small>{events.get(time)}<span className="sr-only"> estimated releases</span></small>}</button>)}</div>
    </section>
    {estimates.isPending ? <p role="status" className="mt-5 text-sm text-slate-400">Checking recent release patterns…</p> : estimates.isError ? <p role="alert" className="mt-5 text-sm">Release patterns couldn’t be loaded. <button className="yomi-text-link" onClick={() => void estimates.refetch()}>Retry estimates</button></p> : <div className="mt-6"><p className="mb-4 text-xs text-slate-400">{considered.length} of {candidates.length} eligible books checked · {rows.filter((row) => row.estimate?.overdue).length} overdue patterns · {rows.filter((row) => !row.estimate && !row.error).length} without a stable pattern{rows.some((row) => row.error) && <> · Some books couldn’t be checked. <button className="yomi-text-link" onClick={() => void estimates.refetch()}>Retry</button></>}</p>
      {matching.length ? <div className="yomi-surface">{matching.sort((a, b) => a.estimate!.date - b.estimate!.date).map(({ book, estimate }) => <Link key={book.id} to={`/manga/${book.id}`} className="yomi-surface-row"><div className="yomi-row-copy"><span className="yomi-row-title">{book.title}</span><p>Estimated {new Date(estimate!.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · Usually every {estimate!.interval} days</p><small>Based on {estimate!.samples} recent release days</small></div><ChevronRight className="h-4 w-4 text-slate-400" /></Link>)}</div> : <p className="py-6 text-sm text-slate-400">No reliable estimates {selected !== null ? "for this day" : "in this month"}. Read at your own pace.</p>}
      {considered.length < candidates.length && <button className="yomi-button yomi-button-secondary mt-4" onClick={() => setLimit((value) => value + 24)}>Check more books</button>}
    </div>}
  </>;
}
