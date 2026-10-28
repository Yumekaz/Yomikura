import { afterEach, describe, expect, it, vi } from "vitest";
import { splitTallImage, tallTileRanges } from "./tallImageTiles";
afterEach(() => vi.unstubAllGlobals());
describe("tall-page device tiles", () => {
  it("covers the image exactly with bounded, gapless strips and no extra backend page", () => {
    const ranges = tallTileRanges(1080, 20003); let end = 0;
    for (const range of ranges) { expect(range.top).toBe(end); expect(range.height * 1080).toBeLessThanOrEqual(4_000_000); end += range.height; }
    expect(end).toBe(20003); expect(ranges.length).toBeGreaterThan(1);
    expect(tallTileRanges(1000, 3000)).toEqual([]); expect(tallTileRanges(1000, 4000, 4096)).toEqual([]);
    expect(tallTileRanges(0, 20000)).toEqual([]); expect(tallTileRanges(1000, Infinity)).toEqual([]);
  });
  it("creates lossless PNG tiles and releases decoder/canvas resources", async () => {
    const image = { width: 400, height: 12000, close: vi.fn() }, drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob: (callback: (value: Blob) => void, mime: string) => callback(new Blob(["tile"], { type: mime })) };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => image)); vi.stubGlobal("document", { createElement: () => canvas });
    const result = await splitTallImage(new Blob(["original"], { type: "image/jpeg" }), new AbortController().signal);
    expect(result).toMatchObject({ width: 400, height: 12000 }); expect(result!.tiles).toHaveLength(3); expect(result!.tiles.every((tile) => tile.blob.type === "image/png")).toBe(true);
    expect(drawImage.mock.calls.map((call) => call[2])).toEqual([0, 4000, 8000]); expect(image.close).toHaveBeenCalledOnce(); expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
  it("preserves animated formats and falls back when region rendering is unavailable", async () => {
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    for (const [type, content] of [["image/gif", "GIF89a"], ["image/png", "PNG acTL animation"], ["image/webp", "RIFF WEBP ANIM animation"]]) expect(await splitTallImage(new Blob([content], { type }), new AbortController().signal)).toBeUndefined();
    expect(decode).not.toHaveBeenCalled();
    const image = { width: 400, height: 12000, close: vi.fn() }; decode.mockResolvedValue(image); vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    expect(await splitTallImage(new Blob(["original"], { type: "image/jpeg" }), new AbortController().signal)).toBeUndefined(); expect(image.close).toHaveBeenCalledOnce();
  });
});
