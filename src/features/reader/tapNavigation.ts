import type { ReaderExperience } from "../../stores/readerExperience";
export function readerTapAction(x: number, y: number, width: number, height: number, wide: boolean, rtl: boolean, preferences: Pick<ReaderExperience, "tapLayout" | "invertTapZones">): "controls" | "next" | "previous" {
  const fraction = preferences.tapLayout === "horizontal" ? x / width : y / height;
  const edge = wide ? .42 : .28;
  if (fraction >= edge && fraction <= 1 - edge) return "controls";
  let next = fraction > .5;
  if (preferences.tapLayout === "horizontal" && rtl) next = !next;
  if (preferences.invertTapZones === "both" || preferences.invertTapZones === preferences.tapLayout) next = !next;
  return next ? "next" : "previous";
}
