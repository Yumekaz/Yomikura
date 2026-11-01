import type { SuwayomiSdk } from "../graphql/client";
import { collectLibraryPages } from "./collectLibraryPages";
export async function fetchAllExtensions(sdk: Pick<SuwayomiSdk, "GetExtensions">, signal?: AbortSignal) {
  const nodes = await collectLibraryPages(async (after) => (await sdk.GetExtensions({ first: 500, after }, undefined, signal)).extensions, (item) => item.pkgName);
  return { extensions: { nodes, totalCount: nodes.length } };
}
