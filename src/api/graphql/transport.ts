export type GraphqlOptions = Omit<RequestInit, "body" | "method">;
import { assertLibrarySession, rememberedLibrary } from "../suwayomi/librarySession";
type Request = { document: string; variables?: unknown; requestHeaders?: HeadersInit; signal?: AbortSignal | null };
export class GraphqlError extends Error {
  constructor(readonly response: { status: number; errors?: { message: string }[] }) {
    super(response.errors?.map((error) => error.message).join("; ") || `The library request failed (HTTP ${response.status}).`);
    this.name = "GraphqlError";
  }
}
/** Generated documents are strings. Avoid shipping an AST parser for each library request. */
export const gql = (parts: TemplateStringsArray, ...values: string[]) => parts.reduce((text, part, index) => text + part + (values[index] ?? ""), "");
export class LibraryGraphqlTransport {
  private libraryMarker?: string;
  constructor(private endpoint: string, private options: GraphqlOptions = {}) {
    // Preserve the library observed when this client was made across profile/reconnect changes.
    if (/\/api\/graphql\/?$/i.test(endpoint)) this.libraryMarker = rememberedLibrary(endpoint.replace(/\/api\/graphql\/?$/i, ""))?.marker;
  }
  async request<T>(request: Request | string, variables?: unknown): Promise<T> {
    const value = typeof request === "string" ? { document: request, variables } : request;
    if (typeof value.document !== "string") throw new Error("The library request document is invalid.");
    if (/\bmutation\b/.test(value.document) && /\/api\/graphql\/?$/i.test(this.endpoint)) {
      if (!this.libraryMarker) throw new Error("Reconnect before changing this library. Its identity has not been verified.");
      await assertLibrarySession(this.endpoint.replace(/\/api\/graphql\/?$/i, ""), this.libraryMarker);
    }
    const headers = new Headers(this.options.headers);
    new Headers(value.requestHeaders).forEach((value, key) => headers.set(key, value));
    headers.set("Content-Type", "application/json"); headers.set("Accept", "application/graphql-response+json, application/json");
    const signals = [this.options.signal, value.signal].filter((signal): signal is AbortSignal => !!signal);
    const controller = new AbortController(), abort = () => controller.abort();
    for (const signal of signals) { signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) controller.abort(); }
    try {
      const operationName = /\b(?:query|mutation)\s+([_A-Za-z]\w*)/.exec(value.document)?.[1];
      const response = await fetch(this.endpoint, { ...this.options, method: "POST", headers, signal: controller.signal, body: JSON.stringify({ query: value.document, variables: value.variables, operationName }) });
      let result: { data?: T; errors?: { message: string }[] };
      try { result = await response.json(); } catch { throw new GraphqlError({ status: response.status }); }
      if (!response.ok || !result || result.errors?.length || result.data === undefined) throw new GraphqlError({ status: response.status, errors: result?.errors?.filter((error) => typeof error.message === "string") });
      return result.data;
    } finally { for (const signal of signals) signal.removeEventListener("abort", abort); }
  }
}
