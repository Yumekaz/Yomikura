export type ArchivePage = { name: string; blob: Blob };
const table = Uint32Array.from({ length: 256 }, (_, index) => { let crc = index; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1; return crc >>> 0; });
export function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; }
/** Stored ZIP entries preserve already-compressed source images without another codec. */
export async function createPageArchive(pages: ArchivePage[], signal: AbortSignal): Promise<Blob> {
  if (!pages.length || pages.length > 2000) throw new Error("Choose between 1 and 2,000 pages to export.");
  const names = new Set<string>(); let size = 0;
  for (const page of pages) {
    if (!page.name || /[\\/\u0000-\u001f]/.test(page.name) || names.has(page.name.toLowerCase())) throw new Error("Archive page names must be unique and cannot contain paths.");
    names.add(page.name.toLowerCase()); size += page.blob.size;
  }
  if (size > 128 * 1024 * 1024) throw new Error("This chapter exceeds the 128 MB export limit. Save individual pages instead.");
  const body: BlobPart[] = [], central: BlobPart[] = []; let offset = 0, centralSize = 0;
  for (const page of pages) {
    if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
    const bytes = await page.blob.arrayBuffer(), checksum = crc32(new Uint8Array(bytes)), name = new TextEncoder().encode(page.name);
    const local = new Uint8Array(30 + name.length), header = new DataView(local.buffer);
    header.setUint32(0, 0x04034b50, true); header.setUint16(4, 20, true); header.setUint16(6, 0x800, true); header.setUint16(12, 33, true);
    header.setUint32(14, checksum, true); header.setUint32(18, bytes.byteLength, true); header.setUint32(22, bytes.byteLength, true); header.setUint16(26, name.length, true); local.set(name, 30);
    const entry = new Uint8Array(46 + name.length), directory = new DataView(entry.buffer);
    directory.setUint32(0, 0x02014b50, true); directory.setUint16(4, 20, true); directory.setUint16(6, 20, true); directory.setUint16(8, 0x800, true); directory.setUint16(14, 33, true);
    directory.setUint32(16, checksum, true); directory.setUint32(20, bytes.byteLength, true); directory.setUint32(24, bytes.byteLength, true); directory.setUint16(28, name.length, true); directory.setUint32(42, offset, true); entry.set(name, 46);
    body.push(local.buffer, bytes); central.push(entry.buffer); offset += local.length + bytes.byteLength; centralSize += entry.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
  const end = new ArrayBuffer(22), footer = new DataView(end);
  footer.setUint32(0, 0x06054b50, true); footer.setUint16(8, pages.length, true); footer.setUint16(10, pages.length, true); footer.setUint32(12, centralSize, true); footer.setUint32(16, offset, true);
  return new Blob([...body, ...central, end], { type: "application/vnd.comicbook+zip" });
}
