import { LibraryGraphqlTransport, GraphqlError } from "../graphql/transport";
import { chapterIdentityMatches, type ChapterProgressIdentity, type ProgressBackend } from "./backendIdentity";
import type { RecoveryBookKey, RecoveryKeys, RecoveryManifest } from "./deviceRecoveryFormat";
import { progressChapterIdentity } from "./progressSync";

type Book = { id: number; title: string; url: string; sourceId: string | number };
type Chapter = { id: number; name: string; chapterNumber: number; sourceOrder: number; pageCount: number; mangaId: number;
  url: string; isRead: boolean; isBookmarked: boolean; lastPageRead: number; lastReadAt?: unknown; manga: Book };
const bookFields = "id title url sourceId";
const chapterFields = `id name chapterNumber sourceOrder pageCount mangaId url isRead isBookmarked lastPageRead lastReadAt manga { ${bookFields} }`;

function transport(backend: ProgressBackend) {
  return new LibraryGraphqlTransport(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId });
}

export async function captureRecoveryKeys(backend: ProgressBackend, manifest: RecoveryManifest): Promise<RecoveryKeys> {
  const client = transport(backend), books = new Map<number, RecoveryBookKey>(), chapters: RecoveryKeys["chapters"] = [];
  const chapterRecords = new Map([...manifest.chapters, ...manifest.progress.map(({ chapter }) => chapter)].map((chapter) => [chapter.chapterId, chapter]));
  const addBook = (book: Book) => books.set(book.id, { id: book.id, url: book.url, sourceId: String(book.sourceId) });
  async function find<T>(type: "manga" | "chapter", id: number, fields: string) {
    try {
      return (await client.request<Record<string, T>>({ document: `query RecoverySourceKey($id: Int!) { ${type}(id: $id) { ${fields} } }`, variables: { id }, signal: AbortSignal.timeout(15000) }))[type];
    } catch (error) {
      if (error instanceof GraphqlError && (error.response.status === 404 || /not found|non null type/i.test(error.message))) return undefined;
      throw error;
    }
  }
  for (const expected of chapterRecords.values()) {
    const chapter = await find<Chapter>("chapter", expected.chapterId, chapterFields);
    if (chapter && chapterIdentityMatches(expected, progressChapterIdentity(chapter))) {
      chapters.push({ id: chapter.id, url: chapter.url });
      addBook(chapter.manga);
    }
  }
  for (const note of manifest.notes) {
    if (books.has(note.mangaId)) continue;
    const book = await find<Book>("manga", note.mangaId, bookFields);
    if (book?.id === note.mangaId && book.title === note.title) addBook(book);
  }
  return { books: [...books.values()], chapters };
}

export function createRecoveryMatcher(backend: ProgressBackend, keys: RecoveryKeys) {
  const client = transport(backend);
  const books = new Map(keys.books.map((book) => [book.id, book]));
  const chapters = new Map(keys.chapters.map((chapter) => [chapter.id, chapter.url]));
  const bookLookups = new Map<number, Promise<Book | undefined>>();
  function matchBook(id: number) {
    const existing = bookLookups.get(id);
    if (existing) return existing;
    const key = books.get(id);
    if (!key) return Promise.resolve(undefined);
    const lookup = client.request<{ mangas: { nodes: Book[]; pageInfo: { hasNextPage: boolean } } }>(
      { document: `query RecoveryMatchBook($source: LongString!, $url: String!) { mangas(first: 2, condition: { sourceId: $source, url: $url, inLibrary: true }) { nodes { ${bookFields} } pageInfo { hasNextPage } } }`,
        variables: { source: key.sourceId, url: key.url }, signal: AbortSignal.timeout(15000) },
    ).then(({ mangas }) => {
      const [candidate] = mangas.nodes;
      return mangas.nodes.length === 1 && !mangas.pageInfo.hasNextPage && candidate.url === key.url && String(candidate.sourceId) === key.sourceId ? candidate : undefined;
    });
    bookLookups.set(id, lookup);
    return lookup;
  }

  async function matchChapter(expected: ChapterProgressIdentity) {
    const url = chapters.get(expected.chapterId);
    const book = url ? await matchBook(expected.mangaId) : undefined;
    if (!book) return undefined;
    const { chapters: result } = await client.request<{ chapters: { nodes: Chapter[]; pageInfo: { hasNextPage: boolean } } }>(
      { document: `query RecoveryMatchChapter($manga: Int!, $url: String!) { chapters(first: 2, condition: { mangaId: $manga, url: $url }) { nodes { ${chapterFields} } pageInfo { hasNextPage } } }`,
        variables: { manga: book.id, url }, signal: AbortSignal.timeout(15000) },
    );
    const [candidate] = result.nodes;
    if (result.nodes.length !== 1 || result.pageInfo.hasNextPage || candidate.mangaId !== book.id || candidate.url !== url ||
        candidate.manga.url !== book.url || String(candidate.manga.sourceId) !== String(book.sourceId)) return undefined;
    return candidate;
  }
  return { matchBook, matchChapter };
}
