// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyPalette, legacyPalette, PALETTES, paletteFor } from "./palettes";

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
describe("complete color palettes", () => {
  for (const palette of PALETTES) for (const mode of ["dark", "light"] as const) {
    it(`${palette.name} ${mode} keeps small text and primary actions readable`, () => {
      const tokens = palette[mode];
      expect(contrast(tokens.action, tokens.actionText)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.strong, tokens.surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(tokens.muted, tokens.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.accent, tokens.surface)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("switches an entire palette without retaining tokens from the previous one", () => {
    const root = document.createElement("div");
    applyPalette(root, "sakura", true);
    applyPalette(root, "forest", false);
    expect(root.dataset.palette).toBe("forest");
    expect(root.style.getPropertyValue("--ink-950")).toBe(paletteFor("forest").light.canvas);
    expect(root.style.getPropertyValue("--action-bg")).toBe(paletteFor("forest").light.action);
    expect(root.style.getPropertyValue("--text-muted")).toBe(paletteFor("forest").light.muted);
  });
  it("retains older personal color choices and safely handles unknown palettes", () => {
    expect(legacyPalette("mint")).toBe("forest");
    expect(legacyPalette("plum")).toBe("moonstone");
    expect(legacyPalette("coral")).toBe("sakura");
    expect(paletteFor("unknown").id).toBe("ember");
  });
});
