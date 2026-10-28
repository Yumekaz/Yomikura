import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { bookNoteScope, getBookNoteDraft, saveBookNoteDraft, saveBookNoteIfUnchanged } from "./bookNoteStorage";
import { captureNoteExport, importNoteExport, parseNoteExport } from "./notePortability";
import { readLibraryBackup, saveLibraryBackup } from "../../api/suwayomi/backupStorage";
const mocks = vi.hoisted(() => ({ settings: { serverBaseUrl: "http://library.example", mockMode: false }, get: vi.fn() }));
vi.mock("../../stores/useSettingsStore", () => ({ isTauri: () => false, useSettingsStore: { getState: () => mocks.settings } }));
vi.mock("../../api/graphql/client", () => ({ createGraphqlClient: () => ({ GetMigrationManga: mocks.get }) }));
const backend = progressBackend("http://library.example"), second = progressBackend("http://second.example");
const draft = (value: string, owner = backend) => ({ key: bookNoteScope(owner, 1, "Fixture"), value, base: null, pending: true, revision: crypto.randomUUID() });
const exported = (notes = [{ mangaId: 1, title: "Fixture", value: "Imported thought" }]) => JSON.stringify({ format: "yomikura-notes", version: 1, notes });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("indexedDB", new IDBFactory()); mocks.settings = { serverBaseUrl: backend.serverBaseUrl, mockMode: false };
  mocks.get.mockImplementation(async ({ id }) => ({ manga: { id, title: "Fixture" } }));
});
afterEach(() => vi.unstubAllGlobals());
describe("note portability", () => {
  it("retains a verified note snapshot with a library backup independently of later edits", async () => {
    await saveBookNoteDraft(draft("Thought at backup time"));
    const bytes = new Uint8Array([31,139,8,0,0,0,0,0,0,10,75,203,172,40,41,45,74,85,200,201,76,42,74,44,170,84,200,77,45,73,76,73,44,73,4,0,34,182,244,80,24,0,0,0]);
    const backup = await saveLibraryBackup(backend.serverBaseUrl, bytes, "safety");
    await saveBookNoteDraft(draft("New thought"));
    const saved = await readLibraryBackup(backend.serverBaseUrl, backup.id);
    expect(saved.bytes).toEqual(bytes);
    expect(parseNoteExport(saved.backup.notesSnapshot!).notes[0].value).toBe("Thought at backup time");
  });
  it("exports only the selected backend and mode, including unsynced drafts", async () => {
    await saveBookNoteDraft(draft("First thought")); await saveBookNoteDraft(draft("Private second library", second)); await saveBookNoteDraft(draft("Demo thought", progressBackend(backend.serverBaseUrl, true)));
    const text = await captureNoteExport(backend);
    expect(parseNoteExport(text).notes).toEqual([{ mangaId: 1, title: "Fixture", value: "First thought" }]);
    expect(text).not.toContain("second library"); expect(text).not.toContain("http:");
  });
  it("checks book identities and imports drafts without replacing independently edited notes", async () => {
    await saveBookNoteDraft(draft("Keep my thought"));
    const result = await importNoteExport(exported([{ mangaId: 1, title: "Fixture", value: "Old thought" }, { mangaId: 2, title: "Fixture", value: "New thought" }, { mangaId: 3, title: "Changed title", value: "Other thought" }]), backend);
    expect(result).toEqual({ added: 1, kept: 1, unmatched: 1 });
    expect(await getBookNoteDraft(bookNoteScope(backend, 1, "Fixture"))).toMatchObject({ value: "Keep my thought" });
    expect(await getBookNoteDraft(bookNoteScope(backend, 2, "Fixture"))).toMatchObject({ value: "New thought", pending: true, base: null });
  });
  it("validates the whole import before writing and rejects repeated identities", async () => {
    await expect(importNoteExport(exported([{ mangaId: 1, title: "Fixture", value: "One" }, { mangaId: -2, title: "Bad", value: "Two" }]), backend)).rejects.toThrow("invalid");
    expect(await getBookNoteDraft(bookNoteScope(backend, 1, "Fixture"))).toBeUndefined();
    expect(() => parseNoteExport(exported([{ mangaId: 1, title: "Fixture", value: "One" }, { mangaId: 1, title: "Fixture", value: "Two" }]))).toThrow("repeated");
  });
  it("keeps the import unwritten after a network failure or profile change", async () => {
    mocks.get.mockRejectedValueOnce(new Error("offline")); await expect(importNoteExport(exported(), backend)).rejects.toThrow("offline");
    mocks.get.mockImplementationOnce(async () => { mocks.settings.serverBaseUrl = second.serverBaseUrl; return { manga: { id: 1, title: "Fixture" } }; });
    await expect(importNoteExport(exported(), backend)).rejects.toThrow("library changed");
    expect(await getBookNoteDraft(bookNoteScope(backend, 1, "Fixture"))).toBeUndefined();
  });
  it("uses an atomic revision guard when copying a migration draft", async () => {
    const existing = draft("Current"); await saveBookNoteDraft(existing);
    expect(await saveBookNoteIfUnchanged(draft("Stale copy"))).toBe(false);
    expect(await saveBookNoteIfUnchanged(draft("Reviewed copy"), existing.revision)).toBe(true);
  });
});
