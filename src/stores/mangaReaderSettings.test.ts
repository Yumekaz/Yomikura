// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { progressBackend } from "../api/suwayomi/backendIdentity";
import { mangaReaderSettingsKey } from "./mangaReaderSettings";
import { useSettingsStore } from "./useSettingsStore";

const first = progressBackend("http://first.example");
const second = progressBackend("http://second.example");
const demo = progressBackend(first.serverBaseUrl, true);
const key = (backend = first) => mangaReaderSettingsKey(backend, 42);
const settings = () => useSettingsStore.getState();
beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), hasHydrated: true, serverBaseUrl: first.serverBaseUrl, mockMode: false });
});

describe("title reader settings ownership", () => {
  it("keeps overlapping IDs on different servers and demo separate", () => {
    settings().setMangaOverride(42, { readerMode: "RTL" }, first);
    settings().setMangaOverride(42, { readerMode: "LTR" }, second);
    settings().setMangaOverride(42, { readerMode: "WEBTOON" }, demo);
    expect(settings().mangaSettingsOverrides).toEqual({ [key(first)]: { readerMode: "RTL" }, [key(second)]: { readerMode: "LTR" }, [key(demo)]: { readerMode: "WEBTOON" } });
  });

  it("uses canonical server spelling while keeping distinct paths separate", () => {
    expect(mangaReaderSettingsKey(progressBackend("HTTP://FIRST.EXAMPLE:80///"), "42")).toBe(key());
    expect(mangaReaderSettingsKey(progressBackend("http://first.example/other"), 42)).not.toBe(key());
  });

  it("captures the writer and clears only the selected backend", () => {
    settings().setMangaOverride(42, { fitMode: "FIT_WIDTH" }, first);
    settings().setServerBaseUrl(second.serverBaseUrl);
    settings().setMangaOverride(42, { readerMode: "LTR" });
    settings().setMangaOverride(42, { readerMode: "RTL" }, first);
    expect(settings().mangaSettingsOverrides[key()]).toEqual({ fitMode: "FIT_WIDTH", readerMode: "RTL" });
    expect(settings().mangaSettingsOverrides[key(second)]).toEqual({ readerMode: "LTR" });
    settings().clearMangaOverride(42, first);
    expect(settings().mangaSettingsOverrides[key()]).toBeUndefined();
    expect(settings().mangaSettingsOverrides[key(second)]).toEqual({ readerMode: "LTR" });
  });

  it("merges filter changes and preserves explicit false and zero", () => {
    settings().setMangaOverride(42, { imageFilters: { brightness: 120, contrast: 110 }, autoDownloadCount: 3, cropBorders: true });
    settings().setMangaOverride(42, { imageFilters: { grayscale: 50 }, autoDownloadCount: 0, cropBorders: false });
    expect(settings().mangaSettingsOverrides[key()]).toEqual({ imageFilters: { brightness: 120, contrast: 110, grayscale: 50 }, autoDownloadCount: 0, cropBorders: false });
  });

  it("rehydrates scoped settings with their endpoint and namespace", async () => {
    settings().setMangaOverride(42, { readerMode: "RTL" }, first);
    settings().setMangaOverride(42, { readerMode: "LTR" }, demo);
    await useSettingsStore.persist.rehydrate();
    expect(settings().mangaSettingsOverrides[key()]).toEqual({ readerMode: "RTL" });
    expect(settings().mangaSettingsOverrides[key(demo)]).toEqual({ readerMode: "LTR" });
  });
});

describe("earlier settings recovery", () => {
  const earlier = { readerMode: "RTL" as const, imageFilters: { brightness: 125, contrast: 105 } };
  it("retains unowned entries without applying them to a server automatically", async () => {
    localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: first.serverBaseUrl, mangaSettingsOverrides: { 42: earlier } } }));
    await useSettingsStore.persist.rehydrate();
    expect(settings().mangaSettingsOverrides[42]).toEqual(earlier);
    expect(settings().mangaSettingsOverrides[key()]).toBeUndefined();
    expect(settings().legacyMangaOverridesBackend).toBeNull();
  });

  it("associates entries once after an explicit choice, preserving originals and newer edits", async () => {
    useSettingsStore.setState({ mangaSettingsOverrides: { 42: earlier, [key()]: { readerMode: "LTR", imageFilters: { brightness: 90 } } } });
    expect(settings().assignLegacyMangaOverrides(first)).toBe(true);
    expect(settings().mangaSettingsOverrides[key()]).toEqual({ readerMode: "LTR", imageFilters: { brightness: 90, contrast: 105 } });
    expect(settings().mangaSettingsOverrides[42]).toEqual(earlier);
    await useSettingsStore.persist.rehydrate();
    expect(settings().legacyMangaOverridesBackend).toBe(first.key);
    settings().setServerBaseUrl(second.serverBaseUrl);
    expect(settings().assignLegacyMangaOverrides(second)).toBe(false);
    expect(settings().mangaSettingsOverrides[key(second)]).toBeUndefined();
  });

  it("rejects an association after the user switches the destination server", () => {
    useSettingsStore.setState({ mangaSettingsOverrides: { 42: earlier } });
    settings().setServerBaseUrl(second.serverBaseUrl);
    expect(settings().assignLegacyMangaOverrides(first)).toBe(false);
    expect(settings().mangaSettingsOverrides).toEqual({ 42: earlier });
    expect(settings().legacyMangaOverridesBackend).toBeNull();
  });

  it("reset removes both scoped and earlier settings and their recovery marker", () => {
    useSettingsStore.setState({ mangaSettingsOverrides: { 42: earlier } });
    settings().assignLegacyMangaOverrides(first);
    settings().resetAllSettings();
    expect(settings().mangaSettingsOverrides).toEqual({});
    expect(settings().legacyMangaOverridesBackend).toBeNull();
  });
});
