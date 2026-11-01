import { describe, expect, it } from "vitest";
import { formatChapterDate, parseChapterTimestamp } from "./chapterDate";
import { useSettingsStore } from "../../stores/useSettingsStore";

describe("chapter dates", () => {
  it("parses ISO dates without collapsing them to 1970", () => {
    expect(parseChapterTimestamp("2026-06-01")).toBe(Date.parse("2026-06-01"));
    expect(formatChapterDate("2026-06-01")).not.toContain("1970");
  });

  it("accepts Unix seconds and milliseconds", () => {
    expect(parseChapterTimestamp("1780272000")).toBe(1_780_272_000_000);
    expect(parseChapterTimestamp(1_780_272_000_000)).toBe(1_780_272_000_000);
  });

  it("returns a stable fallback for invalid values", () => {
    expect(formatChapterDate("not-a-date")).toBe("Unknown date");
  });
  it("formats numeric dates using the local calendar instead of a UTC day shift", () => {
    const original = useSettingsStore.getState().experience, previous = original.chapterDateFormat;
    // setState is not required: this formatter reads the current in-memory preference.
    try { original.chapterDateFormat = "iso"; expect(formatChapterDate(new Date(2026, 9, 29, 23, 30).getTime())).toBe("2026-10-29"); }
    finally { original.chapterDateFormat = previous; }
  });
});
