import { expect, it } from "vitest";
import { groupReadingSources } from "./sourceGroups";
it("keeps pinned order and resolves the latest available source, including multi-language extensions", () => {
  const sources = [{ id: "6247824327199706550", name: "English", lang: "en" }, { id: "fr", name: "French", lang: "fr" }, { id: "jp", name: "Japanese", lang: "ja" }];
  const grouped = groupReadingSources(sources, ["fr", "removed", sources[0].id], ["removed", "jp", "fr"]);
  expect(grouped.pinned.map((source) => source.id)).toEqual(["fr", sources[0].id]);
  expect(grouped.lastUsed[0].id).toBe("jp");
  expect(grouped.languages).toEqual([{ language: "ja", items: [sources[2]] }]);
});
