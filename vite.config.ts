import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { minify } from "terser";
import { compactGraphqlSdk } from "./src/api/graphql/compactSdkBuild.ts";

export default defineConfig({
  // Suwayomi can inject its own base element when it serves Custom WebUI under a path.
  base: "./",
  plugins: [react(), {
    name: "compact-library-documents", enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/api/graphql/generated/graphql.ts")) return;
      return { code: compactGraphqlSdk(code), map: null };
    },
  }, {
    name: "yomikura-offline-shell", apply: "build",
    async generateBundle(_options, bundle) {
      // Full dependency notices must accompany builds whose minified chunks
      // omit repeated inline license banners. pnpm build creates this file.
      const notices = readFileSync(new URL("./public/licenses/THIRD_PARTY_NPM.txt", import.meta.url), "utf8");
      if (!notices.startsWith("Third-party JavaScript")) throw new Error("Generate runtime license notices before building");
      const template = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8");
      const artwork = [
        ...["moonlit-courier", "paper-garden", "moonlit-courier-page", "paper-garden-page"].map((name) => `/demo/${name}.webp`),
        ...readdirSync(new URL("./public/identity/", import.meta.url)).filter((name) => name.endsWith(".webp")).map((name) => `/identity/${name}`),
      ];
      const assets = ["/index.html", "/yomikura-logo.png", "/placeholder-cover.svg", "/manifest.webmanifest", ...artwork, ...Object.keys(bundle).filter((name) => /\.(?:js|css|woff2?)$/.test(name)).map((name) => `/${name}`)].sort();
      const hash = createHash("sha256").update(template).update(JSON.stringify(assets));
      hash.update(readFileSync(new URL("./public/yomikura-logo.png", import.meta.url)));
      hash.update(readFileSync(new URL("./public/manifest.webmanifest", import.meta.url)));
      for (const asset of artwork) hash.update(readFileSync(new URL(`./public${asset}`, import.meta.url)));
      const version = hash.digest("hex").slice(0, 20);
      const directories: Record<string, string[]> = {};
      for (const asset of assets) {
        const filenameStart = asset.lastIndexOf("/") + 1;
        (directories[asset.slice(1, filenameStart)] ??= []).push(asset.slice(filenameStart));
      }
      const worker = template.replace('"__YOMIKURA_BUILD_ID__"', JSON.stringify(version)).replace("/*__YOMIKURA_PRECACHE__*/{}", JSON.stringify(directories));
      const { code } = await minify(worker, {
        compress: { passes: 2 },
        mangle: { toplevel: true, reserved: ["BUILD_ID"] },
        format: { comments: false },
      });
      if (!code) throw new Error("The offline shell worker could not be generated");
      this.emitFile({ type: "asset", fileName: "sw.js", source: code });
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
  build: {
    minify: "terser",
    terserOptions: {
      compress: { passes: 2 },
      format: { comments: false },
    },
  },
  // Complete notices ship separately; repeating banners in every lazy chunk
  // needlessly inflates executable assets after the patched Tauri API update.
  esbuild: { legalComments: "none" },
});
