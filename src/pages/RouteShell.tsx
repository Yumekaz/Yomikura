export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function RouteShell({
  title,
  detail,
  immersive = false,
}: {
  title: string;
  detail: string;
  immersive?: boolean;
}) {
  return (
    <section className="min-h-screen px-5 py-6 sm:px-8 lg:px-10">
      <header className="flex items-center justify-between border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-semibold text-yomi-jade">Yomikura</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{title}</h1>
        </div>
        <span className="hidden rounded-md border border-white/10 px-3 py-2 text-sm text-slate-400 sm:inline-flex">
          Coming later
        </span>
      </header>
      <div
        className={`mt-8 rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel ${
          immersive ? "min-h-[62vh]" : ""
        }`}
      >
        <p className="max-w-2xl text-base leading-8 text-slate-300">{detail}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric label="Backend" value="Suwayomi" />
          <Metric label="Content hosted" value="No" />
          <Metric label="APK execution" value="No" />
        </div>
      </div>
    </section>
  );
}

export default RouteShell;
