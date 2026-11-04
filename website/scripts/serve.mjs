import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".zip": "application/zip", ".txt": "text/plain; charset=utf-8", ".sha256": "text/plain; charset=utf-8" };
export async function serve(directory, { base = "/Yomikura/", port = 4175 } = {}) {
  const root = path.resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      if (pathname === base.slice(0, -1)) { response.writeHead(308, { location: base }); response.end(); return; }
      if (!pathname.startsWith(base) || pathname.includes("\0")) { response.writeHead(404); response.end(); return; }
      let file = path.resolve(root, pathname.slice(base.length));
      if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
      const item = await stat(file);
      if (item.isDirectory()) file = path.join(file, "index.html");
      const bytes = await readFile(file);
      response.writeHead(200, { "content-type": contentTypes[path.extname(file)] || "application/octet-stream", "content-length": bytes.length });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hosted = await serve(process.argv[2] || "site-dist", { port: Number(process.env.PORT || 4175) });
  console.log(`Public site preview: ${hosted.origin}/Yomikura/`);
}
