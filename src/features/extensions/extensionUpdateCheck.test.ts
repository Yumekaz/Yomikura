import { describe, expect, it, vi } from "vitest";
import { checkExtensionUpdates, EXTENSION_CHECK_INTERVAL } from "./extensionUpdateCheck";

const backend = { key: '["live","http://library.example"]', serverBaseUrl: "http://library.example", isDemo: false, libraryId: "library-a" };
const now = 2 * EXTENSION_CHECK_INTERVAL;
function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const extension = { pkgName: "example", name: "Example source", isInstalled: true, hasUpdate: true };
  const sdk = {
    GetExtensionStores: vi.fn().mockResolvedValue({ extensionStores: { nodes: [{ name: "Chosen store" }] } }),
    FetchExtensionCatalog: vi.fn().mockResolvedValue({ fetchExtensions: { extensions: [{ pkgName: "example" }] } }),
    GetExtensions: vi.fn().mockResolvedValue({ extensions: { nodes: [extension], totalCount: 1, pageInfo: { hasNextPage: false } } }),
    ToggleExtensionInstall: vi.fn(),
  };
  return { sdk, storage, values, options: { storage, now, isCurrent: () => true } };
}

describe("automatic extension update discovery", () => {
  it("refreshes only configured catalogues, then reads updates without installing", async () => {
    const { sdk, options } = fixture();
    const result = await checkExtensionUpdates(sdk, backend, options);
    expect(sdk.FetchExtensionCatalog).toHaveBeenCalledOnce();
    expect(result.extensions.nodes[0].hasUpdate).toBe(true);
    expect(result.checkedAt).toBe(now);
    expect(sdk.ToggleExtensionInstall).not.toHaveBeenCalled();
  });

  it("reuses a successful check within twelve hours and can explicitly refresh it", async () => {
    const { sdk, options } = fixture();
    await checkExtensionUpdates(sdk, backend, options);
    await checkExtensionUpdates(sdk, backend, { ...options, now: now + 60_000 });
    expect(sdk.FetchExtensionCatalog).toHaveBeenCalledOnce();
    await checkExtensionUpdates(sdk, backend, { ...options, force: true, now: now + 120_000 });
    expect(sdk.FetchExtensionCatalog).toHaveBeenCalledTimes(2);
  });

  it("does not reuse another library's successful check at the same address", async () => {
    const { sdk, options } = fixture();
    await checkExtensionUpdates(sdk, backend, options);
    await checkExtensionUpdates(sdk, { ...backend, libraryId: "replacement-library" }, options);
    expect(sdk.FetchExtensionCatalog).toHaveBeenCalledTimes(2);
  });

  it("does not add a store or refresh an unconfigured publisher", async () => {
    const { sdk, options } = fixture();
    sdk.GetExtensionStores.mockResolvedValue({ extensionStores: { nodes: [] } });
    const result = await checkExtensionUpdates(sdk, backend, options);
    expect(result.extensions.nodes).toHaveLength(1);
    expect(result.checkedAt).toBe(0);
    expect(sdk.FetchExtensionCatalog).not.toHaveBeenCalled();
  });

  it("keeps the known list usable after a failed fresh check without claiming freshness", async () => {
    const { sdk, options, values } = fixture();
    sdk.FetchExtensionCatalog.mockRejectedValue(new Error("Publisher unavailable"));
    const result = await checkExtensionUpdates(sdk, backend, options);
    expect(result.extensions.nodes).toHaveLength(1);
    expect(result.refreshError).toBe("Publisher unavailable");
    expect(result.checkedAt).toBe(0);
    expect(values.size).toBe(0);
  });

  it("stops before a catalogue mutation when the selected library changed", async () => {
    const { sdk, options, values } = fixture();
    let selected = true;
    sdk.GetExtensionStores.mockImplementation(async () => { selected = false; return { extensionStores: { nodes: [{ name: "Chosen store" }] } }; });
    await expect(checkExtensionUpdates(sdk, backend, { ...options, isCurrent: () => selected })).rejects.toThrow("selected library changed");
    expect(sdk.FetchExtensionCatalog).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it("does not record a check if reading its resulting catalogue failed", async () => {
    const { sdk, options, values } = fixture();
    sdk.GetExtensions.mockRejectedValue(new Error("Connection lost"));
    await expect(checkExtensionUpdates(sdk, backend, options)).rejects.toThrow("Connection lost");
    expect(values.size).toBe(0);
  });

  it("keeps demo checks separate and never refreshes a live publisher in demo mode", async () => {
    const { sdk, options } = fixture();
    await checkExtensionUpdates(sdk, { ...backend, isDemo: true }, options);
    expect(sdk.GetExtensionStores).not.toHaveBeenCalled();
    expect(sdk.FetchExtensionCatalog).not.toHaveBeenCalled();
    expect(sdk.ToggleExtensionInstall).not.toHaveBeenCalled();
  });
});
