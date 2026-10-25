import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist");
const limits = {
  // Original palette-aware branding and self-hosted display type ship offline.
  // Keep script limits unchanged; artwork has its own bounded allowance.
  totalBytes: 3 * 1024 * 1024,
  identityBytes: 768 * 1024,
  javascriptBytes: 1024 * 1024,
  largestJavaScriptBytes: 350 * 1024,
};

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else files.push(fullPath);
  }
  return files;
}

try {
  const files = await collect(root);
  const sizes = await Promise.all(files.map(async (file) => ({
    file,
    bytes: (await stat(file)).size,
  })));
  const totalBytes = sizes.reduce((sum, item) => sum + item.bytes, 0);
  const identityBytes = sizes.filter((item) => item.file.includes(`${path.sep}identity${path.sep}`)).reduce((sum, item) => sum + item.bytes, 0);
  const javascript = sizes.filter((item) => item.file.endsWith(".js"));
  const javascriptBytes = javascript.reduce((sum, item) => sum + item.bytes, 0);
  const largestJavaScript = javascript.sort((a, b) => b.bytes - a.bytes)[0];

  const failures = [];
  if (totalBytes > limits.totalBytes) failures.push(`total output is ${totalBytes} bytes`);
  if (identityBytes > limits.identityBytes) failures.push(`identity artwork is ${identityBytes} bytes`);
  if (javascriptBytes > limits.javascriptBytes) failures.push(`JavaScript output is ${javascriptBytes} bytes`);
  if (largestJavaScript?.bytes > limits.largestJavaScriptBytes) {
    failures.push(`largest JavaScript chunk is ${largestJavaScript.bytes} bytes (${path.basename(largestJavaScript.file)})`);
  }

  console.log(`Build budget: ${files.length} files, ${totalBytes} total bytes, ${javascriptBytes} JavaScript bytes`);
  console.log(`Identity artwork: ${identityBytes} bytes`);
  if (largestJavaScript) console.log(`Largest JavaScript chunk: ${path.basename(largestJavaScript.file)} (${largestJavaScript.bytes} bytes)`);

  if (failures.length) {
    console.error(`Build budget exceeded: ${failures.join("; ")}`);
    process.exit(1);
  }
} catch (error) {
  console.error(`Could not inspect dist/: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
