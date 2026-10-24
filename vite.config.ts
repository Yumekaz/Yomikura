import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export default defineConfig({
  plugins: [react(), {
    name: "yomikura-offline-shell", apply: "build",
    generateBundle(_options, bundle) {
      const template = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8");
      const artwork = ["moonlit-courier", "paper-garden", "moonlit-courier-page", "paper-garden-page"].map((name) => `/demo/${name}.webp`);
      const assets = ["/index.html", "/yomikura-logo.png", "/placeholder-cover.svg", "/manifest.webmanifest", ...artwork, ...Object.keys(bundle).filter((name) => /\.(?:js|css|woff2?)$/.test(name)).map((name) => `/${name}`)].sort();
      const hash = createHash("sha256").update(template).update(JSON.stringify(assets));
      for (const asset of artwork) hash.update(readFileSync(new URL(`./public${asset}`, import.meta.url)));
      const version = hash.digest("hex").slice(0, 20);
      this.emitFile({ type: "asset", fileName: "sw.js", source: template.replace('"__YOMIKURA_BUILD_ID__"', JSON.stringify(version)).replace("/*__YOMIKURA_PRECACHE__*/[]", JSON.stringify(assets)) });
    },
  }],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    // Trace HTML and local inspection outputs must not reload an open reading session.
    watch: {
      ignored: ["**/.cache/**", "**/.pnpm-store/**", "**/.reference-mihon/**", "**/.audit-output/**", "**/test-results/**", "**/playwright-report/**", "**/src-tauri/target/**"],
    },
  },
  optimizeDeps: { entries: ["index.html"] },
});
