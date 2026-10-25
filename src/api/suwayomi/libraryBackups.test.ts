import { describe, expect, it, vi } from "vitest";
import { LibraryBackupError, verifyLibraryBackupArchive, type LibraryBackup } from "./backupStorage";
import { createLibraryBackup, RestoreAfterBackupError, restoreWithSafetyBackup } from "./libraryBackups";

// Gzip fixture produced independently with node:zlib, including its CRC trailer.
const bytes = new Uint8Array([31,139,8,0,0,0,0,0,0,10,75,203,172,40,41,45,74,85,200,201,76,42,74,44,170,84,200,77,45,73,76,73,44,73,4,0,34,182,244,80,24,0,0,0]);
const backup: LibraryBackup = { id: "backup-fixture", serverBaseUrl: "http://localhost:4567", fileName: "fixture.tachibk", purpose: "safety", size: bytes.length, createdAt: 123, sha256: null, storage: "browser" };
const sdk = (url: string | null = "/api/v1/backup/file/test.tachibk") => ({ CreateBackup: vi.fn(async () => ({ createBackup: { url } })) });
const download = () => vi.fn<typeof fetch>(async () => new Response(new Uint8Array(bytes)));

describe("durable library backup lifecycle", () => {
  it("downloads the export and waits for storage verification before resolving", async () => {
    let finish!: (value: LibraryBackup) => void;
    const save = vi.fn(() => new Promise<LibraryBackup>((resolve) => { finish = resolve; }));
    let completed = false;
    const request = download();
    const pending = createLibraryBackup(sdk(), "http://localhost:4567/", "safety", { fetch: request, save }).then((result) => { completed = true; return result; });
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith("http://localhost:4567", bytes, "safety");
    expect(String(request.mock.calls[0][0])).toBe("http://localhost:4567/api/v1/backup/file/test.tachibk");
    expect(request.mock.calls[0][1]?.redirect).toBe("error");
    expect(completed).toBe(false);
    finish(backup);
    expect(await pending).toBe(backup);
  });

  it.each([null, "https://other.example/backup.tachibk", "http://user:password@localhost:4567/backup", "file:///backup"])("rejects a missing or unsafe export URL: %s", async (url) => {
    const request = download();
    const save = vi.fn();
    await expect(createLibraryBackup(sdk(url), backup.serverBaseUrl, "manual", { fetch: request, save })).rejects.toBeInstanceOf(LibraryBackupError);
    expect(request).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    () => new Response("expired", { status: 404 }),
    () => new Response("<html>sign in</html>"),
    () => new Response(new Uint8Array(bytes), { headers: { "content-length": String(513 * 1024 * 1024) } }),
  ])("does not retain unsuccessful or invalid downloads", async (response) => {
    const save = vi.fn();
    await expect(createLibraryBackup(sdk(), backup.serverBaseUrl, "manual", { fetch: vi.fn(async () => response()), save })).rejects.toBeInstanceOf(LibraryBackupError);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a connection interruption and a failed device write", async () => {
    const save = vi.fn(async () => { throw new LibraryBackupError("Device storage is full."); });
    await expect(createLibraryBackup(sdk(), backup.serverBaseUrl, "scheduled", { fetch: vi.fn(async () => { throw new TypeError("connection lost"); }), save })).rejects.toThrow("downloaded completely");
    expect(save).not.toHaveBeenCalled();
    await expect(createLibraryBackup(sdk(), backup.serverBaseUrl, "scheduled", { fetch: download(), save })).rejects.toThrow("storage is full");
  });

  it("checks the entire compressed stream, including truncation and corruption", async () => {
    await expect(verifyLibraryBackupArchive(bytes)).resolves.toBeUndefined();
    await expect(verifyLibraryBackupArchive(bytes.slice(0, -8))).rejects.toThrow("incomplete");
    const corrupt = bytes.slice();
    corrupt[corrupt.length - 6] ^= 0xff;
    await expect(verifyLibraryBackupArchive(corrupt)).rejects.toThrow("incomplete");
    await expect(verifyLibraryBackupArchive(new Uint8Array([31,139,8,0,0,0,0,0,0,10,3,0,0,0,0,0,0,0,0,0]))).rejects.toThrow("incomplete");
  });

  it("never starts restore while the safety copy is pending or when storage fails", async () => {
    let rejectSave!: (reason: Error) => void;
    const save = () => new Promise<LibraryBackup>((_resolve, reject) => { rejectSave = reject; });
    const restore = vi.fn();
    const pending = restoreWithSafetyBackup(save, restore);
    expect(restore).not.toHaveBeenCalled();
    rejectSave(new Error("quota exceeded"));
    await expect(pending).rejects.toThrow("Restore stopped");
    expect(restore).not.toHaveBeenCalled();
  });

  it("restores after verification and retains the checkpoint identity when restore fails", async () => {
    const restore = vi.fn(async () => "SUCCESS");
    expect(await restoreWithSafetyBackup(async () => backup, restore)).toEqual({ result: "SUCCESS", safetyBackup: backup });
    expect(restore).toHaveBeenCalledWith(backup);
    const error = await restoreWithSafetyBackup(async () => backup, async () => { throw new Error("server restore failure"); }).catch((result) => result);
    expect(error).toBeInstanceOf(RestoreAfterBackupError);
    expect(error.safetyBackup).toBe(backup);
    expect(error.message).toContain("fixture.tachibk");
  });
});
