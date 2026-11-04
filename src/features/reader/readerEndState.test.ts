import { describe, expect, it } from "vitest";
import { deriveReaderEndState } from "./readerEndState";

describe("reader end state", () => {
  const known = { chapterId: 13, knownChapterIds: [12, 13], listStatus: "confirmed" as const };
  it("confirms the currently known final chapter without implying the series is complete", () => {
    expect(deriveReaderEndState(known)).toBe("caught-up");
  });
  it("replaces caught-up when a newly listed chapter becomes eligible", () => {
    expect(deriveReaderEndState({ ...known, knownChapterIds: [12, 13, 14], nextChapterId: 14 })).toBe("next");
  });
  it("does not call downloaded-only or scanlator-filtered continuation the final source chapter", () => {
    expect(deriveReaderEndState({ ...known, knownChapterIds: [12, 13, 14] })).toBe("filtered");
  });
  it("never treats the end of an offline cache as an authoritative final source chapter", () => {
    expect(deriveReaderEndState({ ...known, offline: true })).toBe("offline");
  });
  it("keeps a saved next chapter usable while offline", () => {
    expect(deriveReaderEndState({ ...known, offline: true, nextChapterId: 14 })).toBe("next");
  });
  it("keeps a list fetch failure distinct from caught-up even if older metadata exists", () => {
    expect(deriveReaderEndState({ ...known, listStatus: "error" })).toBe("unknown");
  });
  it("waits for an unconfirmed initial list", () => {
    expect(deriveReaderEndState({ ...known, listStatus: "loading" })).toBe("checking");
  });
  it("does not invent a last chapter if the reader's anchor is absent", () => {
    expect(deriveReaderEndState({ ...known, knownChapterIds: [12] })).toBe("unknown");
    expect(deriveReaderEndState({ ...known, knownChapterIds: undefined })).toBe("unknown");
  });
});
