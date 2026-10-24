import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Upload, Loader2 } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore, isTauri } from "../../stores/useSettingsStore";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { validateImportSelection } from "./importValidation";

export function LocalImportSection() {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const current = useRef(backend.key); current.current = backend.key;
  const [mangaTitle, setMangaTitle] = useState(""); const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "importing" | "success" | "error">("idle"); const [message, setMessage] = useState("");
  useEffect(() => { setMangaTitle(""); setSelectedFiles([]); setStatus("idle"); setMessage(""); }, [backend.key]);
  const settings = useQuery({ queryKey: ["import-server-settings", backend.key], enabled: !mockMode,
    queryFn: ({ signal }) => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal }, "live").GetServerSettings() });
  const localSourcePath = settings.data?.settings?.localSourcePath ?? "";
  const destination = useQuery({ queryKey: ["managed-import-target", backend.key, localSourcePath], enabled: isTauri() && !mockMode && !!localSourcePath,
    queryFn: async () => { const { invoke } = await import("@tauri-apps/api/core"); return invoke<string | null>("get_local_import_target", { serverBaseUrl: backend.serverBaseUrl, reportedPath: localSourcePath }); }, retry: false });
  const applyFiles = (files: File[]) => {
    try { validateImportSelection(files); setSelectedFiles(files); setMessage(""); setStatus("idle");
      if (!mangaTitle) setMangaTitle(files[0].name.replace(/\.[^.]+$/, "").replace(/[-_]ch(?:apter)?\s*\d+/i, "").trim());
    } catch (error) { setSelectedFiles([]); setStatus("error"); setMessage(error instanceof Error ? error.message : "Archive selection is invalid."); }
  };
  const importFiles = async (event: React.FormEvent) => {
    event.preventDefault(); if (!destination.data || !mangaTitle.trim() || status === "importing") return;
    const captured = backend; const title = mangaTitle.trim(); const files = selectedFiles; const reportedPath = localSourcePath;
    setStatus("importing"); setMessage("");
    try {
      validateImportSelection(files);
      const archives = [];
      for (const file of files) {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        if (current.current !== captured.key) return;
        archives.push({ name: file.name, bytes });
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ imported: string[]; error: string | null }>("import_local_archives", { serverBaseUrl: captured.serverBaseUrl, reportedPath, title, archives });
      if (current.current !== captured.key) return;
      setSelectedFiles(files.filter((file) => !result.imported.includes(file.name)));
      setStatus(result.error ? "error" : "success");
      setMessage(result.error ? `${result.imported.length} archives copied and verified. ${result.error} Completed and partial copies are retained for inspection.` : `${result.imported.length} archives copied and verified. Open Browse → Sources → Local source to refresh the title.`);
      if (!result.error) setMangaTitle("");
    } catch (error) { if (current.current === captured.key) { setStatus("error"); setMessage(String(error instanceof Error ? error.message : error)); } }
  };
  if (mockMode) return <section className="yomi-surface p-6"><h2 className="text-lg font-semibold text-white">Local archive import</h2><p className="mt-2 text-sm text-slate-400">Connect a server to import your archives. The demo sandbox contains sample titles.</p></section>;
  return <section className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel" aria-labelledby="local-import-heading">
    <h2 id="local-import-heading" className="flex items-center gap-2 text-lg font-semibold text-white"><FolderOpen className="h-5 w-5 text-yomi-jade" />Local archive import</h2>
    <p className="mt-2 text-sm text-slate-400">Supported files: CBZ/ZIP, CBR/RAR and EPUB. PDF is not supported by this server. Original files are retained; existing files are never overwritten.</p>
    {settings.isLoading ? <p role="status" className="mt-4 text-sm text-slate-400">Checking the server's Local source directory…</p> : <div className="mt-4 rounded-lg border border-white/5 bg-ink-950/40 p-3 text-sm text-slate-300"><strong>Directory on the server</strong><p className="mt-1 break-all font-mono text-xs">{localSourcePath || "No directory could be confirmed. Configure Local source on the server and retry."}</p></div>}
    {destination.data ? <form onSubmit={importFiles} className="mt-5 max-w-xl space-y-4">
      <p className="text-sm text-slate-400">This app owns the running local engine and has verified its import directory. Up to 128 MiB per archive and 256 MiB per batch.</p>
      <label className="block text-sm text-slate-300">Manga title<input className="yomi-field mt-2 w-full" required value={mangaTitle} onChange={(event) => setMangaTitle(event.target.value)} disabled={status === "importing"} /></label>
      <label className="block text-sm text-slate-300">Archive files<input className="yomi-field mt-2 w-full" type="file" multiple accept=".cbz,.zip,.cbr,.rar,.epub" disabled={status === "importing"} onChange={(event) => applyFiles(Array.from(event.target.files ?? []))} /></label>
      {selectedFiles.length > 0 && <p className="text-xs text-slate-400">{selectedFiles.map((file) => file.name).join(", ")}</p>}
      <button type="submit" className="yomi-button yomi-button-primary" disabled={status === "importing" || !selectedFiles.length || !mangaTitle.trim()}>{status === "importing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{status === "importing" ? "Copying archives…" : "Import to Local source"}</button>
    </form> : <div className="mt-5 space-y-2 text-sm text-slate-300"><p>{isTauri() ? "Direct import is available only for this app's managed local engine and verified default Local directory." : "The web app cannot write to a server's filesystem."}</p><ol className="list-decimal space-y-2 pl-5"><li>On the computer running Suwayomi, open its Local source directory.</li><li>Create a folder for the manga title and copy supported chapter archives into it.</li><li>In Yomikura, open Browse → Sources → Local source and refresh.</li></ol><p className="text-xs text-slate-400">A remote server's directory belongs to that server; it is not a destination on this device.</p></div>}
    {(settings.isError || destination.isError) && <p role="alert" className="mt-4 text-sm text-amber-200">The import destination could not be verified. Direct import is disabled; check the server and its directory permissions.</p>}
    {message && <p role={status === "error" ? "alert" : "status"} className={`mt-4 text-sm ${status === "error" ? "text-amber-200" : "text-slate-200"}`}>{message}</p>}
    <button type="button" className="yomi-button yomi-button-secondary mt-4" disabled={status === "importing"} onClick={() => { void settings.refetch(); if (isTauri() && localSourcePath) void destination.refetch(); }}>Refresh import destination</button>
  </section>;
}
