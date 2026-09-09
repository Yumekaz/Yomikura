import { describe, expect, it } from "vitest";
import { waitForRestoreStatus } from "./backupRestore";

const noWait = async () => undefined;

describe("backup restore lifecycle", () => {
  it("waits for the server to finish a restore", async () => {
    let attempt = 0;
    const result = await waitForRestoreStatus(async () => ({ restoreStatus: ++attempt === 2 ? { state: "SUCCESS", mangaProgress: 3, totalManga: 3 } : { state: "RESTORING_MANGA", mangaProgress: 1, totalManga: 3 } }), "job", { pause: noWait });
    expect(result).toEqual({ completed: true, status: { state: "SUCCESS", mangaProgress: 3, totalManga: 3 } });
  });

  it("keeps a long-running restore distinct from a completed one", async () => {
    const result = await waitForRestoreStatus(async () => ({ restoreStatus: { state: "RESTORING_MANGA", mangaProgress: 2, totalManga: 20 } }), "job", { attempts: 2, pause: noWait });
    expect(result).toEqual({ completed: false, status: { state: "RESTORING_MANGA", mangaProgress: 2, totalManga: 20 } });
  });

  it("stops on an explicit server failure", async () => {
    await expect(waitForRestoreStatus(async () => ({ restoreStatus: { state: "FAILURE", mangaProgress: 1, totalManga: 3 } }), "job", { pause: noWait })).rejects.toThrow("safety backup");
  });
});
