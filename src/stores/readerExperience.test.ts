import { expect, it } from "vitest";
import { DEFAULT_READER_EXPERIENCE, normalizeReaderExperience } from "./readerExperience";
it("migrates older settings while preserving established reader defaults", () => {
  expect(normalizeReaderExperience(undefined)).toEqual(DEFAULT_READER_EXPERIENCE);
  expect(normalizeReaderExperience({ skipRead: "false", skipFiltered: false, sidePadding: 100, navigatorHeight: NaN, rotation: 33, zoomAnimationMs: -50 })).toMatchObject({ skipRead: false, skipFiltered: false, sidePadding: 25, navigatorHeight: 65, rotation: 0, zoomAnimationMs: 0 });
});
