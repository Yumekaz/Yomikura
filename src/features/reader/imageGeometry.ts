export interface CropBounds { x: number; y: number; width: number; height: number }
export const fullImageBounds = (width: number, height: number): CropBounds => ({ x: 0, y: 0, width, height });
/** Conservative edge detection: only uniform near-white/black strips, at most 20% per edge. */
export function blankBorderBounds(pixels: Uint8ClampedArray, width: number, height: number): CropBounds {
  const blank = (indices: number[]) => {
    let white = true, black = true;
    for (const index of indices) { const p = index * 4; if (pixels[p + 3] < 8) continue; white &&= pixels[p] >= 244 && pixels[p + 1] >= 244 && pixels[p + 2] >= 244; black &&= pixels[p] <= 10 && pixels[p + 1] <= 10 && pixels[p + 2] <= 10; if (!white && !black) return false; }
    return true;
  };
  if (width < 8 || height < 8 || pixels.length !== width * height * 4) return fullImageBounds(width, height);
  let top = 0, bottom = height, left = 0, right = width;
  const row = (y: number) => Array.from({ length: width }, (_, x) => y * width + x);
  while (top < height * .2 && blank(row(top))) top++;
  while (height - bottom < height * .2 && blank(row(bottom - 1))) bottom--;
  const column = (x: number) => Array.from({ length: bottom - top }, (_, y) => (y + top) * width + x);
  while (left < width * .2 && blank(column(left))) left++;
  while (width - right < width * .2 && blank(column(right - 1))) right--;
  if (right - left < width * .5 || bottom - top < height * .5) return fullImageBounds(width, height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function splitImageBounds(bounds: CropBounds, half: 0 | 1): CropBounds { return { ...bounds, x: bounds.x + bounds.width / 2 * half, width: bounds.width / 2 }; }
export function imageFrame(bounds: CropBounds, availableWidth: number, availableHeight: number, fit: "FIT_SCREEN" | "FIT_WIDTH" | "FIT_HEIGHT", rotation: number) {
  const rotated = Math.abs(rotation % 180) === 90;
  const width = rotated ? bounds.height : bounds.width, height = rotated ? bounds.width : bounds.height;
  const scale = fit === "FIT_WIDTH" ? availableWidth / width : fit === "FIT_HEIGHT" ? availableHeight / height : Math.min(availableWidth / width, availableHeight / height);
  return { width: width * scale, height: height * scale, cropWidth: bounds.width * scale, cropHeight: bounds.height * scale, scale };
}
export function clampPan(value: number, viewport: number, content: number, zoom: number) { const limit = Math.max(0, (content * zoom - viewport) / 2); return Math.max(-limit, Math.min(limit, value)); }
