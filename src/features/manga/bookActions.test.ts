import { expect, it } from "vitest";
import { safeSourceUrl } from "./bookActions";
it("offers external source actions only for valid HTTP links without embedded credentials", () => {
  expect(safeSourceUrl("https://example.com/book?q=chapter")).toBe("https://example.com/book?q=chapter");
  for (const input of ["javascript:alert(1)", "data:text/html,hello", "/internal", "https://user:secret@example.com", null]) expect(safeSourceUrl(input)).toBeUndefined();
});
