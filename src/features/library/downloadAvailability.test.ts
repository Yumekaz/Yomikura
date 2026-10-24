import { expect, it } from "vitest";
import { availabilityCounts, matchesAvailability } from "./downloadAvailability";

it.each([[false, false, false], [true, false, true], [false, true, true], [true, true, true]])("keeps local/server availability independent (%s, %s)", (local, server, either) => {
  expect(matchesAvailability("smart:downloaded", local, server)).toBe(either);
  expect(matchesAvailability("smart:on_device", local, server)).toBe(local);
  expect(matchesAvailability("smart:on_server", local, server)).toBe(server);
});
it("counts titles once for either availability without changing backend flags", () => {
  const mangas = [{ id: 1, downloadCount: 0 }, { id: 2, downloadCount: 1 }, { id: 3, downloadCount: 2 }, { id: 4, downloadCount: 0 }];
  expect(availabilityCounts(mangas, new Map([["1", 2], ["3", 1]]))).toEqual({ "smart:downloaded": 3, "smart:on_device": 2, "smart:on_server": 2 });
  expect(mangas[0].downloadCount).toBe(0);
});
