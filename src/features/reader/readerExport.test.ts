import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeExport, safeExportName } from "./readerExport";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), settings: { serverBaseUrl: "http://library.example", mockMode: false } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args) }));
vi.mock("../../stores/useSettingsStore", () => ({ isTauri: () => true, useSettingsStore: { getState: () => mocks.settings } }));
const backend = progressBackend("http://library.example");
beforeEach(() => { vi.resetAllMocks(); mocks.settings.serverBaseUrl = backend.serverBaseUrl; mocks.invoke.mockImplementation(async (command) => command === "get_reader_export_directory" ? "Chosen folder" : { saved: ["export.png"], error: null }); });
afterEach(() => vi.restoreAllMocks());
describe("reader export safety", () => {
  it("bounds Unicode names by bytes and avoids reserved Windows path components", () => {
    for (const name of ["CON", "COM1.txt", "NUL", "a/b\\c:", " . ", "漫画".repeat(100)]) {
      const value = safeExportName(name); expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(100); expect(value).not.toMatch(/[\\/:]/); expect(value).not.toMatch(/^(CON|COM1|NUL)(\.|$)/); expect(value).not.toMatch(/[. ]$/);
    }
  });
  it("uses binary IPC and ASCII-safe metadata while retaining Unicode names", async () => {
    expect(await nativeExport(new Blob(["original bytes"]), "漫画.png", "本", false, backend, new AbortController().signal)).toBe(true);
    const [, data, options] = mocks.invoke.mock.calls.find(([command]) => command === "save_reader_export")!;
    expect(data).toBeInstanceOf(Uint8Array); expect(new TextDecoder().decode(data)).toBe("original bytes");
    expect(options.headers["x-yomikura-export"]).not.toMatch(/[^\x00-\x7f]/); expect(JSON.parse(options.headers["x-yomikura-export"])).toEqual({ title: "本", name: "漫画.png", archive: false });
  });
  it("does not write after folder selection is cancelled or the selected library changes", async () => {
    mocks.invoke.mockResolvedValue(null); expect(await nativeExport(new Blob(["page"]), "page.png", null, false, backend, new AbortController().signal)).toBe(false);
    expect(mocks.invoke.mock.calls.some(([command]) => command === "save_reader_export")).toBe(false);
    mocks.invoke.mockImplementation(async () => { mocks.settings.serverBaseUrl = "http://other.example"; return "Chosen folder"; });
    await expect(nativeExport(new Blob(["page"]), "page.png", null, false, backend, new AbortController().signal)).rejects.toThrow("library changed");
  });
});
