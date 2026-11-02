import { afterEach, expect, it, vi } from "vitest";
import { establishLibraryIdentity, LIBRARY_MARKER, readLibraryIdentity, verifyLibraryIdentity } from "./libraryIdentity";
const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
const reply = (marker?: string) => new Response(JSON.stringify({ data: { metas: { nodes: marker ? [{ key: LIBRARY_MARKER, value: marker }] : [] } } }), { headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

it("retains an existing marker without overwriting another client's identity", async () => {
  const fetcher = vi.fn(async () => reply(first)); vi.stubGlobal("fetch", fetcher);
  expect(await establishLibraryIdentity("http://localhost:4567/")).toEqual({ marker: first });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("reads back the server's winner when first-time clients race", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply()).mockResolvedValueOnce(new Response(JSON.stringify({ data: { setGlobalMeta: {} } }))).mockResolvedValueOnce(reply(second));
  vi.stubGlobal("fetch", fetcher);
  expect(await establishLibraryIdentity("http://localhost:4567")).toEqual({ marker: second });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("rejects a replacement library at the same address", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => reply(second)));
  await expect(verifyLibraryIdentity("http://localhost:4567", { marker: first })).rejects.toThrow("changed");
});
it("rejects a missing marker during verification rather than silently creating one", async () => {
  const fetcher = vi.fn(async () => reply()); vi.stubGlobal("fetch", fetcher);
  await expect(verifyLibraryIdentity("http://localhost:4567", { marker: first })).rejects.toThrow("changed");
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each(["invalid", ""]) ("rejects malformed existing identity %s instead of replacing it", async (marker) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { metas: { nodes: [{ key: LIBRARY_MARKER, value: marker }] } } }))));
  await expect(establishLibraryIdentity("http://localhost:4567")).rejects.toThrow("invalid");
});
it("keeps an unsupported or offline server from being treated as verified", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "Unsupported" }] }), { status: 400 })));
  await expect(readLibraryIdentity("http://localhost:4567")).rejects.toThrow("could not be verified");
});
