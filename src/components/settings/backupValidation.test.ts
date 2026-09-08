import { describe, expect, it } from "vitest";
import { validateBackupMetadata } from "./backupValidation";

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
});
