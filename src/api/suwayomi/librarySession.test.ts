import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rememberedLibrary, rememberLibrary, assertLibrarySession } from "./librarySession";
import { readLibraryIdentity } from "./libraryIdentity";
import { LibraryGraphqlTransport } from "../graphql/transport";
vi.mock("./libraryIdentity", async (original) => ({ ...await original<typeof import("./libraryIdentity")>(), readLibraryIdentity: vi.fn() }));
const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.mocked(readLibraryIdentity).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it("persists marker continuity by normalized address and keeps other addresses independent", () => {
  rememberLibrary("http://localhost:4567/", { marker: first });
  rememberLibrary("http://localhost:4568", { marker: second });
  expect(rememberedLibrary("http://localhost:4567")?.marker).toBe(first);
  expect(rememberedLibrary("http://localhost:4568")?.marker).toBe(second);
});
it("refuses a replaced server without adopting its marker during a write", async () => {
  rememberLibrary("http://localhost:4567", { marker: first });
  vi.mocked(readLibraryIdentity).mockResolvedValue({ marker: second });
  await expect(assertLibrarySession("http://localhost:4567")).rejects.toThrow("different library");
  expect(rememberedLibrary("http://localhost:4567")?.marker).toBe(first);
});
it("a client made for an earlier library cannot mutate a replacement after reconnect", async () => {
  rememberLibrary("http://localhost:4567", { marker: first });
  const client = new LibraryGraphqlTransport("http://localhost:4567/api/graphql");
  rememberLibrary("http://localhost:4567", { marker: second });
  vi.mocked(readLibraryIdentity).mockResolvedValue({ marker: second });
  const send = vi.fn(); vi.stubGlobal("fetch", send);
  await expect(client.request("mutation SaveProgress { updateChapter { id } }")).rejects.toThrow("different library");
  expect(send).not.toHaveBeenCalled();
});
it("a client created before verification cannot silently adopt a later library for mutations", async () => {
  const client = new LibraryGraphqlTransport("http://localhost:4567/api/graphql");
  rememberLibrary("http://localhost:4567", { marker: second });
  const send = vi.fn(); vi.stubGlobal("fetch", send);
  await expect(client.request("mutation SaveProgress { updateChapter { id } }")).rejects.toThrow("Reconnect");
  expect(send).not.toHaveBeenCalled();
});
