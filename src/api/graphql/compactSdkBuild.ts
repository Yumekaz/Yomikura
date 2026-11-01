import { stripIgnoredCharacters } from "graphql";
/** Keep generated signatures in source; share repetitive wrappers in emitted code. */
export function compactGraphqlSdk(code: string): string {
  const compact = code.replace(/gql`([^`]+)`/g, (_match, document: string) => `gql\`${stripIgnoredCharacters(document)}\``);
  const range = /export function getSdk\([^\n]+\) \{[\s\S]*?\nexport type Sdk =/;
  const body = compact.match(range)?.[0];
  if (!body) throw new Error("Generated SDK shape changed; review build compaction.");
  const entries = Array.from(body.matchAll(/return withWrapper\(\(wrappedRequestHeaders\) => client\.request<[^>]+>\(\{ document: (\w+), variables, requestHeaders: \{ \.\.\.requestHeaders, \.\.\.wrappedRequestHeaders \}, signal \}\), '(\w+)', '(query|mutation)', variables\);/g));
  if (!entries.length || entries.length !== (body.match(/client\.request</g) ?? []).length || entries.length !== (body.match(/\): Promise</g) ?? []).length) throw new Error("Generated SDK operations changed; review build compaction.");
  return compact.replace(range, `export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
    const operations = { ${entries.map(([, document, name, kind]) => `${name}: [${document}, '${kind}']`).join(",")} };
    return Object.fromEntries(Object.entries(operations).map(([name, [document, kind]]) => [name, (variables, requestHeaders, signal) => withWrapper((wrappedRequestHeaders) => client.request({ document, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), name, kind, variables)]));
  }
  export type Sdk =`);
}
