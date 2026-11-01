import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphqlError, LibraryGraphqlTransport, gql } from "./transport";
afterEach(() => vi.unstubAllGlobals());
describe("library GraphQL transport", () => {
  it("sends generated strings, fragments, variables and merged headers without parsing an AST", async () => {
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json({ data: { manga: { id: 12 } } })); vi.stubGlobal("fetch", fetcher);
    const fragment = gql`fragment Title on Manga { id }`;
    const document = gql`query GetTitle($id: Int!) { manga(id: $id) { ...Title } } ${fragment}`;
    const client = new LibraryGraphqlTransport("https://library.example/api/graphql", { headers: { "X-Profile": "first" }, credentials: "include" });
    expect(await client.request({ document, variables: { id: 12 }, requestHeaders: { "X-Profile": "second" } })).toEqual({ manga: { id: 12 } });
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({ query: document, variables: { id: 12 }, operationName: "GetTitle" });
    expect(new Headers(options.headers).get("X-Profile")).toBe("second"); expect(options.credentials).toBe("include"); expect(options.method).toBe("POST");
  });
  it.each([200, 403])("rejects GraphQL errors including partial data at HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { partial: true }, errors: [{ message: "Permission denied" }] }, { status })));
    const error = await new LibraryGraphqlTransport("https://library.example").request("query Check { check }").catch((error) => error);
    expect(error).toBeInstanceOf(GraphqlError); if (!(error instanceof GraphqlError)) throw error;
    expect(error.message).toBe("Permission denied"); expect(error.response.status).toBe(status);
  });
  it.each([new Response("<html>Error</html>", { status: 503 }), Response.json({ unrelated: "payload" })])("rejects invalid responses without exposing their body", async (response) => {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    await expect(new LibraryGraphqlTransport("https://library.example").request("query Check { check }")).rejects.toThrow(/library request failed/);
  });
  it.each(["client", "operation"])("retains cancellation from the %s signal", async (kind) => {
    const clientAbort = new AbortController(), operationAbort = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async (_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true }))));
    const request = new LibraryGraphqlTransport("https://library.example", { signal: clientAbort.signal }).request({ document: "query Check { check }", signal: operationAbort.signal });
    (kind === "client" ? clientAbort : operationAbort).abort(); await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
