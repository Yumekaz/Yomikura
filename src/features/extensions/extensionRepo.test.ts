import { describe, expect, it } from "vitest";
import { validateExtensionRepositoryUrl } from "./extensionRepo";

describe("extension repository trust boundary", () => {
  it("accepts HTTPS JSON indexes", () => {
    expect(validateExtensionRepositoryUrl("https://example.com/repo/index.json")).toMatchObject({ valid: true, host: "example.com" });
  });

  it("rejects insecure remote and credential-bearing URLs", () => {
    expect(validateExtensionRepositoryUrl("http://example.com/index.json").valid).toBe(false);
    expect(validateExtensionRepositoryUrl("https://user:pass@example.com/index.json").valid).toBe(false);
  });

  it("allows local development over HTTP", () => {
    expect(validateExtensionRepositoryUrl("http://127.0.0.1:8080/index.json").valid).toBe(true);
  });
});
