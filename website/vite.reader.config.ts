import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

export default async function readerConfig({ source, entry, outDir, base }: { source: string; entry: string; outDir: string; base: string }) {
  const require = createRequire(path.join(source, "package.json"));
  const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
  const { compactGraphqlSdk } = await import(pathToFileURL(path.join(source, "src/api/graphql/compactSdkBuild.ts")).href);
  const sourcePrefix = path.resolve(source, "src").replaceAll("\\", "/") + "/";
  return {
    configFile: false, root: entry, base, publicDir: path.join(source, "public"),
    resolve: { alias: { "@reader": path.join(source, "src") } },
    plugins: [react(), {
      name: "released-reader-pages-assets", enforce: "pre" as const,
      transform(code: string, id: string) {
        if (!id.replaceAll("\\", "/").startsWith(sourcePrefix)) return;
        let updated = code;
        if (id.replaceAll("\\", "/").endsWith("/api/graphql/generated/graphql.ts")) updated = compactGraphqlSdk(updated);
        updated = updated.replace(/(["'`(])\/(identity\/|demo\/|placeholder-cover\.svg|placeholder-thumbnail\.svg|yomikura-logo\.png)/g, `$1${base}$2`);
        return updated === code ? undefined : { code: updated, map: null };
      },
    }],
    build: { outDir, emptyOutDir: false, target: "esnext" },
  };
}
