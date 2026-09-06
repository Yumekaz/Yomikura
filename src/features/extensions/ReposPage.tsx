import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Trash2, Github, AlertCircle } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { useFeedback } from "../../components/ui/FeedbackProvider";

// Suwayomi 2.3 migrates the old repository setting to Mihon's extension-store
// format. The minified legacy index now contains only compatibility notices.
const KEIYOUSHI_URL = "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json";

export default function ReposPage() {
  const { confirm } = useFeedback();
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [repoUrl, setRepoUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

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
      const result = await sdk.FetchExtensionCatalog({ input: {} });
      return result.fetchExtensions?.extensions?.length ?? 0;
    },
    onSuccess: (syncedCount) => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      queryClient.invalidateQueries({ queryKey: ["extensions"] });
      setRepoUrl("");
      setStatusMessage(syncedCount > 0
        ? { kind: "success", text: `Repository saved. Suwayomi discovered ${syncedCount.toLocaleString()} extensions.` }
        : { kind: "error", text: "Repository saved, but Suwayomi returned no extensions. Check the server logs for certificate, network, or repository-format errors, then retry the catalogue refresh." });
    },
    onError: (error) => {
      setStatusMessage({ kind: "error", text: `Could not save this repository: ${error instanceof Error ? error.message : String(error)}` });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || repos.includes(repoUrl.trim())) return;
    updateRepos([...repos, repoUrl.trim()]);
  };

  const handleRemove = async (urlToRemove: string) => {
    if (!(await confirm({ title: "Remove extension repository?", detail: "The catalogue will no longer receive extensions from this address. Installed extensions remain available.", confirmLabel: "Remove repository", danger: true }))) return;
    updateRepos(repos.filter(url => url !== urlToRemove));
  };

  return (
    <div className="min-h-screen bg-transparent pb-24">
      <div className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/95 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link to="/extensions" className="yomi-utility-button">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div><span className="yomi-eyebrow">Extensions</span><h1 className="yomi-workspace-title mt-1">Repositories</h1></div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 sm:p-10 space-y-8">
        <div className="yomi-commandbar flex-col items-start gap-2">
          <span className="yomi-eyebrow">First-time setup</span>
          <h2 className="text-xl font-semibold text-slate-100">Choose where Yomikura discovers sources</h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">Yomikura does not bundle third-party manga sources. Add a trusted extension repository below, then return to Extensions to install the sources you want.</p>
        </div>
        {statusMessage && <div role={statusMessage.kind === "error" ? "alert" : "status"} className={`yomi-alert ${statusMessage.kind === "error" ? "border-red-500/25 bg-red-500/10 text-red-100" : "border-yomi-jade/25 bg-yomi-jade/10 text-yomi-jade"}`}>
          {statusMessage.kind === "error" ? <AlertCircle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>}
        {/* Preset Button */}
        {!repos.includes(KEIYOUSHI_URL) && (
          <div className="yomi-commandbar p-5 flex-col sm:flex-row">
            <div>
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                <Github className="h-5 w-5 text-[rgb(var(--yomi-signature))]" />
                Keiyoushi Repository
              </h3>
              <p className="text-sm text-slate-400 mt-1">The unofficial community-maintained extension repository for Mihon/Suwayomi.</p>
            </div>
            <button
              onClick={() => updateRepos([...repos, KEIYOUSHI_URL])}
              disabled={updating}
              className="yomi-button yomi-button-primary whitespace-nowrap disabled:opacity-50"
            >
              Use this repository
            </button>
          </div>
        )}

        {/* Add Form */}
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            aria-label="Extension repository URL"
            placeholder="https://example.com/index.json"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            required
            className="yomi-field flex-1"
          />
          <button
            type="submit"
            disabled={updating || !repoUrl.trim()}
            className="yomi-button yomi-button-secondary px-6 disabled:opacity-50"
          >
            {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </form>

        {/* Repo List */}
        <div className="space-y-4">
          <h2 className="yomi-section-label">Installed repositories</h2>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-yomi-jade" />
            </div>
          ) : repos.length === 0 ? (
            <div className="yomi-route-empty"><div><Github /><h2>No repositories yet</h2><p>Add the recommended community repository above or enter a trusted repository URL.</p></div></div>
          ) : (
            <div className="yomi-surface">
              {repos.map(url => (
                <div key={url} className="flex items-center justify-between gap-4 px-4 py-4 border-b border-white/5 last:border-0">
                  <span className="truncate text-sm text-slate-300 font-mono">{url}</span>
                  <button
                    onClick={() => handleRemove(url)}
                    disabled={updating}
                    className="yomi-utility-button danger"
                    title="Remove Repository"
                    aria-label={`Remove repository ${url}`}
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
