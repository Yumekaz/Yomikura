import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { acknowledgeBookNote, bookNoteScope, getBookNoteDraft, noteHasConflict, saveBookNoteDraft } from "./bookNoteStorage";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
it("keeps device drafts across reloads and separates backend, mode and reused book IDs", async () => {
  const first = progressBackend("http://localhost:4567");
  const key = bookNoteScope(first, 1, "A");
  const draft = { key, value: "My note", base: "", revision: "1", pending: true };
  await saveBookNoteDraft(draft); expect(await getBookNoteDraft(key)).toEqual(draft);
  for (const other of [bookNoteScope(first, 1, "B"), bookNoteScope(progressBackend(first.serverBaseUrl, true), 1, "A"), bookNoteScope(progressBackend("http://localhost:4568"), 1, "A")]) expect(await getBookNoteDraft(other)).toBeUndefined();
});
it("keeps a newer draft when an older server acknowledgment arrives", async () => {
  const old = { key: "one", value: "old", base: "", revision: "1", pending: true };
  const next = { ...old, value: "new", revision: "2" };
  await saveBookNoteDraft(old); await saveBookNoteDraft(next);
  expect(await acknowledgeBookNote(old)).toBe(false); expect(await getBookNoteDraft("one")).toEqual(next);
  expect(await acknowledgeBookNote(next)).toBe(true); expect(await getBookNoteDraft("one")).toMatchObject({ pending: false, base: "new" });
});
it("requires review when the library changed independently, including an unknown offline baseline", () => {
  expect(noteHasConflict({ value: "local", base: "old" }, "other device")).toBe(true);
  expect(noteHasConflict({ value: "local", base: "old" }, "local")).toBe(false);
  expect(noteHasConflict({ value: "local", base: null }, "remote")).toBe(true);
  expect(noteHasConflict({ value: "local", base: null }, "")).toBe(false);
});
