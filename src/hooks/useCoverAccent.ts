import { useSettingsStore } from "../stores/useSettingsStore";

function rgbToAccentString(r: number, g: number, b: number): string {
  return `${r}, ${g}, ${b}`;
}

/** Sample thumbnail colors and apply as dynamic accent when enabled. */
export function applyCoverAccentFromImage(
  imageUrl: string,
  enabled: boolean
): void {
  if (!enabled || !imageUrl) return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      const size = 32;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 40) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
      if (count === 0) return;
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      document.documentElement.style.setProperty(
        "--yomi-accent",
        rgbToAccentString(r, g, b)
      );
    } catch {
      // CORS or canvas taint — keep user accent
    }
  };
  img.src = imageUrl;
}

export function useCoverAccentEnabled(): boolean {
  return useSettingsStore((s) => s.coverDynamicTheme);
}