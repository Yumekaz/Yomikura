import { AlertTriangle, BookOpen, Compass, RotateCcw, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { getSourceRecoveryHints, SourceProblem } from "../../api/suwayomi/errors";

type SourceRecoveryPanelProps = {
  problem?: SourceProblem | null;
  title?: string;
  detail?: string;
  sourceName?: string | null;
  searchedTitle?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

export function SourceRecoveryPanel({
  problem,
  title,
  detail,
  sourceName,
  searchedTitle,
  onRetry,
  retryLabel = "Retry",
  className = "",
}: SourceRecoveryPanelProps) {
  const heading = title || problem?.title || "This source is not responding.";
  const body =
    detail ||
    problem?.detail ||
    "The current source did not return usable data. This does not mean Yomikura or your whole library is broken.";
  const hints = getSourceRecoveryHints(problem);

  return (
    <section
      className={`yomi-content-surface mx-auto flex w-full max-w-2xl flex-col items-center rounded-lg p-5 text-center ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-yomi-jade/10 text-yomi-jade">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="mt-4 text-lg font-semibold text-slate-100">{heading}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>

      {(sourceName || searchedTitle) && (
        <p className="mt-3 text-xs uppercase tracking-wide text-slate-600">
          {sourceName ? `Source: ${sourceName}` : ""}
          {sourceName && searchedTitle ? " | " : ""}
          {searchedTitle ? `Title: ${searchedTitle}` : ""}
        </p>
      )}

      <div className="mt-5 w-full rounded-md border border-white/10 bg-ink-950/60 p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Try this next</p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
          {hints.map((hint) => (
            <li key={hint} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-yomi-jade" />
              <span>{hint}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        {onRetry && (
          <button
            onClick={onRetry}
            className="yomi-button yomi-button-primary justify-center"
          >
            <RotateCcw className="h-4 w-4" />
            {retryLabel}
          </button>
        )}
        <Link
          to={problem?.kind === "app-network" ? "/downloads" : "/browse"}
          className="yomi-button yomi-button-secondary justify-center"
        >
          {problem?.kind === "app-network" ? <BookOpen className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
          {problem?.kind === "app-network" ? "Read saved chapters" : "Browse alternate sources"}
        </Link>
        <Link
          to="/settings/connection"
          className="yomi-button yomi-button-secondary justify-center"
        >
          <Settings className="h-4 w-4" />
          Connection settings
        </Link>
      </div>
    </section>
  );
}
