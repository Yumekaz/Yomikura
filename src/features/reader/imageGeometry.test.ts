import { expect, it } from "vitest";
import { blankBorderBounds, clampPan, fullImageBounds, imageFrame, splitImageBounds } from "./imageGeometry";
it("detects actual blank borders without applying a fixed zoom to artwork at the edges", () => {
  const pixels = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  for (let y = 7; y < 91; y++) for (let x = 5; x < 93; x++) { const p = (y * 100 + x) * 4; pixels[p] = 90; pixels[p + 1] = 55; pixels[p + 2] = 20; }
  expect(blankBorderBounds(pixels, 100, 100)).toEqual({ x: 5, y: 7, width: 88, height: 84 });
  pixels.fill(90); expect(blankBorderBounds(pixels, 100, 100)).toEqual(fullImageBounds(100, 100));
});
it("bounds cropping of a completely blank page and keeps tiny images intact", () => {
  const pixels = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  const bounds = blankBorderBounds(pixels, 100, 100); expect(bounds.width).toBeGreaterThanOrEqual(60); expect(bounds.height).toBeGreaterThanOrEqual(60);
  expect(blankBorderBounds(new Uint8ClampedArray(16), 2, 2)).toEqual(fullImageBounds(2, 2));
});
it("fits a cropped rotated image and preserves both halves of a landscape spread", () => {
  const bounds = { x: 20, y: 30, width: 1200, height: 800 };
  const first = splitImageBounds(bounds, 0), second = splitImageBounds(bounds, 1);
  expect(first.x + first.width).toBe(second.x); expect(second.x + second.width).toBe(bounds.x + bounds.width);
  const frame = imageFrame(bounds, 600, 800, "FIT_SCREEN", 90);
  expect(frame.width).toBeCloseTo(800 * 2 / 3); expect(frame.height).toBe(800); expect(frame.scale).toBeCloseTo(2 / 3);
  expect(clampPan(900, 600, 600, 2)).toBe(300); expect(clampPan(-900, 600, 600, 2)).toBe(-300);
});
