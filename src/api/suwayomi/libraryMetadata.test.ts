// @vitest-environment happy-dom
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGraphqlClient, sdkMetadataContext } from "../graphql/client";
import { fetchAllLibrary } from "../library/fetchAllLibrary";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { rememberLibrary } from "./librarySession";
import { hasLibraryMetadata, isMetadataSnapshot, metadataRead, metadataScope, readMetadata, saveMetadata } from "./libraryMetadata";

const server = "http://metadata.example";
const markerA = "11111111-1111-4111-8111-111111111111";
const markerB = "22222222-2222-4222-8222-222222222222";
const libraryFilter = { inLibrary: { equalTo: true } };
const records = [{ id: 11, title: "First stored title", inLibrary: true }, { id: 12, title: "Second stored title", inLibrary: true }];

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  useSettingsStore.setState({ serverBaseUrl: server, mockMode: false, connectionStatus: "connected" });
  rememberLibrary(server, { marker: markerA });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function client() { return createGraphqlClient(`${server}/api/graphql`, undefined, "live"); }
function respond(data: unknown, status = 200) { return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } }); }
function liveFixture(options: { partial?: boolean; marker?: string } = {}) {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { operationName, variables } = JSON.parse(String(init?.body));
    requests.push(operationName);
    if (operationName === "YomikuraLibraryIdentity") return respond({ metas: { nodes: [{ key: "yomikura.library.identity.v1", value: options.marker ?? markerA }] } });
    if (operationName === "GetLibrary") return respond({ mangas: { totalCount: 2, nodes: !variables.after ? [records[0]] : options.partial ? [] : [records[1]], pageInfo: { hasNextPage: !variables.after, endCursor: !variables.after ? "second-page" : null } } });
    if (operationName === "GetCategories") return respond({ categories: { nodes: [{ id: 1, name: "Reading" }] } });
    if (operationName === "GetMangaDetails") return respond({ manga: { id: variables.id, title: "Stored details", inLibrary: true, chapters: { edges: [{ node: { id: 77, name: "Unsaved chapter" } }] } } });
    return respond({ __typename: "Query" });
  }));
  return requests;
}

describe("durable library metadata snapshots", () => {
  it("restores a complete listing, categories and details through a fresh SDK after network loss", async () => {
    const requests = liveFixture();
    const sdk = client();
    expect(await fetchAllLibrary(sdk, libraryFilter)).toEqual(records);
    await sdk.GetCategories();
    await sdk.GetMangaDetails({ id: 11 });
    expect(requests.filter((name) => name === "GetLibrary")).toHaveLength(2);
    expect(await hasLibraryMetadata(server)).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const cold = client();
    const library = await fetchAllLibrary(cold, libraryFilter);
    expect(library).toEqual(records);
    expect(isMetadataSnapshot(library)).toBe(true);
    expect(isMetadataSnapshot(await cold.GetCategories())).toBe(true);
    expect((await cold.GetMangaDetails({ id: 11 })).manga.title).toBe("Stored details");
    // Metadata includes a chapter name, never its downloaded page bytes.
    expect(await readMetadata(metadataScope(server), "chapter:77")).toBeUndefined();
  });

  it("does not replace or silently fall back to a complete snapshot after invalid partial pagination", async () => {
    liveFixture();
    await fetchAllLibrary(client(), libraryFilter);
    liveFixture({ partial: true });
    await expect(fetchAllLibrary(client(), libraryFilter)).rejects.toThrow(/incomplete/);
    expect(await readMetadata(metadataScope(server), "library")).toEqual(records);
  });

  it("isolates a replacement marker at the same address from the earlier library", async () => {
    liveFixture();
    await fetchAllLibrary(client(), libraryFilter);
    const oldScope = metadataScope(server);
    rememberLibrary(server, { marker: markerB });
    expect(metadataScope(server)).not.toBe(oldScope);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Connection refused")));
    await expect(fetchAllLibrary(client(), libraryFilter)).rejects.toThrow("Connection refused");
    expect(await hasLibraryMetadata(server)).toBe(false);
    expect(await readMetadata(oldScope, "library")).toEqual(records);
  });

  it("does not assign remembered metadata to an explicitly unverified client", async () => {
    liveFixture();
    await client().GetCategories();
    const unverified = createGraphqlClient(`${server}/api/graphql`, { libraryId: null }, "live");
    expect(sdkMetadataContext(unverified)?.scope).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Connection refused")));
    await expect(unverified.GetCategories()).rejects.toThrow("Connection refused");
  });

  it("does not expose old metadata through an unresolved restore", async () => {
    liveFixture();
    await fetchAllLibrary(client(), libraryFilter);
    localStorage.setItem("yomikura-library-restores-v1", JSON.stringify({ [server]: { token: markerB } }));
    expect(metadataScope(server)).toBeUndefined();
    expect(await hasLibraryMetadata(server)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Connection refused")));
    await expect(fetchAllLibrary(client(), libraryFilter)).rejects.toThrow("Connection refused");
  });

  it("rejects an in-flight live result if its remote identity changed before persistence", async () => {
    liveFixture();
    const oldSdk = client();
    await oldSdk.GetCategories();
    const before = await readMetadata(metadataScope(server), "categories");
    liveFixture({ marker: markerB });
    await expect(oldSdk.GetCategories()).rejects.toThrow(/different library/);
    expect(await readMetadata(metadataScope(server), "categories")).toEqual(before);
  });

  it.each([200, 401, 403])("does not substitute a snapshot for GraphQL/auth rejection (HTTP %s)", async (status) => {
    liveFixture();
    await client().GetCategories();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: "Not authorized" }] }), { status, headers: { "Content-Type": "application/json" } })));
    await expect(client().GetCategories()).rejects.toThrow("Not authorized");
  });

  it("does not call a request or return a saved result for an already cancelled query", async () => {
    const scope = metadataScope(server), controller = new AbortController();
    await saveMetadata(scope, "library", records);
    controller.abort();
    const request = vi.fn().mockResolvedValue(records);
    await expect(metadataRead(scope, "library", request, { preferSaved: true, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });

  it("does not return a cached result if cancellation arrives during its IndexedDB read", async () => {
    const scope = metadataScope(server), controller = new AbortController();
    await saveMetadata(scope, "library", records);
    const original = IDBObjectStore.prototype.get;
    vi.spyOn(IDBObjectStore.prototype, "get").mockImplementationOnce(function(this: IDBObjectStore, key) {
      const request = original.call(this, key);
      request.addEventListener("success", () => controller.abort(), { once: true });
      return request;
    });
    await expect(metadataRead(scope, "library", () => Promise.resolve(records), { preferSaved: true, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not store a result from a query cancelled while its request was resolving", async () => {
    const scope = metadataScope(server), controller = new AbortController();
    await saveMetadata(scope, "library", records);
    const request = async () => { controller.abort(); return [{ id: 99, title: "Cancelled result", inLibrary: true }]; };
    await expect(metadataRead(scope, "library", request, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(await readMetadata(scope, "library")).toEqual(records);
  });

  it("never wraps a mutation in a metadata fallback", async () => {
    liveFixture();
    const sdk = client();
    await sdk.GetCategories();
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      const { operationName } = JSON.parse(String(init?.body));
      if (operationName === "YomikuraLibraryIdentity") return respond({ metas: { nodes: [{ key: "yomikura.library.identity.v1", value: markerA }] } });
      return new Response(JSON.stringify({ errors: [{ message: "Mutation unavailable" }] }), { status: 503 });
    }));
    await expect(sdk.ToggleExtensionInstall({ input: { id: "example", patch: { update: true } } })).rejects.toThrow("Mutation unavailable");
    expect(await readMetadata(metadataScope(server), "categories")).toEqual({ categories: { nodes: [{ id: 1, name: "Reading" }] } });
  });

  it("keeps a successful live result when snapshot storage is full", async () => {
    const scope = metadataScope(server);
    await saveMetadata(scope, "library", records);
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
    const live = [{ id: 99, title: "Current library result", inLibrary: true }];
    expect(await metadataRead(scope, "library", () => Promise.resolve(live))).toBe(live);
    expect(isMetadataSnapshot(live)).toBe(false);
    expect(await readMetadata(scope, "library")).toEqual(records);
  });
});
