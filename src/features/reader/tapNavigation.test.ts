import { expect, it } from "vitest";
import { readerTapAction } from "./tapNavigation";
it("inverts only the selected axis and retains a center controls zone", () => {
  const base = { tapLayout: "horizontal", invertTapZones: "none" } as const;
  expect(readerTapAction(5, 50, 100, 100, false, false, base)).toBe("previous");
  expect(readerTapAction(5, 50, 100, 100, false, true, base)).toBe("next");
  expect(readerTapAction(5, 50, 100, 100, false, true, { ...base, invertTapZones: "horizontal" })).toBe("previous");
  expect(readerTapAction(5, 50, 100, 100, false, false, { ...base, invertTapZones: "vertical" })).toBe("previous");
  expect(readerTapAction(50, 5, 100, 100, false, true, { tapLayout: "vertical", invertTapZones: "none" })).toBe("previous");
  expect(readerTapAction(50, 5, 100, 100, false, true, { tapLayout: "vertical", invertTapZones: "both" })).toBe("next");
  expect(readerTapAction(50, 50, 100, 100, true, true, { tapLayout: "vertical", invertTapZones: "both" })).toBe("controls");
});
