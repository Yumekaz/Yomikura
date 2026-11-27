import { LibraryBackupError } from "./backupStorage";

const RESTORE_BACKUP_UPLOAD_QUERY = `
  mutation RestoreBackup($backup: Upload!) {
    restoreBackup(input: { backup: $backup }) {
      id
      status { state mangaProgress totalManga }
    }
  }
`;

const VALIDATE_BACKUP_UPLOAD_QUERY = `
  query ValidateBackup($backup: Upload!) {
    validateBackup(input: { backup: $backup }) {
      missingSources { name }
      missingTrackers { name }
    }
  }
`;

function backupUploadForm(query: string, file: File) {
  const formData = new FormData();
  // Suwayomi v2.3.2243 maps multipart files into top-level variables only.
  // Its request parser does not traverse a nested variables.input.backup path.
  formData.append("operations", JSON.stringify({ query, variables: { backup: null } }));
  formData.append("map", JSON.stringify({ "0": ["variables.backup"] }));
  formData.append("0", file, file.name);
  return formData;
}

export async function validateBackupUpload(endpoint: string, file: File, request: typeof fetch = fetch) {
  const response = await request(endpoint, { method: "POST", body: backupUploadForm(VALIDATE_BACKUP_UPLOAD_QUERY, file), redirect: "error", signal: AbortSignal.timeout(120_000) }).catch(() => {
    throw new LibraryBackupError("Could not reach Suwayomi to validate this backup. Check the connection and try again.");
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.errors?.length) throw new LibraryBackupError("Suwayomi could not validate this backup. Check the file and the server connection before retrying.");
  const validation = result?.data?.validateBackup;
  const hasNames = (entries: unknown): entries is { name: string }[] => Array.isArray(entries)
    && entries.every((entry) => entry && typeof entry.name === "string");
  if (!hasNames(validation?.missingSources) || !hasNames(validation?.missingTrackers)) {
    throw new LibraryBackupError("Suwayomi did not confirm backup validation. Check that the server supports backup validation and try again.");
  }
  return { missingSources: validation.missingSources, missingTrackers: validation.missingTrackers };
}

export async function restoreBackupUpload(endpoint: string, file: File, request: typeof fetch = fetch) {
  const response = await request(endpoint, { method: "POST", body: backupUploadForm(RESTORE_BACKUP_UPLOAD_QUERY, file), redirect: "error" });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.errors?.length) {
    throw new Error(result?.errors?.map((item: { message?: string }) => item.message).filter(Boolean).join("; ") || `Restore upload failed (HTTP ${response.status}).`);
  }
  const restore = result?.data?.restoreBackup;
  if (!restore?.id) throw new Error("Suwayomi accepted the file but did not provide a restore job ID.");
  return restore as { id: string; status?: { state?: string; mangaProgress?: number; totalManga?: number } | null };
}
