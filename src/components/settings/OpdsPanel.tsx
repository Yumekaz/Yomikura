import { useMemo } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";

export function OpdsPanel() {
  const { serverBaseUrl } = useSettingsStore();

  const opdsUrl = useMemo(() => {
    const base = serverBaseUrl.replace(/\/$/, "");
    return base ? `${base}/api/v1/opds` : "";
  }, [serverBaseUrl]);

  if (!opdsUrl) {
    return <p className="text-xs text-slate-500">Connect to Suwayomi to expose OPDS.</p>;
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/5 bg-ink-950/30 p-4">
      <p className="text-xs text-slate-400">
        Use this OPDS URL in compatible readers (Kavita, panels apps, etc.).
      </p>
      <code className="block break-all rounded-lg bg-black/30 p-3 text-[11px] text-yomi-mint">
        {opdsUrl}
      </code>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(opdsUrl)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy URL
        </button>
        <a
          href={opdsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-yomi-jade/20 bg-yomi-jade/10 px-3 py-1.5 text-xs font-semibold text-yomi-jade hover:bg-yomi-jade/20"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open feed
        </a>
      </div>
    </div>
  );
}