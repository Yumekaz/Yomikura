import { describe, expect, it } from "vitest";
import { validateBackupFile, validateBackupMetadata } from "./backupValidation";

describe("backup validation", () => {
  it("accepts supported non-empty backup files", () => {
    expect(validateBackupMetadata("library.tachibk", 1024)).toBeNull();
    expect(validateBackupMetadata("library.TACHIBK", 1024)).toBeNull();
  });

  it("rejects unsupported, empty, and oversized files", () => {
    expect(validateBackupMetadata("library.exe", 1024)).toMatch(/\.tachibk/);
    expect(validateBackupMetadata("library.zip", 1024)).toMatch(/\.tachibk/);
    expect(validateBackupMetadata("library.json", 1024)).toMatch(/\.tachibk/);
    expect(validateBackupMetadata("library.tachibk", 0)).toMatch(/empty/);
    expect(validateBackupMetadata("library.tachibk", 513 * 1024 * 1024)).toMatch(/512 MB/);
  });

  it("rejects a mislabeled tachibk before restore can be confirmed", async () => {
    const file = (bytes: number[]) => new File([new Uint8Array(bytes)], "library.tachibk");
    const gzip = Array.from(new Uint8Array(18));
    gzip.splice(0, 3, 0x1f, 0x8b, 0x08);
    expect(await validateBackupFile(file(gzip))).toBeNull();
    expect(await validateBackupFile(file([0x1f, 0x8b, 0x08]))).toMatch(/gzip/);
    expect(await validateBackupFile(file([0x50, 0x4b]))).toMatch(/gzip/);
  });
});
