import { describe, expect, it } from "vitest";
import { validateBackupFile, validateBackupMetadata } from "./backupValidation";

describe("backup validation", () => {
  it("accepts supported non-empty backup files", () => {
    expect(validateBackupMetadata("library.tachibk", 1024)).toBeNull();
    expect(validateBackupMetadata("library.zip", 1024)).toBeNull();
  });

  it("rejects unsupported, empty, and oversized files", () => {
    expect(validateBackupMetadata("library.exe", 1024)).toMatch(/\.zip/);
    expect(validateBackupMetadata("library.zip", 0)).toMatch(/empty/);
    expect(validateBackupMetadata("library.zip", 513 * 1024 * 1024)).toMatch(/512 MB/);
  });

  it("rejects a mislabeled tachibk before restore can be confirmed", async () => {
    const file = (bytes: number[]) => ({ name: "library.tachibk", size: bytes.length, slice: () => new Blob([new Uint8Array(bytes)]) }) as File;
    expect(await validateBackupFile(file([0x1f, 0x8b, 0x08]))).toBeNull();
    expect(await validateBackupFile(file([0x50, 0x4b]))).toMatch(/gzip/);
  });
});
