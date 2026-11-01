export type TallImageTile = { blob: Blob; height: number };
export function tallTileRanges(width: number, height: number, preferredHeight = 4096) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 16384 || height > 1_000_000 || !Number.isFinite(preferredHeight) || preferredHeight < 1) return [];
  const maxHeight = Math.max(1, Math.min(preferredHeight, Math.floor(4_000_000 / width)));
  if (height <= width * 3 || height <= maxHeight) return [];
  const count = Math.ceil(height / maxHeight), size = Math.ceil(height / count);
  return Array.from({ length: count }, (_, index) => ({ top: index * size, height: Math.min(size, height - index * size) })).filter((range) => range.height > 0);
}
/** Optional, lossless device optimization. The original always stays available. */
export async function splitTallImage(blob: Blob, signal: AbortSignal): Promise<{ width: number; height: number; tiles: TallImageTile[] } | undefined> {
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  if (typeof createImageBitmap !== "function" || !/image\/(png|jpeg|webp)(?:;|$)/i.test(blob.type)) return;
  const sample = new Uint8Array(await blob.slice(0, 65536).arrayBuffer()), text = new TextDecoder("latin1").decode(sample);
  // Never turn animation into a frozen frame (APNG/WebP; GIF/AVIF are excluded above).
  if (text.includes("acTL") || text.includes("ANIM") || text.slice(12, 16) === "VP8X" && (sample[20] & 2) !== 0) return;
  let image: ImageBitmap | undefined;
  const canvas = document.createElement("canvas");
  try {
    image = await createImageBitmap(blob); if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
    const ranges = tallTileRanges(image.width, image.height); if (!ranges.length) return;
    const context = canvas.getContext("2d"); if (!context) return;
    const tiles: TallImageTile[] = []; let size = 0;
    for (const range of ranges) {
      if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
      canvas.width = image.width; canvas.height = range.height;
      context.drawImage(image, 0, range.top, image.width, range.height, 0, 0, image.width, range.height);
      const tile = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!tile || !tile.size || (size += tile.size) > 32 * 1024 * 1024) return;
      tiles.push({ blob: tile, height: range.height });
    }
    return { width: image.width, height: image.height, tiles };
  } catch (error) { if (signal.aborted) throw error; return; }
  finally { image?.close(); canvas.width = 0; canvas.height = 0; }
}
