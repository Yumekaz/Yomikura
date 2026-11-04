import type { MangaFilterInput } from "../graphql/generated/graphql";
import { sdkMetadataContext, type createGraphqlClient } from "../graphql/client";
import { collectLibraryPages } from "./collectLibraryPages";
import { metadataRead } from "../suwayomi/libraryMetadata";

export function fetchAllLibrary(sdk: ReturnType<typeof createGraphqlClient>, filter: MangaFilterInput, signal?: AbortSignal) {
  const context = sdkMetadataContext(sdk);
  const key = JSON.stringify(filter) === JSON.stringify({ inLibrary: { equalTo: true } }) ? "library" : `library:${JSON.stringify(filter)}`;
  return metadataRead(context?.scope, key,
    async () => { const value = await collectLibraryPages(async (after) => (await sdk.GetLibrary({ filter, first: 250, after }, undefined, signal)).mangas); await context?.verify(); return value; },
    { preferSaved: context?.preferSaved(), signal });
}
