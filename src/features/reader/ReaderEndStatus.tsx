import { ArrowRight, BookOpen, CircleAlert, Info, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReaderEndState } from "./readerEndState";

interface ReaderEndStatusProps {
  chapterName: string;
  mangaId: number;
  state: ReaderEndState;
  finished: boolean;
  pagesReady: boolean;
  pagesFailed?: boolean;
  checking?: boolean;
  onCheck: () => void;
  onNext?: () => void;
}

const messages: Record<ReaderEndState, { title: string; detail: string }> = {
  "caught-up": { title: "There’s no next chapter.", detail: "This is the last chapter currently listed. Check again when new chapters arrive." },
  filtered: { title: "No next chapter in this reading list.", detail: "Other known chapters are excluded by your current reading filters. Review the comic’s chapter list to choose another." },
  offline: { title: "No further saved chapters.", detail: "Reconnect your library to check for the next chapter. This saved list cannot confirm the source’s latest release." },
  unknown: { title: "The next chapter couldn’t be confirmed.", detail: "Your current chapter remains available. Retry the chapter list when your library can be reached." },
  checking: { title: "Checking the next chapter…", detail: "The chapter list is still loading." },
  next: { title: "Next chapter", detail: "Continue or view chapters. Unsaved pages need your library and source connection." },
};

/** Only describes reading state. Progress and completion remain owned by ReaderSession. */
export function ReaderEndStatus({ chapterName, mangaId, state, finished, pagesReady, pagesFailed = false, checking = false, onCheck, onNext }: ReaderEndStatusProps) {
  const message = pagesFailed
    ? { title: "Some pages couldn’t be loaded.", detail: "Retry the failed pages above before finishing this chapter. Your earlier reading progress is kept." }
    : !pagesReady ? { title: "Waiting for the final page…", detail: "This chapter will be finished after its final page has loaded and been read." }
    : messages[state];
  const busy = checking || state === "checking";
  return <section className="yomi-reader-end mx-auto w-full max-w-2xl px-6 py-12 text-left" style={{ minHeight: "var(--reader-end-height, 320px)" }} aria-label="Chapter end" onClick={(event) => event.stopPropagation()}>
    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">{finished && pagesReady && !pagesFailed ? "Finished" : "End of chapter"}</p>
    <h2 className="mb-6 break-words font-display text-2xl text-slate-100">{chapterName}</h2>
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-ink-900 p-4" role="status">
      {pagesFailed ? <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" /> : busy ? <Loader2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-slate-300" /> : <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--yomi-signature))]" />}
      <div><p className="font-medium text-slate-100">{message.title}</p><p className="mt-2 text-sm leading-6 text-slate-300">{message.detail}</p></div>
    </div>
    <div className="mt-5 flex flex-wrap gap-3">
      {state === "next" && onNext && pagesReady && !pagesFailed && <button type="button" className="yomi-button yomi-button-primary" onClick={onNext}>Continue reading<ArrowRight aria-hidden="true" /></button>}
      {state !== "next" && <button type="button" className="yomi-button yomi-button-secondary" onClick={onCheck} disabled={busy}>{busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}{busy ? "Checking…" : "Check chapter list"}</button>}
      <Link to={`/manga/${mangaId}`} className="yomi-button yomi-button-secondary"><BookOpen aria-hidden="true" />View chapters</Link>
    </div>
  </section>;
}
