import { parseNoteExport, type NoteExport } from "../../features/manga/noteExportFormat";
import { parseRecoveryPreferences, type RecoveryPreferences } from "../../stores/recoveryPreferences";
import type { ChapterProgressIdentity } from "./backendIdentity";
import { validLibraryMarker } from "./libraryIdentity";
import type { ProgressPatch } from "./progressStorage";

const magic = new TextEncoder().encode("YOMIKURA-RECOVERY-1\n");
const headerBytes = magic.length + 4 + 32;
const maxManifestBytes = 16 * 1024 * 1024;
export const MAX_RECOVERY_BYTES = 2 * 1024 * 1024 * 1024;
const maxPageBytes = 80 * 1024 * 1024;
const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/bmp", "image/jxl"];

export type RecoveryPage = { size: number; type: string; digest: string };
export type RecoveryChapter = ChapterProgressIdentity & { sourceOrder: number; pages: RecoveryPage[]; lastPageRead: number; isRead: boolean };
export type RecoveryProgress = { chapter: ChapterProgressIdentity; patch: Partial<ProgressPatch> };
export type RecoveryBookKey = { id: number; sourceId: string; url: string };
export type RecoveryKeys = { books: RecoveryBookKey[]; chapters: { id: number; url: string }[] };
export type RecoveryManifest = {
  id: string;
  createdAt: string;
  libraryId: string | null;
  preferences: RecoveryPreferences;
  notes: NoteExport["notes"];
  progress: RecoveryProgress[];
  chapters: RecoveryChapter[];
  sourceKeys?: RecoveryKeys;
};

function invalid(): never { throw new Error("This recovery file has invalid or unsupported contents."); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, length: number) {
  if (typeof value !== "string" || !value.trim() || value.length > length) return invalid();
  return value;
}
function integer(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return invalid();
  return value;
}
function items(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return invalid();
  return value;
}
function chapterIdentity(value: unknown): ChapterProgressIdentity {
  const data = object(value);
  if (typeof data.chapterNumber !== "number" || !Number.isFinite(data.chapterNumber)) return invalid();
  return {
    chapterId: integer(data.chapterId, 1, 2147483647), chapterName: text(data.chapterName, 2000), chapterNumber: data.chapterNumber,
    mangaId: integer(data.mangaId, 1, 2147483647), mangaTitle: text(data.mangaTitle, 2000),
    sourceOrder: data.sourceOrder === undefined ? undefined : integer(data.sourceOrder, 0, 2147483647),
    pageCount: integer(data.pageCount, 0, 20000),
  };
}
function progressPatch(value: unknown): Partial<ProgressPatch> {
  const data = object(value);
  const patch: Partial<ProgressPatch> = {};
  if (data.lastPageRead !== undefined) patch.lastPageRead = integer(data.lastPageRead, 0, 20000);
  for (const key of ["isRead", "isBookmarked"] as const) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== "boolean") return invalid();
    patch[key] = data[key];
  }
  if (!Object.keys(patch).length) return invalid();
  return patch;
}

function sourceKeys(value: unknown): RecoveryKeys {
  const data = object(value);
  const recordKey = (item: unknown) => {
    const row = object(item);
    return { id: integer(row.id, 1, 2147483647), url: text(row.url, 4096) };
  };
  const books = items(data.books, 30000).map((item) => {
    const sourceId = text(object(item).sourceId, 21);
    if (!/^-?\d+$/.test(sourceId)) return invalid();
    return { ...recordKey(item), sourceId };
  });
  const chapters = items(data.chapters, 20000).map(recordKey);
  if (new Set(books.map(({ id }) => id)).size !== books.length || new Set(chapters.map(({ id }) => id)).size !== chapters.length) return invalid();
  return { books, chapters };
}
function parseManifest(value: unknown): RecoveryManifest {
  const raw = object(value);
  if (!validLibraryMarker(raw.id) || raw.libraryId !== null && !validLibraryMarker(raw.libraryId)) return invalid();
  const createdAt = text(raw.createdAt, 30);
  if (!Number.isFinite(Date.parse(createdAt))) return invalid();
  const preferences = parseRecoveryPreferences(object(raw.preferences));
  const notes = parseNoteExport(JSON.stringify({ format: "yomikura-notes", version: 1, notes: raw.notes })).notes;
  const progress = items(raw.progress, 10000).map((item) => {
    const data = object(item);
    return { chapter: chapterIdentity(data.chapter), patch: progressPatch(data.patch) };
  });
  const chapters = items(raw.chapters, 10000).map((item): RecoveryChapter => {
    const data = object(item);
    const chapter = chapterIdentity(data);
    const sourceOrder = integer(data.sourceOrder, 0, 2147483647);
    const pages = items(data.pages, 20000).map((item) => {
      const page = object(item);
      if (typeof page.type !== "string" || !imageTypes.includes(page.type) || typeof page.digest !== "string" || !/^[0-9a-f]{64}$/.test(page.digest)) return invalid();
      return { type: page.type, digest: page.digest, size: integer(page.size, 1, maxPageBytes) };
    });
    if (!pages.length || pages.length !== chapter.pageCount || typeof data.isRead !== "boolean") return invalid();
    return { ...chapter, sourceOrder, pages, lastPageRead: integer(data.lastPageRead, 0, pages.length - 1), isRead: data.isRead };
  });
  if ((!raw.libraryId && notes.length + progress.length + chapters.length) ||
      new Set(progress.map(({ chapter }) => chapter.chapterId)).size !== progress.length ||
      new Set(chapters.map(({ chapterId }) => chapterId)).size !== chapters.length) return invalid();
  const keys = raw.sourceKeys === undefined ? undefined : sourceKeys(raw.sourceKeys);
  if (keys && !raw.libraryId) return invalid();
  return { id: raw.id, createdAt, libraryId: raw.libraryId, preferences, notes, progress, chapters, sourceKeys: keys };
}

async function sha256(data: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) throw new Error("Recovery files require a secure browser connection or the desktop app.");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}
function hex(bytes: Uint8Array) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }

export async function describeRecoveryPage(blob: Blob): Promise<RecoveryPage> {
  if (blob.size < 1 || blob.size > maxPageBytes) throw new Error("A saved page is empty or exceeds the recovery file's page limit.");
  const type = blob.type === "image/jpg" ? "image/jpeg" : blob.type;
  if (!imageTypes.includes(type)) throw new Error("A saved page uses an unsupported image type. Export recovery without downloaded chapters to keep your device records.");
  return { type, size: blob.size, digest: hex(await sha256(await blob.arrayBuffer())) };
}

export async function createRecoveryFile(manifest: RecoveryManifest, pageBlobs: Blob[]) {
  const cleaned = parseManifest(manifest);
  const pageIndex = cleaned.chapters.flatMap((chapter) => chapter.pages);
  if (pageIndex.length !== pageBlobs.length || pageIndex.some((page, index) => page.size !== pageBlobs[index].size)) return invalid();
  const encoded = new TextEncoder().encode(JSON.stringify(cleaned));
  if (encoded.byteLength > maxManifestBytes) throw new Error("The recovery file has too many records.");
  const header = new Uint8Array(headerBytes);
  header.set(magic);
  new DataView(header.buffer).setUint32(magic.length, encoded.byteLength);
  header.set(await sha256(new Uint8Array(encoded).buffer), magic.length + 4);
  const archive = new Blob([header, encoded, ...pageBlobs], { type: "application/octet-stream" });
  if (archive.size > MAX_RECOVERY_BYTES) throw new Error("The recovery file exceeds 2 GB. Export recovery without downloaded chapters to keep your device records.");
  return archive;
}

export async function openRecoveryFile(file: Blob) {
  if (file.size < headerBytes || file.size > MAX_RECOVERY_BYTES) return invalid();
  const header = await file.slice(0, headerBytes).arrayBuffer();
  const bytes = new Uint8Array(header);
  if (!magic.every((byte, index) => bytes[index] === byte)) return invalid();
  const length = new DataView(header).getUint32(magic.length);
  if (!length || length > maxManifestBytes || headerBytes + length > file.size) return invalid();
  const encoded = await file.slice(headerBytes, headerBytes + length).arrayBuffer();
  if (hex(await sha256(encoded)) !== hex(bytes.subarray(magic.length + 4))) throw new Error("The recovery file failed its integrity check.");
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(encoded)); }
  catch { return invalid(); }
  const manifest = parseManifest(decoded);
  let offset = headerBytes + length;
  const pages = manifest.chapters.map((chapter) => chapter.pages.map((page) => {
    const body = file.slice(offset, offset + page.size, page.type);
    offset += page.size;
    return { ...page, body };
  }));
  if (offset !== file.size) throw new Error("The recovery file is incomplete or contains unexpected data.");
  return { manifest, pages };
}

export async function verifyRecoveryPage(page: RecoveryPage & { body: Blob }) {
  if (page.body.size !== page.size || hex(await sha256(await page.body.arrayBuffer())) !== page.digest) {
    throw new Error("A saved page failed its integrity check.");
  }
}
