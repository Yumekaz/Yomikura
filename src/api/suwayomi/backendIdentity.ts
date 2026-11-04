import { validateServerBaseUrl } from "../../config/server";
import { rememberedLibrary } from "./librarySession";

export interface ProgressBackend {
  key: string;
  serverBaseUrl: string;
  isDemo: boolean;
  libraryId?: string;
}

/** Capture the endpoint when an operation is created; never resolve it again from a profile ID. */
export function progressBackend(serverBaseUrl: string, isDemo = false): ProgressBackend {
  const validation = validateServerBaseUrl(serverBaseUrl);
  if (!validation.valid) throw new Error(validation.message);
  const server = validation.normalizedUrl.replace(/\/+$/, "");
  return { key: JSON.stringify([isDemo ? "demo" : "live", server]), serverBaseUrl: server, isDemo, libraryId: isDemo ? undefined : rememberedLibrary(server)?.marker };
}

export interface ChapterProgressIdentity {
  chapterId: number;
  chapterName: string;
  chapterNumber: number;
  mangaId: number;
  mangaTitle: string;
  sourceOrder?: number;
  pageCount: number;
}

export function chapterIdentityMatches(expected: ChapterProgressIdentity, actual: ChapterProgressIdentity) {
  return expected.chapterId === actual.chapterId && expected.mangaId === actual.mangaId
    && expected.chapterName === actual.chapterName && expected.chapterNumber === actual.chapterNumber
    && expected.mangaTitle === actual.mangaTitle
    && (expected.sourceOrder === undefined || expected.sourceOrder === actual.sourceOrder);
}
