import { describe, expect, it } from "vitest";
import { localDateKey, parseHistoryTimestamp, shouldShowReadingEvent } from "./HistoryPage";
import { getChapterCacheKey, getReadingHistoryKey, normalizeCacheServerUrl } from "../../api/suwayomi/offlineCache";

describe("history timestamps", () => {
  it("normalizes seconds and milliseconds", () => {
    expect(parseHistoryTimestamp("1")).toBe(1000);
    expect(parseHistoryTimestamp("1720000000000")).toBe(1720000000000);
  });

  it("accepts ISO timestamps and rejects empty server defaults", () => {
    expect(parseHistoryTimestamp("2026-09-05T10:00:00Z")).toBe(Date.parse("2026-09-05T10:00:00Z"));
    expect(parseHistoryTimestamp("0")).toBe(0);
    expect(parseHistoryTimestamp("")).toBe(0);
  });

  it("groups by a stable local calendar key", () => {
    expect(localDateKey(new Date(2026, 8, 5, 23, 59).getTime())).toBe("2026-09-05");
  });
});

describe("offline identity", () => {
  it("uses the normalized server URL in chapter and history keys", () => {
    expect(normalizeCacheServerUrl(" http://127.0.0.1:4567/// ")).toBe("http://127.0.0.1:4567");
    expect(getChapterCacheKey("http://127.0.0.1:4567/", 42)).toBe("http://127.0.0.1:4567::42");
    expect(getReadingHistoryKey("http://127.0.0.1:4567/", 42)).toBe("http://127.0.0.1:4567::42");
  });
});

describe("demo history isolation", () => {
  it("never presents sandbox chapters as live-server activity", () => {
    expect(shouldShowReadingEvent({ mangaTitle: "[Demo] Pepper & Carrot" }, false)).toBe(false);
    expect(shouldShowReadingEvent({ mangaTitle: "A real library chapter", isDemo: true }, false)).toBe(false);
    expect(shouldShowReadingEvent({ mangaTitle: "A real library chapter" }, false)).toBe(true);
    expect(shouldShowReadingEvent({ mangaTitle: "[Demo] Pepper & Carrot" }, true)).toBe(true);
  });
});
