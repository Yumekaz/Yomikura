// @vitest-environment happy-dom
import { beforeEach, expect, it } from "vitest";
import { useSettingsStore } from "./useSettingsStore";
import { normalizeExperience } from "./experiencePreferences";
beforeEach(() => { localStorage.clear(); useSettingsStore.setState({ ...useSettingsStore.getInitialState(), hasHydrated: true }); });
it("keeps source pins and recent sources scoped to their backend and mode across hydration", async () => {
  const store = useSettingsStore.getState();
  store.toggleSourcePin("live:first", "6247824327199706550");
  store.toggleSourcePin("demo:first", "sample");
  store.recordSourceVisit("live:first", "one"); store.recordSourceVisit("live:first", "two"); store.recordSourceVisit("live:first", "one");
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().experience.sourcePins).toEqual({ "live:first": ["6247824327199706550"], "demo:first": ["sample"] });
  expect(useSettingsStore.getState().experience.recentSources["live:first"]).toEqual(["one", "two"]);
  store.toggleSourcePin("live:first", "6247824327199706550");
  expect(useSettingsStore.getState().experience.sourcePins["live:first"]).toEqual([]);
});
it("normalizes saved choices and discards malformed source entries", () => {
  const value = normalizeExperience({ sourcePins: { first: ["1", "1", null, 2, ""] }, hideLibraryEntries: "false", libraryFilters: { first: { unread: "include", completed: "invalid" } } });
  expect(value.sourcePins).toEqual({ first: ["1"] }); expect(value.hideLibraryEntries).toBe(false);
  expect(value.libraryFilters.first).toMatchObject({ unread: "include", completed: "any", started: "any" });
});
