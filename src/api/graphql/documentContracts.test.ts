import { expect, it } from "vitest";
import { Kind, parse } from "graphql";
import * as documents from "./generated/graphql";
it("generates valid transport strings for every named SDK operation, including embedded fragments", () => {
  const operations = Object.entries(documents).filter(([name]) => name.endsWith("Document"));
  expect(operations.length).toBeGreaterThan(20);
  for (const [name, document] of operations) {
    expect(typeof document, name).toBe("string");
    const definitions = parse(document as string).definitions;
    const named = definitions.filter((definition) => definition.kind === Kind.OPERATION_DEFINITION);
    expect(named, name).toHaveLength(1);
    expect(named[0].name?.value, name).toBe(name.replace(/Document$/, ""));
  }
  expect(parse(documents.GetSourceFiltersDocument).definitions.some((definition) => definition.kind === Kind.FRAGMENT_DEFINITION)).toBe(true);
});
