export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return; }
}
