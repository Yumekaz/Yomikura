const RESTORE_BACKUP_UPLOAD_QUERY = `
  mutation RestoreBackup($backup: Upload!) {
    restoreBackup(input: { backup: $backup }) {
      id
      status { state mangaProgress totalManga }
    }
  }
`;

export async function restoreBackupUpload(endpoint: string, file: File, request: typeof fetch = fetch) {
  const formData = new FormData();
  // Suwayomi v2.3.2243 maps multipart files into top-level variables only.
  // Its request parser does not traverse a nested variables.input.backup path.
  formData.append("operations", JSON.stringify({ query: RESTORE_BACKUP_UPLOAD_QUERY, variables: { backup: null } }));
  formData.append("map", JSON.stringify({ "0": ["variables.backup"] }));
  formData.append("0", file, file.name);

  const response = await request(endpoint, { method: "POST", body: formData });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.errors?.length) {
    throw new Error(result?.errors?.map((item: { message?: string }) => item.message).filter(Boolean).join("; ") || `Restore upload failed (HTTP ${response.status}).`);
  }
  const restore = result?.data?.restoreBackup;
  if (!restore?.id) throw new Error("Suwayomi accepted the file but did not provide a restore job ID.");
  return restore as { id: string; status?: { state?: string; mangaProgress?: number; totalManga?: number } | null };
}
