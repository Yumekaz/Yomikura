export type NoteExport = { format: "yomikura-notes"; version: 1; createdAt: string; notes: { mangaId: number; title: string; value: string }[] };
const MAX_BYTES = 10 * 1024 * 1024;
export function parseNoteExport(text: string): NoteExport {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("The note file exceeds the 10 MB limit.");
  const input = JSON.parse(text) as NoteExport;
  if (input?.format !== "yomikura-notes" || input.version !== 1 || !Array.isArray(input.notes) || input.notes.length > 10000) throw new Error("Choose a Yomikura note export.");
  const ids = new Set<string>();
  for (const note of input.notes) {
    const identity = JSON.stringify([note?.mangaId, note?.title]);
    if (!note || !Number.isSafeInteger(note.mangaId) || note.mangaId < 0 || ids.has(identity) || typeof note.title !== "string" || !note.title || note.title.length > 2000 || typeof note.value !== "string" || note.value.length > 20000) throw new Error("The note file contains invalid or repeated book identities.");
    ids.add(identity);
  }
  return { format: "yomikura-notes", version: 1, createdAt: typeof input.createdAt === "string" ? input.createdAt : "", notes: input.notes.map(({ mangaId, title, value }) => ({ mangaId, title, value })) };
}
