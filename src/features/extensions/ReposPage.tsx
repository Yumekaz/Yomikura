import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2, Github } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";

// Suwayomi 2.3 migrates the old repository setting to Mihon's extension-store
// format. The minified legacy index now contains only compatibility notices.
const KEIYOUSHI_URL = "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json";

export default function ReposPage() {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [repoUrl, setRepoUrl] = useState("");

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading } = useQuery({
    queryKey: ["repos", serverBaseUrl],
    queryFn: () => sdk.GetExtensionRepos(),
    enabled: !!serverBaseUrl,
  });

  const repos = data?.settings?.extensionRepos || [];

  const { mutate: updateRepos, isPending: updating } = useMutation({
    mutationFn: async (newRepos: string[]) => {
      // Set the repos in settings
      await sdk.SetExtensionRepos({
        input: {
          settings: {
            extensionRepos: newRepos
          }
        }
      });
      // Trigger a fetch so Suwayomi syncs the new catalog
      await sdk.FetchExtensionCatalog({ input: {} });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      queryClient.invalidateQueries({ queryKey: ["extensions"] });
      setRepoUrl("");
    }
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || repos.includes(repoUrl.trim())) return;
    updateRepos([...repos, repoUrl.trim()]);
  };

  const handleRemove = (urlToRemove: string) => {
    updateRepos(repos.filter(url => url !== urlToRemove));
  };

  return (
    <div className="min-h-screen bg-transparent pb-24">
      <div className="sticky top-0 z-20 bg-ink-950/40 backdrop-blur-xl border-b border-white/5 px-4 py-4 sm:px-6 mb-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link to="/extensions" className="rounded-full p-2 hover:bg-white/10 text-slate-300">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-white">Extension Repositories</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-8">
        {/* Preset Button */}
        {!repos.includes(KEIYOUSHI_URL) && (
          <div className="rounded-xl border border-yomi-jade/20 bg-yomi-jade/5 p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-yomi-jade flex items-center gap-2">
                <Github className="h-5 w-5" />
                Keiyoushi Repository
              </h3>
              <p className="text-sm text-slate-400 mt-1">The unofficial community-maintained extension repository for Mihon/Suwayomi.</p>
            </div>
            <button
              onClick={() => updateRepos([...repos, KEIYOUSHI_URL])}
              disabled={updating}
              className="whitespace-nowrap rounded-lg bg-yomi-jade px-4 py-2 font-medium text-ink-950 hover:bg-yomi-jade/90 disabled:opacity-50"
            >
              Add Preset
            </button>
          </div>
        )}

        {/* Add Form */}
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            placeholder="https://example.com/index.json"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            required
            className="flex-1 rounded-lg bg-ink-900 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yomi-jade/50 border border-white/5"
          />
          <button
            type="submit"
            disabled={updating || !repoUrl.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-white/10 px-6 py-2 font-medium text-white hover:bg-white/20 disabled:opacity-50"
          >
            {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </form>

        {/* Repo List */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Installed Repos</h2>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-yomi-jade" />
            </div>
          ) : repos.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-ink-900/50 p-8 text-center text-slate-400">
              No repositories added. Add the Keiyoushi repo above to discover extensions.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {repos.map(url => (
                <div key={url} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-ink-900 p-4">
                  <span className="truncate text-sm text-slate-300 font-mono">{url}</span>
                  <button
                    onClick={() => handleRemove(url)}
                    disabled={updating}
                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition"
                    title="Remove Repository"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
