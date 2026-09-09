import { describe, expect, it } from "vitest";
import { getRepositorySnapshot, saveRepositorySnapshot, validateExtensionRepositoryUrl } from "./extensionRepo";

describe("extension repository trust boundary", () => {
  it("accepts HTTPS JSON indexes", () => {
    expect(validateExtensionRepositoryUrl("https://example.com/repo/index.min.json")).toMatchObject({ valid: true, host: "example.com" });
  });

  it("rejects insecure remote and credential-bearing URLs", () => {
    expect(validateExtensionRepositoryUrl("http://example.com/index.json").valid).toBe(false);
    expect(validateExtensionRepositoryUrl("https://user:pass@example.com/index.json").valid).toBe(false);
  });

  it("allows local development over HTTP", () => {
    expect(validateExtensionRepositoryUrl("http://127.0.0.1:8080/index.json").valid).toBe(true);
  });

  it("keeps a recoverable per-server repository snapshot", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    saveRepositorySnapshot(storage, "http://127.0.0.1:4567/", ["https://example.com/index.json"], 123);
    expect(getRepositorySnapshot(storage, "http://127.0.0.1:4567")).toMatchObject({ repositories: ["https://example.com/index.json"], savedAt: 123 });
  });
});
