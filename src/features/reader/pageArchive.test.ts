import { describe, expect, it } from "vitest";
import { crc32, createPageArchive } from "./pageArchive";
describe("chapter CBZ archive", () => {
  it("uses the standard CRC-32 known vector", () => expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926));
  it("preserves exact page bytes and order in standard stored ZIP records", async () => {
    const pages = [{ name: "0001.png", blob: new Blob(["first image bytes"]) }, { name: "0002.webp", blob: new Blob(["second image bytes"]) }];
    const archive = await createPageArchive(pages, new AbortController().signal), bytes = await archive.arrayBuffer(), view = new DataView(bytes);
    let offset = 0;
    for (const page of pages) {
      expect(view.getUint32(offset, true)).toBe(0x04034b50); expect(view.getUint16(offset + 8, true)).toBe(0);
      const nameLength = view.getUint16(offset + 26, true), length = view.getUint32(offset + 18, true);
      expect(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength))).toBe(page.name);
      expect(new Uint8Array(bytes.slice(offset + 30 + nameLength, offset + 30 + nameLength + length))).toEqual(new Uint8Array(await page.blob.arrayBuffer()));
      offset += 30 + nameLength + length;
    }
    expect(view.getUint32(offset, true)).toBe(0x02014b50); expect(view.getUint32(bytes.byteLength - 22, true)).toBe(0x06054b50); expect(view.getUint16(bytes.byteLength - 14, true)).toBe(2);
  });
  it("rejects traversal, duplicate names and cancellation before producing an archive", async () => {
    const signal = new AbortController(); signal.abort();
    await expect(createPageArchive([{ name: "001.png", blob: new Blob(["page"]) }], signal.signal)).rejects.toMatchObject({ name: "AbortError" });
    for (const names of [["../page.png"], ["page.png", "PAGE.png"]]) await expect(createPageArchive(names.map((name) => ({ name, blob: new Blob(["page"]) })), new AbortController().signal)).rejects.toThrow(/unique|paths/);
  });
});
