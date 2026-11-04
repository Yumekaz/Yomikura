import { beforeEach, describe, expect, it, vi } from "vitest";
import { addLibraryEntry, loadLibraryInventory, possibleLibraryDuplicates } from "./libraryEntry";
import { progressBackend } from "../../api/suwayomi/backendIdentity";

const mocks = vi.hoisted(() => ({ settings: { serverBaseUrl: "http://library.example", mockMode: false, connectionStatus: "connected" }, sdk: {
  GetLibrary: vi.fn(), GetMigrationManga: vi.fn(), ToggleMangaLibrary: vi.fn(), UpdateMangaCategories: vi.fn(),
} }));
vi.mock("../../api/graphql/client", () => ({ createGraphqlClient: () => mocks.sdk }));
vi.mock("../../stores/useSettingsStore", () => ({ useSettingsStore: { getState: () => mocks.settings } }));
const backend = progressBackend("http://library.example");
const comic = { id: 5, title: "The Shepherd Wizard" };
let record: typeof comic & { inLibrary: boolean; categories: { nodes: { id: number }[] } };
beforeEach(() => {
  vi.resetAllMocks(); mocks.settings.serverBaseUrl = backend.serverBaseUrl; mocks.settings.connectionStatus = "connected";
  record = { ...comic, inLibrary: false, categories: { nodes: [] } };
  mocks.sdk.GetMigrationManga.mockImplementation(async () => ({ manga: structuredClone(record) }));
  mocks.sdk.ToggleMangaLibrary.mockImplementation(async ({ input }) => { record.inLibrary = input.patch.inLibrary; return { updateManga: { manga: structuredClone(record) } }; });
  mocks.sdk.UpdateMangaCategories.mockImplementation(async ({ input }) => { record.categories.nodes = input.patch.addToCategories.map((id: number) => ({ id })); return { updateManga: { manga: { id: record.id } } }; });
});
describe("adding an entry without losing membership or categories", () => {
  it("adds a non-library history comic and confirms the selected categories", async () => {
    expect(await addLibraryEntry(backend, comic, [3, 7])).toMatchObject({ inLibrary: true, categories: { nodes: [{ id: 3 }, { id: 7 }] } });
    expect(mocks.sdk.ToggleMangaLibrary).toHaveBeenCalledWith({ input: { id: 5, patch: { inLibrary: true } } });
    expect(mocks.sdk.GetMigrationManga).toHaveBeenCalledTimes(2);
  });
  it("a category retry after membership was added never toggles the book out", async () => {
    mocks.sdk.UpdateMangaCategories.mockRejectedValueOnce(new Error("temporary category failure"));
    await expect(addLibraryEntry(backend, comic, [3])).rejects.toThrow("temporary category failure");
    expect(record.inLibrary).toBe(true);
    await addLibraryEntry(backend, comic, [3]);
    expect(mocks.sdk.ToggleMangaLibrary).toHaveBeenCalledTimes(1);
    expect(record.categories.nodes).toEqual([{ id: 3 }]);
  });
  it("does not report success for an unconfirmed category write", async () => {
    mocks.sdk.UpdateMangaCategories.mockResolvedValue({ updateManga: { manga: { id: 5 } } });
    await expect(addLibraryEntry(backend, comic, [3])).rejects.toThrow("categories could not be confirmed");
    expect(record.inLibrary).toBe(true);
  });
  it("rejects an offline or switched library before any mutation", async () => {
    mocks.settings.connectionStatus = "error";
    await expect(addLibraryEntry(backend, comic, [])).rejects.toThrow("connected library changed");
    mocks.settings.connectionStatus = "connected"; mocks.settings.serverBaseUrl = "http://other.example";
    await expect(addLibraryEntry(backend, comic, [])).rejects.toThrow("connected library changed");
    expect(mocks.sdk.ToggleMangaLibrary).not.toHaveBeenCalled();
  });
  it("checks duplicate candidates across every inventory page", async () => {
    mocks.sdk.GetLibrary.mockResolvedValueOnce({ mangas: { totalCount: 2, nodes: [{ id: 1, title: "Other" }], pageInfo: { hasNextPage: true, endCursor: "older" } } }).mockResolvedValueOnce({ mangas: { totalCount: 2, nodes: [{ id: 2, title: "The Shepherd-Wizard" }], pageInfo: { hasNextPage: false } } });
    const entries = await loadLibraryInventory(backend);
    expect(possibleLibraryDuplicates(entries, comic).map((entry) => entry.id)).toEqual([2]);
    expect(mocks.sdk.GetLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ after: "older" }), undefined, undefined);
  });
});
