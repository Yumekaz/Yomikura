import { AlertCircle, Bug, CircleHelp, FlaskConical, ShieldCheck } from "lucide-react";
import { isTauri } from "../../stores/useSettingsStore";
import { APP_VERSION } from "../../utils/appVersion";
import { SuwayomiServerUpdaterRow, TauriUpdaterRow } from "./UpdatePanels";
import { BrandLogo } from "../Brand";

export function AboutSettingsPanel() {
  const desktop = isTauri();

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
        <div className="flex flex-col items-center text-center pb-6 border-b border-white/5">
          <div className="h-16 w-16"><BrandLogo /></div>
          <h2 className="yomi-about-wordmark mt-4 text-white">Yomikura</h2>
          <p className="text-xs font-semibold text-yomi-jade uppercase tracking-wider mt-1">Version {APP_VERSION}</p>
          <p className="mt-3 text-sm text-slate-400 max-w-md">A focused manga reader for Suwayomi libraries. Built for speed, privacy, and a calm reading experience.</p>
        </div>

        <div className="mt-6 space-y-6">
          {desktop && <TauriUpdaterRow />}
          <SuwayomiServerUpdaterRow />

          <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-5">
            <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2"><AlertCircle className="h-4.5 w-4.5" />Legal disclaimer</h3>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed font-serif italic">
              Yomikura is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider. Yomikura does not operate third-party reading sources. {desktop ? "Desktop mode can run a local Suwayomi instance; users are responsible for their sources and library data." : "Users are responsible for configuring their own server, sources, and repositories."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg bg-ink-950/30 border border-white/5 p-4"><span className="font-semibold text-slate-300 block mb-1">Inspirations</span><span className="text-slate-500">Mihon and the Tachiyomi ecosystem</span></div>
            <div className="rounded-lg bg-ink-950/30 border border-white/5 p-4"><span className="font-semibold text-slate-300 block mb-1">Architecture</span><span className="text-slate-500">Zustand, React Query, Vite, Tauri</span></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Help and project information">
            <a className="yomi-button yomi-button-secondary justify-center" href="https://github.com/Yumekaz/Yomikura/issues/new?template=beta_feedback.yml" target="_blank" rel="noreferrer"><FlaskConical />Beta feedback</a>
            <a className="yomi-button yomi-button-secondary justify-center" href="https://github.com/Yumekaz/Yomikura/issues/new?template=bug_report.yml" target="_blank" rel="noreferrer"><Bug />Report a bug</a>
            <a className="yomi-button yomi-button-secondary justify-center" href="https://github.com/Yumekaz/Yomikura/blob/main/docs/TROUBLESHOOTING.md" target="_blank" rel="noreferrer"><CircleHelp />Troubleshooting</a>
            <a className="yomi-button yomi-button-secondary justify-center" href="https://github.com/Yumekaz/Yomikura/blob/main/PRIVACY.md" target="_blank" rel="noreferrer"><ShieldCheck />Privacy</a>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">Third-party components are documented in <a href="https://github.com/Yumekaz/Yomikura/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer" className="text-yomi-jade hover:underline">THIRD_PARTY_NOTICES.md</a>.</p>
          <p className="text-xs text-slate-500 leading-relaxed">Set in Playfair Display and Inter. Both typefaces are included under the SIL Open Font License.</p>
        </div>
      </div>
    </div>
  );
}
