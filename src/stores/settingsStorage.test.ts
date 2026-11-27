// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createSettingsStorage } from "./settingsStorage";
const fs = vi.hoisted(() => ({ files: new Map<string, string>(), write: vi.fn(), remove: vi.fn(), read: vi.fn(), rename: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ BaseDirectory: { AppConfig: 13 }, exists: async (name: string) => !name || fs.files.has(name), mkdir: vi.fn(), writeTextFile: fs.write, remove: fs.remove, readTextFile: fs.read, rename: fs.rename }));
const snapshot = (serverBaseUrl: string) => JSON.stringify({ state: { serverBaseUrl }, version: 0 });
const old = snapshot("https://old.example");
const current = snapshot("https://current.example");

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  fs.files.clear();
  fs.write.mockImplementation(async (name: string, value: string) => { fs.files.set(name, value); });
  fs.read.mockImplementation(async (name: string) => fs.files.get(name));
  fs.remove.mockImplementation(async (name: string) => { fs.files.delete(name); });
  fs.rename.mockImplementation(async (from: string, to: string) => {
    fs.files.set(to, fs.files.get(from)!);
    fs.files.delete(from);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("prefers the retained current copy over a stale native file after a failed mirror", async () => {
  localStorage.setItem("settings", current);
  fs.files.set("settings.json", old);
  expect(await createSettingsStorage(() => true).getItem("settings")).toBe(current);
  expect(fs.read).not.toHaveBeenCalled();
});

it.each([null, '{"state":', '{"state":{"serverBaseUrl":3}}'])("recovers verified native settings when the local copy is missing or invalid (%s)", async (local) => {
  if (local !== null) localStorage.setItem("settings", local);
  fs.files.set("settings.json", current);
  expect(await createSettingsStorage(() => true).getItem("settings")).toBe(current);
  expect(localStorage.getItem("settings")).toBe(current);
});

it("does not import invalid settings or an uncommitted mirror write", async () => {
  localStorage.setItem("settings", '{"state":');
  fs.files.set("settings.json", '{"state":[]}');
  fs.files.set("settings.json.pending", current);
  expect(await createSettingsStorage(() => true).getItem("settings")).toBeNull();
  expect(localStorage.getItem("settings")).toBe('{"state":');
});

it("reads a previous Windows settings mirror with a UTF-8 BOM", async () => {
  fs.files.set("settings.json", `\uFEFF${current}`);
  expect(await createSettingsStorage(() => true).getItem("settings")).toBe(current);
});

it("does not replace settings that changed while native recovery was being read", async () => {
  fs.files.set("settings.json", old);
  fs.read.mockImplementationOnce(async () => {
    localStorage.setItem("settings", current);
    return old;
  });
  expect(await createSettingsStorage(() => true).getItem("settings")).toBe(current);
  expect(localStorage.getItem("settings")).toBe(current);
});
it("serializes native mirrors while retaining the newest value immediately", async () => {
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  fs.write.mockImplementationOnce(async (name: string, value: string) => { await held; fs.files.set(name, value); });
  const store = createSettingsStorage(() => true); const a = store.setItem("settings", old), b = store.setItem("settings", current);
  expect(localStorage.getItem("settings")).toBe(current); await vi.waitFor(() => expect(fs.write).toHaveBeenCalledTimes(1)); release(); await Promise.all([a, b]); expect(fs.files.get("settings.json")).toBe(current);
});
it("keeps local settings and the last committed mirror after a partial staged write", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  fs.files.set("settings.json", old);
  fs.write.mockImplementationOnce(async (name: string) => { fs.files.set(name, '{"state":'); });
  const store = createSettingsStorage(() => true);
  await store.setItem("settings", current);
  expect(await store.getItem("settings")).toBe(current);
  expect(fs.rename).not.toHaveBeenCalled();
  expect(fs.files.get("settings.json")).toBe(old);
});
it("reports failure before mirroring if the authoritative storage write fails", async () => { vi.stubGlobal("localStorage", { setItem: () => { throw new Error("quota"); } }); await expect(createSettingsStorage(() => true).setItem("settings", "UNSAVED")).rejects.toThrow("quota"); expect(fs.write).not.toHaveBeenCalled(); });
it("retains a clear tombstone when native file deletion fails", async () => { fs.files.set("settings.json", old); fs.remove.mockRejectedValue(new Error("permission denied")); const store = createSettingsStorage(() => true); await expect(store.removeItem("settings")).rejects.toThrow("permission denied"); expect(await store.getItem("settings")).toBe("null"); expect(fs.read).not.toHaveBeenCalled(); });
