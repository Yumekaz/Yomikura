import type { VerifiedDownloadPage } from "./offlineCache";

export async function downloadChecksum(bytes: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return btoa(String.fromCharCode(...digest));
}

export async function readVerifiedDownloadPage(cache: Cache, page: VerifiedDownloadPage): Promise<Blob | undefined> {
  const response = await cache.match(page.url);
  if (!response?.ok) return;
  const blob = await response.blob();
  if (blob.size === page.size && await downloadChecksum(await blob.arrayBuffer()) === page.checksum) return blob;
}
