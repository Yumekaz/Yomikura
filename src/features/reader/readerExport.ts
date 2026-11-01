import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import { progressBackend, type ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { getOwnedCachedPage } from "../../api/suwayomi/offlineCache";
import { validatePageBlob } from "../../api/suwayomi/validatePageBlob";
export function safeExportName(value: string, maxBytes = 100) {
  let clean = value.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "") || "Yomikura";
  if (/^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM\d|LPT\d)(?:\.|$)/i.test(clean)) clean = `_${clean}`;
  const encoder = new TextEncoder(); let output = "";
  for (const character of clean) { if (encoder.encode(output + character).length > maxBytes) break; output += character; }
  return output.replace(/[. ]+$/, "") || "Yomikura";
}
export function assertExportBackend(backend: ProgressBackend, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
  const settings = useSettingsStore.getState();
  if (progressBackend(settings.serverBaseUrl, settings.mockMode).key !== backend.key) throw new Error("Your selected library changed. Open the export again.");
}
export async function readExportPage(source: string, backend: ProgressBackend, signal: AbortSignal): Promise<Blob> {
  assertExportBackend(backend, signal);
  const cached = await getOwnedCachedPage(source, backend.serverBaseUrl, backend.isDemo).catch(() => undefined);
  let blob: Blob;
  if (cached) blob = await cached.blob();
  else if (isTauri() && !backend.isDemo) {
    const { invoke } = await import("@tauri-apps/api/core"), page = await invoke<{ bytes: number[]; contentType: string }>("fetch_local_page", { url: source, serverBaseUrl: backend.serverBaseUrl });
    blob = new Blob([new Uint8Array(page.bytes)], { type: page.contentType });
  } else {
    const response = await fetch(source, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    if (!response.ok) throw new Error("The page is unavailable. Nothing was exported.");
    blob = await response.blob();
  }
  assertExportBackend(backend, signal); await validatePageBlob(blob, signal);
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer()), text = new TextDecoder("latin1").decode(head);
  const mime = head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg" : head[0] === 0x89 && text.slice(1, 4) === "PNG" ? "image/png" : text.startsWith("GIF8") ? "image/gif" : text.startsWith("RIFF") && text.slice(8, 12) === "WEBP" ? "image/webp" : text.slice(4, 8) === "ftyp" && /avi[fs]/.test(text.slice(8, 12)) ? "image/avif" : blob.type;
  return mime === blob.type ? blob : new Blob([blob], { type: mime });
}
export async function nativeExport(blob: Blob, name: string, title: string | null, archive: boolean, backend: ProgressBackend, signal: AbortSignal): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api/core");
  let directory = await invoke<string | null>("get_reader_export_directory").catch(() => null);
  if (!directory) directory = await invoke<string | null>("select_reader_export_directory");
  if (!directory) return false;
  assertExportBackend(backend, signal);
  // Binary IPC avoids expanding a whole chapter into a huge JSON number array.
  const metadata = JSON.stringify({ name, title, archive }).replace(/[\u007f-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const bytes = new Uint8Array(await blob.arrayBuffer()); assertExportBackend(backend, signal);
  const result = await invoke<{ saved: string[]; error: string | null }>("save_reader_export", bytes, { headers: { "x-yomikura-export": metadata } });
  if (result.error || result.saved.length !== 1) throw new Error(result.error || "The exported file was not confirmed.");
  return true;
}
export function downloadExport(blob: Blob, name: string) {
  const source = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = source; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(source), 30000);
}
export async function rasterizeNativeSvg(blob: Blob): Promise<Blob> {
  if (blob.type.split(";")[0] !== "image/svg+xml") return blob;
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error("This vector page is too large to convert for native export.");
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    try { const context = canvas.getContext("2d"); if (!context) throw new Error("The page could not be converted."); context.drawImage(image, 0, 0); return await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The page could not be converted.")), "image/png")); }
    finally { canvas.width = 0; canvas.height = 0; }
  } finally { URL.revokeObjectURL(url); }
}
