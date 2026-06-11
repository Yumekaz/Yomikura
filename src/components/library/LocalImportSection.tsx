import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, FileArchive, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore, isTauri } from "../../stores/useSettingsStore";
import { getErrorMessage } from "../../api/suwayomi/errors";

export function LocalImportSection() {
  const { serverBaseUrl } = useSettingsStore();
  const [mangaTitle, setMangaTitle] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Query: Fetch server-side local source path settings
  const { data: settingsData, isLoading: loadingSettings } = useQuery({
    queryKey: ["server-settings", serverBaseUrl],
    queryFn: () => sdk.GetServerSettings(),
    enabled: !!serverBaseUrl,
  });

  const localSourcePath = settingsData?.settings?.localSourcePath || "";

  const applyFiles = (files: File[]) => {
    const archives = files.filter((f) => /\.(cbz|cbr|pdf)$/i.test(f.name));
    if (archives.length === 0) return;
    setSelectedFiles(archives);
    if (archives[0] && !mangaTitle) {
      const name = archives[0].name;
      const titleCandidate = name
        .replace(/\.(cbz|cbr|pdf)$/i, "")
        .replace(/[-_]ch(apter)?\s*\d+/i, "")
        .replace(/[-_]c\d+/i, "")
        .replace(/\[.*?\]/g, "")
        .replace(/\(.*?\)/g, "")
        .trim();
      setMangaTitle(titleCandidate || "Imported Manga");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      applyFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) {
      applyFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mangaTitle.trim() || selectedFiles.length === 0) return;

    setStatus("importing");
    setFeedbackMessage("");

    if (!isTauri()) {
      // Browser PWA mode: fall back to manual instructions since browser sandbox cannot write files
      setStatus("error");
      setFeedbackMessage("Browser sandbox prevents direct file exports. Please place your files manually.");
      return;
    }

    try {
      const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");

      // Build target directory path
      const cleanLocalPath = localSourcePath.replace(/\\/g, "/").replace(/\/$/, "");
      const cleanTitle = mangaTitle.trim().replace(/[\/\\?%*:|"<>.#]/g, "_"); // sanitize folder name
      const targetMangaDir = `${cleanLocalPath}/${cleanTitle}`;

      // 1. Create the manga folder
      await mkdir(targetMangaDir, { recursive: true });

      // 2. Read and write each file in batches/sequence
      for (const file of selectedFiles) {
        const fileBuffer = await file.arrayBuffer();
        const cleanFileName = file.name.replace(/[\/\\?%*:|"<>.#]/g, "_");
        // Preserve extension
        const ext = file.name.split(".").pop();
        const finalFileName = ext ? `${cleanFileName.slice(0, -(ext.length + 1))}.${ext}` : cleanFileName;
        const targetFilePath = `${targetMangaDir}/${finalFileName}`;

        await writeFile(targetFilePath, new Uint8Array(fileBuffer));
      }

      setStatus("success");
      setFeedbackMessage(`Successfully imported ${selectedFiles.length} files into "${mangaTitle}"! Go to Browse -> Sources -> Local Source to read.`);
      setSelectedFiles([]);
      setMangaTitle("");
    } catch (err: any) {
      console.error("Local import failed:", err);
      setStatus("error");
      setFeedbackMessage(
        `Failed to import files: ${err.message || String(err)}. You may need to copy them manually.`
      );
    }
  };

  return (
    <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-yomi-jade" />
        Local CBZ / CBR / PDF Import
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Import your local manga archive files directly into Yomikura's Local Source.
      </p>

      {localSourcePath ? (
        <div className="mt-4 p-3 rounded-lg bg-ink-950/40 border border-white/5 text-[11px] text-slate-400 font-mono break-all flex flex-col gap-1">
          <span className="font-bold text-slate-300">Server Local Directory:</span>
          <span>{localSourcePath}</span>
        </div>
      ) : loadingSettings ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-yomi-jade" />
          Fetching server paths...
        </div>
      ) : null}

      <form onSubmit={handleImport} className="mt-6 space-y-4 max-w-xl">
        <div>
          <label className="block px-1 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Manga Title
          </label>
          <input
            type="text"
            required
            placeholder="e.g. My Favorite Manga"
            value={mangaTitle}
            onChange={(e) => setMangaTitle(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-yomi-jade/55 transition"
            disabled={status === "importing"}
          />
        </div>

        <div>
          <label className="block px-1 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Select Archive Files
          </label>
          <div
            className="relative border border-dashed border-white/10 rounded-xl hover:border-yomi-jade/50 bg-ink-950/20 p-6 transition flex flex-col items-center justify-center text-center cursor-pointer"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              accept=".cbz,.cbr,.pdf"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={status === "importing"}
            />
            <FileArchive className="h-8 w-8 text-slate-500 mb-2" />
            <span className="text-xs font-semibold text-slate-300">
              {selectedFiles.length > 0
                ? `${selectedFiles.length} files selected`
                : "Drag & drop files or click to browse"}
            </span>
            <span className="text-[10px] text-slate-500 mt-1">
              Supports .cbz, .cbr, and .pdf formats
            </span>
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-2 max-h-24 overflow-y-auto px-1 space-y-1 scrollbar-thin">
              {selectedFiles.map((f, i) => (
                <div key={i} className="text-[10px] text-slate-400 truncate">
                  • {f.name} ({(f.size / (1024 * 1024)).toFixed(2)} MB)
                </div>
              ))}
            </div>
          )}
        </div>

        {status === "success" && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400 flex items-start gap-2 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 flex flex-col gap-2 animate-fade-in">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{feedbackMessage}</span>
            </div>
            {!isTauri() && localSourcePath && (
              <div className="mt-1 p-2 rounded bg-black/40 border border-white/5 text-[10px] text-slate-300 space-y-1">
                <p className="font-bold text-slate-200">How to import in Browser/PWA Mode:</p>
                <p>1. Copy the selected files on your computer.</p>
                <p>2. Create a folder named <code className="bg-white/5 px-1 py-0.5 rounded text-yomi-mint">"{mangaTitle || "Manga Title"}"</code> inside:</p>
                <p className="font-mono bg-black/20 p-1.5 rounded select-all break-all">{localSourcePath}</p>
                <p>3. Paste your CBZ/CBR/PDF files directly inside that folder.</p>
                <p>4. Open <span className="font-semibold text-yomi-jade">Browse &rarr; Sources &rarr; Local Source</span> in Yomikura to read!</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={status === "importing" || selectedFiles.length === 0 || !mangaTitle.trim()}
            className="rounded-xl bg-yomi-jade text-ink-950 hover:bg-yomi-jade/90 font-bold px-5 py-2 text-xs transition disabled:opacity-40 shadow-md flex items-center gap-1.5"
          >
            {status === "importing" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                Import to Local Source
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
