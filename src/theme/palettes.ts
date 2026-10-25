export type PaletteId = "ember" | "sakura" | "forest" | "moonstone";
export type ThemeTokens = {
  canvas: string; surface: string; elevated: string; raised: string;
  strong: string; text: string; muted: string; accent: string;
  action: string; actionText: string; line: string;
};
export type Palette = { id: PaletteId; name: string; description: string; swatches: string[]; dark: ThemeTokens; light: ThemeTokens };

export const PALETTES: Palette[] = [
  {
    id: "ember", name: "Ink & Ember", description: "Lantern light, warm ink and a little autumn.", swatches: ["#171310", "#CA503B", "#F3E5CF", "#C9A16F"],
    dark: { canvas: "#110F0D", surface: "#1A1713", elevated: "#24201B", raised: "#332B23", strong: "#F5E9D7", text: "#D6C8B4", muted: "#B4A58F", accent: "#F09976", action: "#B63C2D", actionText: "#FFF8ED", line: "#9D8061" },
    light: { canvas: "#FBF7EE", surface: "#F3EBDD", elevated: "#EDE1CF", raised: "#E2D4BD", strong: "#30261F", text: "#514336", muted: "#6D5945", accent: "#913C2C", action: "#AD392B", actionText: "#FFF8ED", line: "#8E7051" },
  },
  {
    id: "sakura", name: "Sakura", description: "Blossom, soft paper and quiet rose.", swatches: ["#21171D", "#B8546D", "#F9E9E7", "#D5A6AD"],
    dark: { canvas: "#171114", surface: "#21181D", elevated: "#2C2027", raised: "#3A2A34", strong: "#FAEAF0", text: "#DCC4CE", muted: "#BCA3AE", accent: "#E5A0B5", action: "#A33D5A", actionText: "#FFF5F8", line: "#A27489" },
    light: { canvas: "#FDF7F7", surface: "#F6EBEE", elevated: "#EEDDE3", raised: "#E5CED8", strong: "#3A2530", text: "#624854", muted: "#7D5C6B", accent: "#9D3D5C", action: "#A23D5B", actionText: "#FFF5F8", line: "#A37E8B" },
  },
  {
    id: "forest", name: "Forest", description: "Moss, sage and sunlit pages.", swatches: ["#182019", "#536B45", "#EDF0DE", "#B4BE91"],
    dark: { canvas: "#111610", surface: "#192019", elevated: "#232E23", raised: "#303C2D", strong: "#EFF0DD", text: "#CCD4BD", muted: "#A5B297", accent: "#B1C796", action: "#466A3F", actionText: "#FAFDED", line: "#83976A" },
    light: { canvas: "#F8F9F0", surface: "#EDF0E0", elevated: "#E2E8D2", raised: "#D4DEC3", strong: "#293324", text: "#48563E", muted: "#5C694E", accent: "#47663B", action: "#3F6137", actionText: "#FAFDED", line: "#7E9167" },
  },
  {
    id: "moonstone", name: "Moonstone", description: "Evening ink and silver lavender.", swatches: ["#1D1F2B", "#69619E", "#EEEAF7", "#B9B3D9"],
    dark: { canvas: "#14141C", surface: "#1E1E2A", elevated: "#292838", raised: "#363449", strong: "#F1ECFA", text: "#CEC9E1", muted: "#ACA7C5", accent: "#BBB3EC", action: "#62539A", actionText: "#FCF8FF", line: "#8F83AF" },
    light: { canvas: "#F9F7FE", surface: "#F0ECF8", elevated: "#E5DFF1", raised: "#D9D1E9", strong: "#30283E", text: "#554968", muted: "#6E5F84", accent: "#66508E", action: "#61508B", actionText: "#FCF8FF", line: "#9381AC" },
  },
];

export function paletteFor(value: unknown): Palette {
  return PALETTES.find((palette) => palette.id === value) ?? PALETTES[0];
}
export function legacyPalette(accent: unknown): PaletteId {
  return accent === "mint" ? "forest" : accent === "plum" ? "moonstone" : accent === "coral" ? "sakura" : "ember";
}
export function rgb(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(", ");
}
export function applyPalette(element: HTMLElement, id: PaletteId, dark: boolean) {
  const palette = paletteFor(id);
  const tokens = dark ? palette.dark : palette.light;
  element.dataset.palette = palette.id;
  const properties: Record<string, string> = {
    "--ink-950": tokens.canvas, "--ink-900": tokens.surface, "--ink-850": tokens.elevated, "--ink-800": tokens.raised,
    "--surface-rgb": rgb(tokens.surface), "--text-strong": tokens.strong, "--text": tokens.text, "--text-muted": tokens.muted,
    "--yomi-accent": rgb(tokens.accent), "--yomi-signature": rgb(tokens.accent),
    "--action-bg": tokens.action, "--action-text": tokens.actionText,
    "--line": `rgba(${rgb(tokens.line)}, ${dark ? ".24" : ".23"})`,
    "--line-strong": `rgba(${rgb(tokens.line)}, ${dark ? ".43" : ".4"})`,
  };
  for (const [name, value] of Object.entries(properties)) element.style.setProperty(name, value);
  if (element.ownerDocument.documentElement === element) {
    element.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.canvas);
  }
}
