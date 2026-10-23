import { validateServerBaseUrl } from "../../config/server";
import { resolveBackendUrl } from "./pageUrls";
import {
  LibraryBackupError, MAX_LIBRARY_BACKUP_BYTES, readLibraryBackup, saveLibraryBackup,
  validateLibraryBackupBytes, type BackupPurpose, type LibraryBackup,
} from "./backupStorage";

type BackupSdk = { CreateBackup(input: { input: Record<string, never> }): Promise<{ createBackup?: { url?: string | null } | null }> };

export async function createLibraryBackup(
  sdk: BackupSdk,
  serverBaseUrl: string,
  purpose: BackupPurpose,
  dependencies: { fetch?: typeof fetch; save?: typeof saveLibraryBackup } = {},
): Promise<LibraryBackup> {
  const validation = validateServerBaseUrl(serverBaseUrl);
  if (!validation.valid) throw new LibraryBackupError(validation.message);
  let backupUrl: string | null | undefined;
  try {
    backupUrl = (await sdk.CreateBackup({ input: {} })).createBackup?.url;
  } catch (error) {
    throw new LibraryBackupError("Suwayomi could not export a backup. Check the server connection and retry.", { cause: error });
  }
  if (!backupUrl) throw new LibraryBackupError("Suwayomi did not return a backup file.");
  let url: URL;
  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(backupUrl) && !/^https?:/i.test(backupUrl)) throw new Error("Unsupported backup URL.");
    url = new URL(resolveBackendUrl(validation.normalizedUrl, backupUrl));
  } catch (error) { throw new LibraryBackupError("Suwayomi returned an invalid backup URL.", { cause: error }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== new URL(validation.normalizedUrl).origin || url.username || url.password) {
    throw new LibraryBackupError("Suwayomi returned a backup URL outside the configured server.");
  }
  let bytes: Uint8Array;
  try {
    const response = await (dependencies.fetch ?? fetch)(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new LibraryBackupError(`The backup download failed (HTTP ${response.status}).`);
    if (Number(response.headers.get("content-length")) > MAX_LIBRARY_BACKUP_BYTES) {
      throw new LibraryBackupError("The backup exceeds the 512 MB safety limit.");
    }
    if (!response.body) throw new LibraryBackupError("Suwayomi returned an empty backup response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_LIBRARY_BACKUP_BYTES) {
          await reader.cancel();
          throw new LibraryBackupError("The backup exceeds the 512 MB safety limit.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    validateLibraryBackupBytes(bytes);
  } catch (error) {
    if (error instanceof LibraryBackupError) throw error;
    throw new LibraryBackupError("The backup could not be downloaded completely. Check the server connection and retry.", { cause: error });
  }
  return (dependencies.save ?? saveLibraryBackup)(validation.normalizedUrl, bytes, purpose);
}

export async function exportLibraryBackup(serverBaseUrl: string, id: string) {
  const { backup, bytes } = await readLibraryBackup(serverBaseUrl, id);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/gzip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backup.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to consume the object URL; the retained copy is independent of this export.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export class RestoreAfterBackupError extends LibraryBackupError {
  constructor(public readonly safetyBackup: LibraryBackup, cause: unknown) {
    super(`Restore could not be confirmed. The safety backup “${safetyBackup.fileName}” is retained in Saved backups on this device.`, { cause });
  }
}

export async function restoreWithSafetyBackup<T>(
  saveSafetyBackup: () => Promise<LibraryBackup>,
  restore: (backup: LibraryBackup) => Promise<T>,
) {
  let safetyBackup: LibraryBackup;
  try { safetyBackup = await saveSafetyBackup(); }
  catch (error) {
    throw new LibraryBackupError("Restore stopped because its safety backup could not be saved and verified on this device.", { cause: error });
  }
  try { return { result: await restore(safetyBackup), safetyBackup }; }
  catch (error) { throw new RestoreAfterBackupError(safetyBackup, error); }
}
