import { expect, it } from "vitest";
import { chapterProgressLabel } from "./chapterProgressLabel";
it("shows partial positions without inventing a total or a completed state", () => {
  expect(chapterProgressLabel({ isRead: false, lastPageRead: 3, pageCount: 10 })).toBe("Page 4 of 10");
  expect(chapterProgressLabel({ isRead: false, lastPageRead: 0, pageCount: 10 })).toBe("");
  expect(chapterProgressLabel({ isRead: false, lastPageRead: 2 })).toBe("Page 3");
  expect(chapterProgressLabel({ isRead: false, lastPageRead: 100, pageCount: 10 })).toBe("Page 10 of 10");
  expect(chapterProgressLabel({ isRead: true, lastPageRead: 2, pageCount: 10 })).toBe("Read");
});
