import { describe, expect, it, vi } from "vitest";
import { performVerifiedExtensionAction } from "./extensionLifecycle";

const noWait = async () => undefined;

describe("verified extension lifecycle", () => {
  it("waits for Suwayomi to confirm an update", async () => {
    const sdk = {
      ToggleExtensionInstall: vi.fn().mockResolvedValue({}),
      GetExtensions: vi.fn()
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: true, hasUpdate: true, versionName: "1" }] } })
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: true, hasUpdate: false, versionName: "2" }] } }),
    };
    const result = await performVerifiedExtensionAction(sdk, "a", "update", { pause: noWait });
    expect(result.recovered).toBe(false);
    expect(result.extension?.versionName).toBe("2");
  });

  it("reinstalls an extension removed by a failed update", async () => {
    const sdk = {
      ToggleExtensionInstall: vi.fn().mockResolvedValue({}),
      GetExtensions: vi.fn()
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: false, hasUpdate: false, versionName: "2" }] } })
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: false, hasUpdate: false, versionName: "2" }] } })
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: false, hasUpdate: false, versionName: "2" }] } })
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: false, hasUpdate: false, versionName: "2" }] } })
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: false, hasUpdate: false, versionName: "2" }] } })
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: false, hasUpdate: false, versionName: "2" }] } })
        .mockResolvedValueOnce({ extensions: { nodes: [{ pkgName: "a", isInstalled: true, hasUpdate: false, versionName: "2" }] } }),
    };
    const result = await performVerifiedExtensionAction(sdk, "a", "update", { pause: noWait });
    expect(result.recovered).toBe(true);
    expect(sdk.ToggleExtensionInstall).toHaveBeenCalledTimes(2);
  });
});
