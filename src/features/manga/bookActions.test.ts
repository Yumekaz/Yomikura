import { beforeEach, expect, it, vi } from "vitest";
import { openSourceInDesktop, refreshBookFromSource, safeSourceUrl } from "./bookActions";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
beforeEach(() => vi.clearAllMocks());
it("offers external source actions only for valid HTTP links without embedded credentials", () => {
  expect(safeSourceUrl("https://example.com/book?q=chapter")).toBe("https://example.com/book?q=chapter");
  for (const input of ["javascript:alert(1)", "data:text/html,hello", "/internal", "https://user:secret@example.com", "https://exam\nple.com", "https://example.com/\0", null]) expect(safeSourceUrl(input)).toBeUndefined();
});

it("hands a source URL to the desktop browser command without command interpolation", async () => {
  native.invoke.mockResolvedValueOnce(undefined);
  await openSourceInDesktop("https://example.com/story?chapter=5&view=full");
  expect(native.invoke).toHaveBeenCalledExactlyOnceWith("open_source_website", { url: "https://example.com/story?chapter=5&view=full" });
});

it("rejects unsafe source links before invoking native code and propagates launcher failures", async () => {
  await expect(openSourceInDesktop("file:///C:/Windows/System32/cmd.exe")).rejects.toThrow(/valid/i);
  expect(native.invoke).not.toHaveBeenCalled();
  native.invoke.mockRejectedValueOnce(new Error("Browser association unavailable"));
  await expect(openSourceInDesktop("https://example.com/story")).rejects.toThrow("Browser association unavailable");
});

it("refreshes metadata and the chapter list without sending reading-progress changes", async () => {
  const sdk = { RefreshMigrationTarget: vi.fn().mockResolvedValue({ fetchMangaAndChapters: { manga: { id: 42 }, chapters: [{ id: 101 }] } }), UpdateChapter: vi.fn() };
  await refreshBookFromSource(sdk, 42);
  expect(sdk.RefreshMigrationTarget).toHaveBeenCalledExactlyOnceWith({ input: { id: 42, fetchManga: true, fetchChapters: true } });
  expect(sdk.UpdateChapter).not.toHaveBeenCalled();
});

it.each([null, { manga: { id: 100 }, chapters: [] }])("does not report an unconfirmed book refresh as successful", async (fetchMangaAndChapters) => {
  const sdk = { RefreshMigrationTarget: vi.fn().mockResolvedValue({ fetchMangaAndChapters }) };
  await expect(refreshBookFromSource(sdk, 42)).rejects.toThrow(/did not confirm/i);
});
