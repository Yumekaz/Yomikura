import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Download,
  EyeOff,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";

type ExtensionAction = {
  pkgName: string;
  name: string;
  action: "install" | "uninstall" | "update";
};

type StatusMessage = {
  kind: "success" | "error";
  title: string;
  detail?: string;
};

const ALL_LANG_FILTER = "__all__";

export default function ExtensionsPage() {
  const { serverBaseUrl, showNsfw, setShowNsfw } = useSettingsStore();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [langFilter, setLangFilter] = useState(ALL_LANG_FILTER);
  const [activeExtensionPkgs, setActiveExtensionPkgs] = useState<Set<string>>(() => new Set());
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["extensions", serverBaseUrl],
    queryFn: () => sdk.GetExtensions(),
    enabled: !!serverBaseUrl,
  });

  const markExtensionBusy = (pkgName: string, busy: boolean) => {
    setActiveExtensionPkgs((current) => {
      const next = new Set(current);
      if (busy) {
        next.add(pkgName);
      } else {
        next.delete(pkgName);
      }
      return next;
    });
  };

  const invalidateExtensionData = () => {
    queryClient.invalidateQueries({ queryKey: ["extensions"] });
    queryClient.invalidateQueries({ queryKey: ["sources"] });
    queryClient.invalidateQueries({ queryKey: ["all-sources"] });
    queryClient.invalidateQueries({ queryKey: ["installed-ext-langs"] });
  };

  const { mutate: refreshCatalog, isPending: refreshingCatalog } = useMutation({
    mutationFn: () => sdk.FetchExtensionCatalog({ input: {} }),
    onMutate: () => {
      setStatusMessage(null);
    },
    onSuccess: (result) => {
      const syncedCount = result.fetchExtensions?.extensions?.length ?? 0;
      setStatusMessage({
        kind: "success",
        title: "Catalog refreshed",
        detail: syncedCount
          ? `${syncedCount.toLocaleString()} extensions were synced from Suwayomi.`
          : "Suwayomi accepted the refresh request. Recheck the list after the server finishes syncing.",
      });
      invalidateExtensionData();
    },
    onError: (error) => {
      setStatusMessage({
        kind: "error",
        title: "Catalog refresh failed",
        detail: getErrorMessage(error),
      });
    },
  });

  const { mutate: toggleInstall } = useMutation({
    mutationFn: ({ pkgName, action }: ExtensionAction) =>
      sdk.ToggleExtensionInstall({
        input: {
          id: pkgName,
          patch:
            action === "install"
              ? { install: true }
              : action === "uninstall"
                ? { uninstall: true }
                : { update: true }
        }
      }),
    onMutate: ({ pkgName }) => {
      markExtensionBusy(pkgName, true);
      setStatusMessage(null);
    },
    onSuccess: (result, variables) => {
      const isInstalled = result.updateExtension?.extension?.isInstalled ?? (variables.action !== "uninstall");
      setStatusMessage({
        kind: "success",
        title:
          variables.action === "update"
            ? "Extension updated"
            : isInstalled
              ? "Extension installed"
              : "Extension uninstalled",
        detail:
          variables.action === "update"
            ? `${variables.name} has been updated to the latest version.`
            : `${variables.name} ${isInstalled ? "is available in Browse." : "was removed from this Suwayomi server."}`,
      });
      invalidateExtensionData();
    },
    onError: (error, variables) => {
      setStatusMessage({
        kind: "error",
        title:
          variables.action === "update"
            ? "Update failed"
            : variables.action === "install"
              ? "Install failed"
              : "Uninstall failed",
        detail: `${variables.name}: ${getErrorMessage(error)}`,
      });
    },
    onSettled: (_result, _error, variables) => {
      markExtensionBusy(variables.pkgName, false);
    },
  });

  const extensions = useMemo(() => {
    return data?.extensions?.nodes?.filter((n): n is NonNullable<typeof n> => n != null) || [];
  }, [data]);

  const extensionCounts = useMemo(() => {
    const hiddenByNsfw = extensions.filter((ext) => ext.isNsfw).length;
    const installed = extensions.filter((ext) => ext.isInstalled).length;
    const knownTotal = data?.extensions?.totalCount ?? extensions.length;

    return {
      visible: showNsfw ? extensions.length : extensions.length - hiddenByNsfw,
      hiddenByNsfw: showNsfw ? 0 : hiddenByNsfw,
      total: knownTotal,
      installed,
    };
  }, [data, extensions, showNsfw]);

  const languages = useMemo(() => {
    const langs = new Set<string>();
    extensions.forEach(ext => ext.lang && langs.add(ext.lang));
    return [ALL_LANG_FILTER, ...Array.from(langs).sort()];
  }, [extensions]);

  const filteredExtensions = useMemo(() => {
    return extensions.filter(ext => {
      if (!showNsfw && ext.isNsfw) return false;
      if (langFilter !== ALL_LANG_FILTER && ext.lang !== langFilter) return false;
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => refreshCatalog()}
                disabled={refreshingCatalog || !serverBaseUrl}
                aria-label="Refresh catalog"
                className="flex items-center gap-2 rounded-lg bg-yomi-jade px-3 py-1.5 text-sm font-semibold text-ink-950 hover:bg-yomi-jade/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshingCatalog ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Refresh catalog</span>
                <span className="sm:hidden">Refresh</span>
              </button>
              <Link
                to="/extensions/repos"
                aria-label="Open extension repositories"
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Repositories</span>
              </Link>
            </div>
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
                  <option key={lang} value={lang}>{lang === ALL_LANG_FILTER ? "All Languages" : lang.toUpperCase()}</option>
                ))}
              </select>
              <button
                onClick={() => setShowNsfw(!showNsfw)}
                aria-label={showNsfw ? "Hide 18+ extensions" : "Show 18+ extensions"}
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

          {!isLoading && !isError && extensions.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                {extensionCounts.visible.toLocaleString()} visible
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                {showNsfw
                  ? "18+ shown"
                  : `${extensionCounts.hiddenByNsfw.toLocaleString()} hidden by 18+ filter`}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                {extensionCounts.total.toLocaleString()} total
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                {extensionCounts.installed.toLocaleString()} installed
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {statusMessage && (
          <div
            role={statusMessage.kind === "error" ? "alert" : "status"}
            className={`mb-4 flex gap-3 rounded-xl border p-4 ${
              statusMessage.kind === "error"
                ? "border-red-500/25 bg-red-500/10 text-red-100"
                : "border-yomi-jade/25 bg-yomi-jade/10 text-yomi-jade"
            }`}
          >
            {statusMessage.kind === "error" ? (
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{statusMessage.title}</p>
              {statusMessage.detail && (
                <p className="mt-1 break-words text-sm text-slate-300">{statusMessage.detail}</p>
              )}
            </div>
          </div>
        )}

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
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-slate-400">
            <p>No extensions match your filters.</p>
            {!showNsfw && extensionCounts.hiddenByNsfw > 0 && (
              <p className="text-sm">
                {extensionCounts.hiddenByNsfw.toLocaleString()} extensions are hidden by the 18+ filter.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredExtensions.map(ext => {
              const isCardBusy = activeExtensionPkgs.has(ext.pkgName);

              return (
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
                      {ext.isInstalled && ext.hasUpdate && (
                        <span className="rounded bg-yomi-jade/10 px-1 py-0.5 text-[9px] font-bold text-yomi-jade">Update Available</span>
                      )}
                    </div>
                  </div>
                  {ext.isInstalled && ext.hasUpdate && (
                    <button
                      onClick={() => toggleInstall({ pkgName: ext.pkgName, name: ext.name, action: "update" })}
                      disabled={isCardBusy}
                      className="flex h-8 px-2.5 items-center justify-center gap-1 rounded-lg bg-yomi-jade/10 border border-yomi-jade/30 text-yomi-jade hover:bg-yomi-jade/20 text-xs font-semibold transition flex-shrink-0 disabled:opacity-60"
                      title="Update Extension"
                    >
                      {isCardBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      <span>Update</span>
                    </button>
                  )}
                  <button
                    onClick={() => toggleInstall({ 
                      pkgName: ext.pkgName, 
                      name: ext.name, 
                      action: ext.isInstalled ? "uninstall" : "install" 
                    })}
                    disabled={isCardBusy}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition flex-shrink-0 ${
                      ext.isInstalled
                        ? "text-red-400 hover:bg-red-400/10"
                        : "bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    title={ext.isInstalled ? "Uninstall" : "Install"}
                    aria-label={ext.isInstalled ? `Uninstall ${ext.name}` : `Install ${ext.name}`}
                  >
                    {isCardBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : ext.isInstalled ? <Trash2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
