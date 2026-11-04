import { createGraphqlClient } from "../../api/graphql/client";
import type { GetLibraryQuery } from "../../api/graphql/generated/graphql";
import { collectLibraryPages } from "../../api/library/collectLibraryPages";
import { progressBackend, type ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { useSettingsStore } from "../../stores/useSettingsStore";

export type LibraryEntry = GetLibraryQuery["mangas"]["nodes"][number];
export const libraryInventoryKey = (backend: ProgressBackend) => ["library-add-inventory", backend.key, backend.libraryId ?? ""];
const sdkFor = (backend: ProgressBackend) => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live");
export function assertLibraryEntryBackend(backend: ProgressBackend) {
  const settings = useSettingsStore.getState();
  const current = progressBackend(settings.serverBaseUrl, settings.mockMode);
  if (current.key !== backend.key || current.libraryId !== backend.libraryId || !backend.isDemo && settings.connectionStatus !== "connected") throw new Error("Your connected library changed. Reopen this comic before adding it.");
}
export async function loadLibraryInventory(backend: ProgressBackend, signal?: AbortSignal): Promise<LibraryEntry[]> {
  const sdk = sdkFor(backend);
  return collectLibraryPages(async (after) => (await sdk.GetLibrary({ filter: { inLibrary: { equalTo: true } }, first: 200, after }, undefined, signal)).mangas);
}
export const normalizedLibraryTitle = (title: string) => title.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function possibleLibraryDuplicates(entries: LibraryEntry[], manga: { id: number; title: string }) {
  const name = normalizedLibraryTitle(manga.title);
  return name ? entries.filter((entry) => {
    const other = normalizedLibraryTitle(entry.title);
    return entry.id !== manga.id && (other === name || name.length >= 4 && other.length >= 4 && (other.includes(name) || name.includes(other)));
  }) : [];
}
export const duplicateFingerprint = (entries: LibraryEntry[]) => JSON.stringify(entries.map((entry) => [entry.id, entry.title, String(entry.sourceId)]).sort((a, b) => Number(a[0]) - Number(b[0])));

/** Do not toggle blindly: a retry after a lost response must never remove a book. */
export async function addLibraryEntry(backend: ProgressBackend, manga: { id: number; title: string }, categoryIds: number[]) {
  assertLibraryEntryBackend(backend);
  const sdk = sdkFor(backend);
  const current = (await sdk.GetMigrationManga({ id: manga.id })).manga;
  assertLibraryEntryBackend(backend);
  if (current.id !== manga.id || current.title !== manga.title) throw new Error("This comic changed. Reopen its details before adding it.");
  if (!current.inLibrary) {
    const added = await sdk.ToggleMangaLibrary({ input: { id: manga.id, patch: { inLibrary: true } } });
    assertLibraryEntryBackend(backend);
    if (added.updateManga?.manga.inLibrary !== true) throw new Error("Library membership could not be confirmed. Reconnect and retry.");
  }
  await sdk.UpdateMangaCategories({ input: { id: manga.id, patch: { clearCategories: true, addToCategories: categoryIds } } });
  assertLibraryEntryBackend(backend);
  const verified = (await sdk.GetMigrationManga({ id: manga.id })).manga;
  const expected = categoryIds.filter((id) => id > 0);
  const actual = verified.categories.nodes.map((category) => category.id).filter((id) => id > 0);
  if (verified.id !== manga.id || verified.title !== manga.title || !verified.inLibrary || expected.length !== actual.length || expected.some((id) => !actual.includes(id))) throw new Error("The comic may be in your library, but its categories could not be confirmed. Check the connection and retry Save.");
  return verified;
}
