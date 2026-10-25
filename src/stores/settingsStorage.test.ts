// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createSettingsStorage } from "./settingsStorage";
const fs = vi.hoisted(() => ({ files: new Map<string, string>(), write: vi.fn(), remove: vi.fn(), read: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ BaseDirectory: { AppConfig: 13 }, exists: async (name: string) => !name || fs.files.has(name), mkdir: vi.fn(), writeTextFile: (...args: unknown[]) => fs.write(...args), remove: (...args: unknown[]) => fs.remove(...args), readTextFile: (...args: unknown[]) => fs.read(...args) }));
beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); fs.files.clear(); fs.write.mockImplementation(async (name: string, value: string) => { fs.files.set(name, value); }); fs.read.mockImplementation(async (name: string) => fs.files.get(name)); fs.remove.mockImplementation(async (name: string) => { fs.files.delete(name); }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("prefers the retained current copy over a stale native file after a failed mirror", async () => { localStorage.setItem("settings", "NEW"); fs.files.set("settings.json", "OLD"); expect(await createSettingsStorage(() => true).getItem("settings")).toBe("NEW"); expect(fs.read).not.toHaveBeenCalled(); });
it("recovers an existing native file when device storage has no settings", async () => { fs.files.set("settings.json", "RECOVERED"); expect(await createSettingsStorage(() => true).getItem("settings")).toBe("RECOVERED"); expect(localStorage.getItem("settings")).toBe("RECOVERED"); });
it("serializes native mirrors while retaining the newest value immediately", async () => {
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  fs.write.mockImplementationOnce(async (name: string, value: string) => { await held; fs.files.set(name, value); });
  const store = createSettingsStorage(() => true); const a = store.setItem("settings", "A"), b = store.setItem("settings", "B");
  expect(localStorage.getItem("settings")).toBe("B"); await vi.waitFor(() => expect(fs.write).toHaveBeenCalledTimes(1)); release(); await Promise.all([a, b]); expect(fs.files.get("settings.json")).toBe("B");
});
it("keeps settings after native mirror failure", async () => { vi.spyOn(console, "warn").mockImplementation(() => undefined); fs.write.mockRejectedValue(new Error("permission denied")); const store = createSettingsStorage(() => true); await store.setItem("settings", "KEPT"); expect(await store.getItem("settings")).toBe("KEPT"); });
it("reports failure before mirroring if the authoritative storage write fails", async () => { vi.stubGlobal("localStorage", { setItem: () => { throw new Error("quota"); } }); await expect(createSettingsStorage(() => true).setItem("settings", "UNSAVED")).rejects.toThrow("quota"); expect(fs.write).not.toHaveBeenCalled(); });
it("retains a clear tombstone when native file deletion fails", async () => { fs.files.set("settings.json", "OLD"); fs.remove.mockRejectedValue(new Error("permission denied")); const store = createSettingsStorage(() => true); await expect(store.removeItem("settings")).rejects.toThrow("permission denied"); expect(await store.getItem("settings")).toBe("null"); });
