const MAX_BACKUP_BYTES = 512 * 1024 * 1024;

export function validateBackupMetadata(name: string, size: number): string | null {
  if (!name.toLowerCase().endsWith(".tachibk")) return "Choose a Suwayomi-compatible .tachibk library backup.";
  if (size <= 0) return "The selected backup file is empty.";
  if (size > MAX_BACKUP_BYTES) return "The selected backup exceeds the 512 MB safety limit.";
  return null;
}

export async function validateBackupFile(file: File): Promise<string | null> {
  const metadataError = validateBackupMetadata(file.name, file.size);
  if (metadataError) return metadataError;
  const header = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (file.size < 18 || !(header[0] === 0x1f && header[1] === 0x8b && header[2] === 0x08)) {
    return "This file does not have a valid gzip backup header.";
  }
  return null;
}
