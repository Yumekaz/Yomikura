import { BookOpen, SlidersHorizontal } from "lucide-react";
import { BrandLockup } from "../components/layout/AppShell";
import { Metric } from "./RouteShell";

function ConnectPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-ink-950 text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
        <section className="flex min-h-[620px] flex-col justify-between px-6 py-6 sm:px-10 lg:px-14">
          <BrandLockup />
          <div className="max-w-xl py-16 lg:py-0">
            <h1 className="max-w-lg text-5xl font-semibold leading-tight text-white sm:text-6xl">
              Connect your Suwayomi library.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-slate-300">
              Yomikura is a browser-first reader interface for your own server. Phase 1
              sets up the shell only, so connection testing begins in Phase 2.
            </p>
            <form className="mt-9 max-w-xl rounded-md border border-white/10 bg-white/[0.04] p-3 shadow-panel">
              <label className="block px-1 pb-2 text-sm font-medium text-slate-300" htmlFor="server-url">
                Suwayomi server URL
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="server-url"
                  className="min-h-12 flex-1 rounded-md border border-white/10 bg-ink-900 px-4 text-sm text-slate-300 outline-none placeholder:text-slate-600"
                  placeholder="http://localhost:4567"
                  disabled
                />
                <button
                  className="min-h-12 rounded-md bg-yomi-jade px-5 text-sm font-semibold text-ink-950 opacity-70"
                  type="button"
                  disabled
                >
                  Connect in Phase 2
                </button>
              </div>
            </form>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-400">
              <a
                className="rounded-md border border-white/10 px-4 py-2 text-slate-200 transition hover:border-yomi-jade/60 hover:text-white"
                href="https://github.com/Yumekaz/Yomikura/blob/main/docs/PROJECT_BLUEPRINT.md"
                rel="noreferrer"
                target="_blank"
              >
                Open setup guide
              </a>
              <span className="rounded-md border border-white/10 px-4 py-2">
                No demo data loaded
              </span>
            </div>
          </div>
          <p className="max-w-md text-xs leading-6 text-slate-500">
            Yomikura is independent and hosts zero content. Extension execution remains
            backend-owned.
          </p>
        </section>
        <section className="relative hidden min-h-screen items-center justify-center border-l border-white/10 bg-ink-900 px-10 lg:flex">
          <ReaderPreview />
        </section>
      </div>
    </main>
  );
}

function ReaderPreview() {
  const covers = ["#7dd8bd", "#f2c879", "#b69bff", "#ef8a7a", "#d9e4ff", "#99d6ff"];

  return (
    <div className="w-full max-w-3xl">
      <div className="rounded-md border border-white/10 bg-ink-850 p-4 shadow-panel">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-sm font-semibold text-white">Library shell</p>
            <p className="mt-1 text-xs text-slate-500">Synthetic preview, no source content</p>
          </div>
          <SlidersHorizontal className="h-5 w-5 text-slate-500" />
        </div>
        <div className="grid grid-cols-[1fr_1.15fr] gap-5 pt-5">
          <div className="grid grid-cols-2 gap-3">
            {covers.map((color, index) => (
              <div key={color} className="aspect-[3/4] rounded-md border border-white/10 bg-ink-800 p-2">
                <div className="h-full rounded-sm" style={{ background: color }}>
                  <div className="flex h-full items-end p-3">
                    <span className="rounded bg-black/25 px-2 py-1 text-[10px] font-semibold text-white">
                      Vol {index + 1}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-white/10 bg-ink-950 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-yomi-jade/15 text-yomi-mint">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Reader ready shell</p>
                <p className="mt-1 text-xs text-slate-500">Pages arrive after backend wiring</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {[72, 94, 58, 86, 66].map((width, index) => (
                <div key={width} className="h-3 rounded-full bg-white/8">
                  <div
                    className="h-3 rounded-full bg-yomi-jade/70"
                    style={{ width: `${index === 0 ? 100 : width}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <Metric label="Routes" value="10" />
              <Metric label="Backend" value="Later" />
              <Metric label="Mock" value="Off" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConnectPage;
