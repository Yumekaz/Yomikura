import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { listLibraryBackups, readLibraryBackup, saveLibraryBackup } from "./backupStorage";
vi.mock("../../stores/useSettingsStore", () => ({ isTauri: () => false }));
const server = "http://library.example", first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
const bytes = new Uint8Array([31,139,8,0,0,0,0,0,0,10,75,203,172,40,41,45,74,85,200,201,76,42,74,44,170,84,200,77,45,73,76,73,44,73,4,0,34,182,244,80,24,0,0,0]);
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
it("retains both identities and the unverified legacy archive without rewriting their origins", async () => {
  const legacy = await saveLibraryBackup(server, bytes, "manual");
  const one = await saveLibraryBackup(server, bytes, "scheduled", first);
  const two = await saveLibraryBackup(server, bytes, "scheduled", second);
  const records = await listLibraryBackups(server);
  expect(records).toHaveLength(3);
  expect(records.find((item) => item.id === legacy.id)?.libraryId).toBeUndefined();
  expect(records.find((item) => item.id === one.id)?.libraryId).toBe(first);
  expect(records.find((item) => item.id === two.id)?.libraryId).toBe(second);
  for (const id of [legacy.id, one.id, two.id]) expect((await readLibraryBackup(server, id)).bytes).toEqual(bytes);
});
