import { expect, it } from "vitest";
import { validateImportSelection } from "./importValidation";
it.each(["cbz", "zip", "cbr", "rar", "epub"])("accepts supported %s archives", (extension) => { expect(() => validateImportSelection([{ name: `Chapter.${extension}`, size: 100 }])).not.toThrow(); });
it("rejects the entire selection when a PDF or unsupported file is present", () => { expect(() => validateImportSelection([{ name: "good.cbz", size: 20 }, { name: "bad.pdf", size: 20 }])).toThrow("PDF"); });
it("rejects duplicates and oversized/empty input before native work", () => {
  expect(() => validateImportSelection([{ name: "a.cbz", size: 10 }, { name: "A.CBZ", size: 10 }])).toThrow("unique");
  expect(() => validateImportSelection([{ name: "a.cbz", size: 0 }])).toThrow("nonempty");
  expect(() => validateImportSelection([{ name: "a.cbz", size: 129 * 1024 * 1024 }])).toThrow("128");
});
