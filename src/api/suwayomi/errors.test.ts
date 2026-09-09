import { describe, expect, it } from "vitest";
import { classifySourceProblem, getSourceRecoveryHints } from "./errors";

describe("classifySourceProblem", () => {
  it.each([
    ["HTTP 429 too many requests", "rate-limit"],
    ["HTTP 404 not found", "not-found"],
    ["PKIX path building failed: certificate_unknown", "certificate"],
    ["request timed out after 30 seconds", "timeout"],
    ["HTTP 403 forbidden", "access-denied"],
    ["HTTP 500 internal server error", "source-down"],
    ["HTTP 503 service unavailable", "source-down"],
  ])("maps %s to %s", (message, kind) => {
    expect(classifySourceProblem(new Error(message)).kind).toBe(kind);
  });

  it("gives a recovery plan even for an unknown source error", () => {
    const problem = classifySourceProblem(new Error("extension returned malformed data"));
    expect(problem.title).toBe("Source request failed");
    expect(getSourceRecoveryHints(problem)).toHaveLength(2);
  });

  it("hides GraphQL chapter internals behind a useful recovery message", () => {
    const problem = classifySourceProblem(new Error("The field at path '/chapter' was declared as a non null type"));
    expect(problem.title).toBe("This chapter is no longer available");
    expect(problem.detail).not.toContain("non null type");
  });

  it("does not render certificate stack traces to readers", () => {
    const problem = classifySourceProblem(new Error("PKIX path building failed: javax.net.ssl.SSLHandshakeException"));
    expect(problem.detail).not.toContain("PKIX");
    expect(problem.detail).not.toContain("SSLHandshakeException");
  });
});
