import { validateServerBaseUrl } from "../../config/server";

export const LIBRARY_MARKER = "yomikura.library.identity.v1";
export type LibraryIdentity = { marker: string };
const QUERY = 'query YomikuraLibraryIdentity { metas(condition: { key: "yomikura.library.identity.v1" }, first: 2) { nodes { key value } } }';
const WRITE = 'mutation YomikuraCreateLibraryIdentity($value: String!) { setGlobalMeta(input: { meta: { key: "yomikura.library.identity.v1", value: $value } }) { meta { key value } } }';
export const validLibraryMarker = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);

async function request(server: string, query: string, variables?: unknown) {
  const validation = validateServerBaseUrl(server);
  if (!validation.valid) throw new Error(validation.message);
  const response = await fetch(`${validation.normalizedUrl.replace(/\/+$/, "")}/api/graphql`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables, operationName: /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] }), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data) throw new Error("The library identity could not be verified. Check the connection and retry. Your saved copies are retained.");
  return result.data;
}
export async function readLibraryIdentity(server: string): Promise<LibraryIdentity | undefined> {
  const result = await request(server, QUERY);
  const nodes = result.metas?.nodes as { key: string; value: string }[] | undefined;
  if (!Array.isArray(nodes) || nodes.length > 1 || nodes.some((node) => node.key !== LIBRARY_MARKER || !validLibraryMarker(node.value))) throw new Error("The library returned invalid identity information. Your saved copies are retained.");
  return nodes[0] ? { marker: nodes[0].value } : undefined;
}
/** Suwayomi has no compare-and-set. Read back the value retained by the server. */
export async function establishLibraryIdentity(server: string): Promise<LibraryIdentity> {
  const existing = await readLibraryIdentity(server);
  if (existing) return existing;
  await request(server, WRITE, { value: crypto.randomUUID() });
  const saved = await readLibraryIdentity(server);
  if (!saved) throw new Error("The library did not retain its identity. Your saved copies are unchanged.");
  return saved;
}
export async function verifyLibraryIdentity(server: string, expected: LibraryIdentity) {
  if ((await readLibraryIdentity(server))?.marker !== expected.marker) throw new Error("The library at this address changed during the operation. Reconnect and try again. Existing recovery copies are retained.");
}
