import { expect, it, vi } from "vitest";
import ts from "typescript";
import { stripIgnoredCharacters } from "graphql";
import { compactGraphqlSdk } from "./compactSdkBuild";
import source from "./generated/graphql.ts?raw";
function sdkFrom(code: string) {
  const module = { exports: {} as { getSdk: (client: object, wrapper?: Function) => Record<string, Function> } };
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const gql = (parts: string[], ...values: string[]) => parts.reduce((text, part, index) => text + part + (values[index] ?? ""), "");
  Function("require", "module", "exports", compiled)((name: string) => { if (name.endsWith("transport")) return { gql }; throw new Error(`Unexpected runtime dependency: ${name}`); }, module, module.exports);
  return module.exports.getSdk;
}
it("every compacted operation retains its document, variables, headers, cancellation and middleware", async () => {
  const original = sdkFrom(source), compacted = sdkFrom(compactGraphqlSdk(source));
  const a = vi.fn(async (value) => value), b = vi.fn(async (value) => value), metadata: unknown[] = [];
  const wrapper = (action: Function, ...args: unknown[]) => { metadata.push(args); return action({ "X-Wrapper": "included", "X-Shared": "wrapper" }); };
  const first = original({ request: a }, wrapper), second = compacted({ request: b }, wrapper);
  expect(Object.keys(second)).toEqual(Object.keys(first));
  const variables = { id: 42 }, headers = { "X-Shared": "caller", "X-Caller": "included" }, signal = new AbortController().signal;
  for (const name of Object.keys(first)) {
    const x = await first[name](variables, headers, signal), y = await second[name](variables, headers, signal);
    expect(stripIgnoredCharacters(y.document)).toBe(stripIgnoredCharacters(x.document));
    expect(y.variables).toBe(variables); expect(y.signal).toBe(signal); expect(y.requestHeaders).toEqual(x.requestHeaders);
    expect(metadata[metadata.length - 1]).toEqual(metadata[metadata.length - 2]);
  }
});
it("stops the build if generated operations no longer match the reviewed format", () => {
  expect(() => compactGraphqlSdk(source.replace("client.request<", "client.changed<"))).toThrow(/operations changed/);
});
