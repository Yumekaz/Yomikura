export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (/[\u0000-\u001f\u007f]/.test(value)) return;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return; }
}

/** Tauri's WebView does not itself hand target=_blank links to the OS browser. */
export async function openSourceInDesktop(value: string) {
  const url = safeSourceUrl(value);
  if (!url) throw new Error("This book does not have a valid source website link.");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_source_website", { url });
}

type RefreshSdk = Pick<import("../../api/graphql/client").SuwayomiSdk, "RefreshMigrationTarget">;
export async function refreshBookFromSource(sdk: RefreshSdk, mangaId: number) {
  const result = await sdk.RefreshMigrationTarget({ input: { id: mangaId, fetchManga: true, fetchChapters: true } });
  if (result.fetchMangaAndChapters?.manga.id !== mangaId) throw new Error("The source did not confirm this book's refresh. Your saved reading progress is kept.");
}
