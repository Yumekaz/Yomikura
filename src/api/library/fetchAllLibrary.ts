import type { MangaFilterInput } from "../graphql/generated/graphql";
import type { createGraphqlClient } from "../graphql/client";
import { collectLibraryPages } from "./collectLibraryPages";

export function fetchAllLibrary(sdk: ReturnType<typeof createGraphqlClient>, filter: MangaFilterInput, signal?: AbortSignal) {
  return collectLibraryPages(async (after) => (await sdk.GetLibrary({ filter, first: 250, after }, undefined, signal)).mangas);
}
