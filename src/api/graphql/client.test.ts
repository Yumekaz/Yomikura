import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGraphqlClient } from "./client";
import { useSettingsStore } from "../../stores/useSettingsStore";

describe("GraphQL endpoint validation", () => {
  beforeEach(() => {
    vi.spyOn(useSettingsStore, "getState").mockReturnValue({
      mockMode: false,
    } as ReturnType<typeof useSettingsStore.getState>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "http://127.0.0.1:4567/api/graphql?source=test",
    "http://127.0.0.1:4567/api/graphql#fragment",
    "http://127.0.0.1:4567/other",
    "http://user:password@127.0.0.1:4567/api/graphql",
  ])("rejects unsafe or malformed endpoint %s", (endpoint) => {
    expect(() => createGraphqlClient(endpoint)).toThrow(/endpoint|username|password/i);
  });
});
