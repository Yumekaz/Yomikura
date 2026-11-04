export { safeExternalUrl as safeSourceUrl, openExternalInDesktop as openSourceInDesktop } from "../../utils/externalNavigation";

type RefreshSdk = Pick<import("../../api/graphql/client").SuwayomiSdk, "RefreshMigrationTarget">;
export async function refreshBookFromSource(sdk: RefreshSdk, mangaId: number) {
  const result = await sdk.RefreshMigrationTarget({ input: { id: mangaId, fetchManga: true, fetchChapters: true } });
  if (result.fetchMangaAndChapters?.manga.id !== mangaId) throw new Error("The source did not confirm this book's refresh. Your saved reading progress is kept.");
}
