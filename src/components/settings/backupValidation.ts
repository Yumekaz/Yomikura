const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".zip", ".tachibk", ".json"];

export function validateBackupMetadata(name: string, size: number): string | null {
  const lower = name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension))) return "Choose a .zip, .tachibk, or .json backup file.";
  if (size <= 0) return "The selected backup file is empty.";
  if (size > MAX_BACKUP_BYTES) return "The selected backup exceeds the 512 MB safety limit.";
  return null;
}

export async function validateBackupFile(file: File): Promise<string | null> {
  const metadataError = validateBackupMetadata(file.name, file.size);
  if (metadataError) return metadataError;
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip") && !(header[0] === 0x50 && header[1] === 0x4b)) return "This file does not have a valid ZIP header.";
  if (lower.endsWith(".json") && ![0x7b, 0x5b].includes(header.find((byte) => ![0x09, 0x0a, 0x0d, 0x20].includes(byte)) ?? -1)) return "This file does not begin with valid JSON content.";
  return null;
}
