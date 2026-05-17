import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Settings, Box, Download, Trash2, EyeOff } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";

export default function ExtensionsPage() {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [showNsfw, setShowNsfw] = useState(false);
  const [langFilter, setLangFilter] = useState("all");

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["extensions", serverBaseUrl],
    queryFn: () => sdk.GetExtensions(),
    enabled: !!serverBaseUrl,
  });

  const { mutate: toggleInstall, isPending: toggling } = useMutation({
    mutationFn: ({ pkgName, install }: { pkgName: string, install: boolean }) => 
      sdk.ToggleExtensionInstall({
        input: {
          id: pkgName,
          patch: install ? { install: true } : { uninstall: true }
        }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extensions"] });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    }
  });

  const extensions = useMemo(() => {
    return data?.extensions?.edges?.map(e => e?.node).filter((n): n is NonNullable<typeof n> => n != null) || [];
  }, [data]);

  const languages = useMemo(() => {
    const langs = new Set<string>();
    extensions.forEach(ext => ext.lang && langs.add(ext.lang));
    return ["all", ...Array.from(langs).sort()];
  }, [extensions]);

  const filteredExtensions = useMemo(() => {
    return extensions.filter(ext => {
      if (!showNsfw && ext.isNsfw) return false;
      if (langFilter !== "all" && ext.lang !== langFilter) return false;
      if (searchInput) {
        const query = searchInput.toLowerCase();
        return ext.name.toLowerCase().includes(query) || ext.pkgName.toLowerCase().includes(query);
      }
      return true;
    }).sort((a, b) => {
      // Installed first, then alphabetical
      if (a.isInstalled && !b.isInstalled) return -1;
      if (!a.isInstalled && b.isInstalled) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [extensions, searchInput, showNsfw, langFilter]);

  return (
    <div className="min-h-screen bg-ink-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-ink-950/90 backdrop-blur-md border-b border-white/5 px-4 py-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Box className="h-6 w-6 text-yomi-jade" />
              Extensions
            </h1>
            <Link 
              to="/extensions/repos"
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Repositories</span>
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search extensions..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full rounded-lg bg-ink-900 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yomi-jade/50 border border-white/5"
              />
            </div>
            <div className="flex items-center gap-3">
              <select 
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
                className="rounded-lg bg-ink-900 px-3 py-2 text-sm text-slate-300 border border-white/5 focus:outline-none focus:ring-2 focus:ring-yomi-jade/50"
              >
                {languages.map(lang => (
                  <option key={lang} value={lang}>{lang === "all" ? "All Languages" : lang.toUpperCase()}</option>
                ))}
              </select>
              <button
                onClick={() => setShowNsfw(!showNsfw)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  showNsfw 
                    ? "bg-red-500/10 text-red-400 border-red-500/20" 
                    : "bg-ink-900 text-slate-400 border-white/5 hover:bg-white/5"
                }`}
              >
                <EyeOff className="h-4 w-4" />
                <span className="hidden sm:inline">18+</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
          </div>
        ) : isError ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-slate-400">
            <p>Failed to load extensions.</p>
          </div>
        ) : extensions.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-center text-slate-400 space-y-4">
            <Box className="h-12 w-12 opacity-50" />
            <div>
              <p className="text-lg text-slate-300">No extensions found</p>
              <p className="text-sm mt-1">You need to add an extension repository first.</p>
            </div>
            <Link 
              to="/extensions/repos"
              className="rounded-lg bg-yomi-jade px-6 py-2 font-semibold text-ink-950 hover:bg-yomi-jade/90"
            >
              Add Repository
            </Link>
          </div>
        ) : filteredExtensions.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
            No extensions match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredExtensions.map(ext => (
              <div key={ext.pkgName} className="flex items-center gap-4 rounded-xl border border-white/5 bg-ink-900 p-4">
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-ink-950 flex items-center justify-center">
                  {ext.iconUrl ? (
                    <img 
                      src={ext.iconUrl.startsWith("http") ? ext.iconUrl : `${serverBaseUrl.replace(/\/$/, "")}${ext.iconUrl}`} 
                      alt={ext.name}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Box className="h-6 w-6 text-slate-500" />
                  )}
                </div>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 truncate">{ext.name}</span>
                    {ext.isNsfw && (
                      <span className="rounded bg-red-500/20 px-1 py-0.5 text-[10px] font-bold text-red-400">18+</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="uppercase">{ext.lang}</span>
                    <span>•</span>
                    <span>v{ext.versionName}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleInstall({ pkgName: ext.pkgName, install: !ext.isInstalled })}
                  disabled={toggling}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition flex-shrink-0 ${
                    ext.isInstalled 
                      ? "text-red-400 hover:bg-red-400/10" 
                      : "bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
                  } disabled:opacity-50`}
                  title={ext.isInstalled ? "Uninstall" : "Install"}
                >
                  {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : ext.isInstalled ? <Trash2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
