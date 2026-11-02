import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { beginLibraryRestore, pendingLibraryRestore, recordLibraryRestore, finishLibraryRestore } from "./restoreIdentity";
import { assertLibrarySession, rememberLibrary, rememberedLibrary } from "./librarySession";
import { establishLibraryIdentity, replaceLibraryIdentity, verifyLibraryIdentity, readLibraryIdentity } from "./libraryIdentity";
vi.mock("./libraryIdentity", async (original) => ({ ...await original<typeof import("./libraryIdentity")>(), establishLibraryIdentity: vi.fn(), replaceLibraryIdentity: vi.fn(), verifyLibraryIdentity: vi.fn(), readLibraryIdentity: vi.fn() }));
const server = "http://library.example", first = "11111111-1111-4111-8111-111111111111", next = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.resetAllMocks(); const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  rememberLibrary(server, { marker: first });
  vi.mocked(establishLibraryIdentity).mockResolvedValue({ marker: first }); vi.mocked(replaceLibraryIdentity).mockResolvedValue({ marker: next });
});
afterEach(() => vi.unstubAllGlobals());
it("persists a write pause even if upload has no confirmed response", async () => {
  const token = beginLibraryRestore(server);
  expect(pendingLibraryRestore(server)?.token).toBe(token);
  await expect(assertLibrarySession(server)).rejects.toThrow("restore");
  expect(readLibraryIdentity).not.toHaveBeenCalled();
  expect(() => beginLibraryRestore(server)).toThrow("previous restore");
});
it("retains the server restore ID for recovery after navigation or restart", () => {
  const token = beginLibraryRestore(server); recordLibraryRestore(server, token, "restore-fixture");
  expect(pendingLibraryRestore(server)).toMatchObject({ token, id: "restore-fixture" });
});
it("renews a same-marker restore once and unpauses only after the new marker is retained", async () => {
  const token = beginLibraryRestore(server);
  await Promise.all([finishLibraryRestore(server, token), finishLibraryRestore(server, token)]);
  expect(replaceLibraryIdentity).toHaveBeenCalledOnce(); expect(rememberedLibrary(server)?.marker).toBe(next);
  expect(pendingLibraryRestore(server)).toBeUndefined();
  await finishLibraryRestore(server, token);
  expect(replaceLibraryIdentity).toHaveBeenCalledOnce(); expect(verifyLibraryIdentity).toHaveBeenCalledWith(server, { marker: next });
});
it("keeps writes paused when the new library generation cannot be confirmed", async () => {
  const token = beginLibraryRestore(server); vi.mocked(replaceLibraryIdentity).mockRejectedValue(new Error("network loss"));
  await expect(finishLibraryRestore(server, token)).rejects.toThrow("network loss");
  expect(pendingLibraryRestore(server)?.token).toBe(token); expect(rememberedLibrary(server)?.marker).toBe(first);
});
