import { describe, expect, it } from "vitest";
import { compareSuwayomiVersions, parseSuwayomiVersion } from "./version";

describe("Suwayomi versions", () => {
  it("parses stable and preview tags", () => {
    expect(parseSuwayomiVersion("v2.3.2243")).toEqual([2, 3, 2243]);
    expect(parseSuwayomiVersion("2.3.2232")).toEqual([2, 3, 2232]);
  });

  it("does not call an older stable build an update", () => {
    expect(compareSuwayomiVersions("2.3.2232", "2.3.2243")).toBe(-1);
    expect(compareSuwayomiVersions("2.3.2243", "2.3.2232")).toBe(1);
  });
});
