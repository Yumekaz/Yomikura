import { useSettingsStore } from "../stores/useSettingsStore";

function rgbToAccentString(r: number, g: number, b: number): string {
  return `${r}, ${g}, ${b}`;
}

/** A cover may tint its detail surface; it must not overwrite the user's theme. */
export function applyCoverAccentFromImage(
  imageUrl: string,
  enabled: boolean
): (() => void) | undefined {
  if (!enabled || !imageUrl) return;
  let active = true;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    if (!active) return;
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
        "--cover-accent",
        rgbToAccentString(r, g, b)
      );
    } catch {
      // CORS or canvas taint — keep user accent
    }
  };
  img.src = imageUrl;
  document.documentElement.classList.add("cover-atmosphere");
  return () => {
    active = false;
    img.onload = null;
    document.documentElement.classList.remove("cover-atmosphere");
    document.documentElement.style.removeProperty("--cover-accent");
  };
}

export function useCoverAccentEnabled(): boolean {
  return useSettingsStore((s) => s.coverDynamicTheme);
}
