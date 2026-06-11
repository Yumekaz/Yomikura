import type { GetLibraryQuery, MangaFilterInput } from "../graphql/generated/graphql";
import type { createGraphqlClient } from "../graphql/client";

type Sdk = ReturnType<typeof createGraphqlClient>;

const PAGE_SIZE = 250;

export async function fetchAllLibrary(
  sdk: Sdk,
  filter: MangaFilterInput
): Promise<GetLibraryQuery["mangas"]["nodes"]> {
  const all: GetLibraryQuery["mangas"]["nodes"] = [];
  let after: unknown = undefined;
  let hasNext = true;

  while (hasNext) {
    const page = await sdk.GetLibrary({
      filter,
      first: PAGE_SIZE,
      after: after as never,
    });

    const nodes = page.mangas?.nodes ?? [];
    all.push(...nodes);

    const pageInfo = page.mangas?.pageInfo;
    hasNext = pageInfo?.hasNextPage ?? false;
    after = pageInfo?.endCursor;
    if (!pageInfo || !hasNext || nodes.length === 0) break;
  }

  return all;
}