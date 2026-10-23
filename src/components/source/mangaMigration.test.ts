import { beforeEach, describe, expect, it, vi } from "vitest";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { getProgressHeads } from "../../api/suwayomi/progressStorage";
import { writeChapterProgress } from "../../api/suwayomi/progressSync";
import { canReplaceMigration, executeMangaMigration, MigrationError, prepareMangaMigration } from "./mangaMigration";

const mocks = vi.hoisted(() => ({ settings: { serverBaseUrl: "http://fixture.example", mockMode: false }, sdk: {
  RefreshMigrationTarget: vi.fn(), GetMigrationManga: vi.fn(), GetMigrationChapters: vi.fn(), ToggleMangaLibrary: vi.fn(), UpdateMangaCategories: vi.fn(),
} }));
vi.mock("../../api/graphql/client", () => ({ createGraphqlClient: vi.fn(() => mocks.sdk) }));
vi.mock("../../stores/useSettingsStore", () => ({ useSettingsStore: { getState: () => mocks.settings } }));
vi.mock("../../api/suwayomi/progressStorage", () => ({ getProgressHeads: vi.fn() }));
vi.mock("../../api/suwayomi/progressSync", () => ({ writeChapterProgress: vi.fn(), synchronizeProgress: vi.fn(), progressChapterIdentity: (chapter: any) => ({ chapterId: chapter.id, chapterName: chapter.name, chapterNumber: chapter.chapterNumber, mangaId: chapter.mangaId, mangaTitle: chapter.manga.title, sourceOrder: chapter.sourceOrder, pageCount: chapter.pageCount }) }));

const backend = progressBackend("http://fixture.example");
const chapter = (id: number, mangaId: number, number: number, state = {}) => ({ id, mangaId, name: `Chapter ${number}`, chapterNumber: number, sourceOrder: number, pageCount: 10, isRead: false, isBookmarked: false, lastPageRead: 0, ...state });
let titles: Map<number, { id: number; title: string; sourceId: string; inLibrary: boolean; categories: { edges: { node: { id: number } }[] }; chapters: ReturnType<typeof chapter>[] }>;
let events: string[];
const selected = () => new Set([101, 102]);
beforeEach(() => {
  vi.resetAllMocks(); mocks.settings.serverBaseUrl = backend.serverBaseUrl; mocks.settings.mockMode = false; events = [];
  titles = new Map([
    [1, { id: 1, title: "Original", sourceId: "old", inLibrary: true, categories: { edges: [{ node: { id: 0 } }, { node: { id: 5 } }] }, chapters: [chapter(101, 1, 1, { isRead: true }), chapter(102, 1, 2, { isBookmarked: true, lastPageRead: 3 })] }],
    [2, { id: 2, title: "Destination", sourceId: "new", inLibrary: false, categories: { edges: [{ node: { id: 8 } }] }, chapters: [chapter(201, 2, 1), chapter(202, 2, 2)] }],
  ]);
  vi.mocked(getProgressHeads).mockResolvedValue([]);
  mocks.sdk.RefreshMigrationTarget.mockImplementation(async ({ input }) => { events.push("refresh"); return { fetchMangaAndChapters: { manga: { id: input.id }, chapters: [] } }; });
  mocks.sdk.GetMigrationManga.mockImplementation(async ({ id }) => {
    const { chapters: _chapters, ...manga } = titles.get(id)!; return { manga: structuredClone(manga) };
  });
  mocks.sdk.GetMigrationChapters.mockImplementation(async ({ mangaId }) => {
    const nodes = structuredClone(titles.get(mangaId)!.chapters); return { chapters: { totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes } };
  });
  mocks.sdk.ToggleMangaLibrary.mockImplementation(async ({ input }) => {
    events.push(`library:${input.id}:${input.patch.inLibrary}`);
    titles.get(input.id)!.inLibrary = input.patch.inLibrary;
    return { updateManga: { manga: { id: input.id, inLibrary: input.patch.inLibrary } } };
  });
  mocks.sdk.UpdateMangaCategories.mockImplementation(async ({ input }) => {
    events.push("categories"); const manga = titles.get(input.id)!;
    manga.categories.edges = [...new Set([...manga.categories.edges.map((edge) => edge.node.id), ...input.patch.addToCategories])].map((id) => ({ node: { id: Number(id) } }));
    return { updateManga: { manga: { id: input.id } } };
  });
  vi.mocked(writeChapterProgress).mockImplementation(async (_backend, id, patch) => {
    events.push(`progress:${id}`); Object.assign(titles.get(2)!.chapters.find((item) => item.id === id)!, patch); return { acknowledged: true };
  });
});

describe("migration review and safety", () => {
  it("refreshes destination data and loads every chapter page before review, without changing membership", async () => {
    mocks.sdk.GetMigrationChapters.mockImplementation(async ({ mangaId, after }) => {
      const chapters = titles.get(mangaId)!.chapters;
      return { chapters: { totalCount: 2, pageInfo: { hasNextPage: !after, endCursor: after ? null : "next" }, nodes: structuredClone(after ? chapters.slice(1) : chapters.slice(0, 1)) } };
    });
    const review = await prepareMangaMigration(backend, 1, 2);
    expect(events).toEqual(["refresh"]); expect(review.rows).toHaveLength(2);
    expect(mocks.sdk.GetMigrationChapters).toHaveBeenCalledTimes(4);
    expect(mocks.sdk.ToggleMangaLibrary).not.toHaveBeenCalled();
  });

  it("rejects self-migration before fetching or writing", async () => {
    await expect(prepareMangaMigration(backend, 1, 1)).rejects.toThrow("different title");
    expect(events).toEqual([]);
  });

  it("rejects empty targets and zero-match copies without changing library membership", async () => {
    titles.get(2)!.chapters = [];
    const review = await prepareMangaMigration(backend, 1, 2);
    expect(canReplaceMigration(review, selected())).toBe(false);
    await expect(executeMangaMigration(review, selected(), "copy")).rejects.toThrow("no safely matched");
    expect(mocks.sdk.ToggleMangaLibrary).not.toHaveBeenCalled();
  });

  it("copies selected read state, bookmarks, safe positions and category union while keeping the original", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    const result = await executeMangaMigration(review, selected(), "copy");
    expect(result.mode).toBe("copy"); expect(titles.get(1)!.inLibrary).toBe(true); expect(titles.get(2)!.inLibrary).toBe(true);
    expect(titles.get(2)!.chapters).toMatchObject([{ isRead: true }, { isBookmarked: true, lastPageRead: 3 }]);
    expect(titles.get(2)!.categories.edges).toEqual([{ node: { id: 8 } }, { node: { id: 5 } }]);
    expect(writeChapterProgress).toHaveBeenCalledWith(backend, 201, { isRead: true }, expect.objectContaining({ requireAcknowledgment: true, fallback: expect.objectContaining({ chapterId: 201, mangaId: 2, mangaTitle: "Destination" }) }));
    expect(events).not.toContain("library:1:false");
  });

  it("removes the original only after copying and verifying every required state", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    await executeMangaMigration(review, selected(), "replace");
    expect(events[events.length - 1]).toBe("library:1:false"); expect(titles.get(1)!.inLibrary).toBe(false);
    expect(events.indexOf("categories")).toBeGreaterThan(events.indexOf("progress:202"));
  });

  it("permits a selected partial copy and disables replacement", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    expect(canReplaceMigration(review, new Set([101]))).toBe(false);
    await expect(executeMangaMigration(review, new Set([101]), "replace")).rejects.toThrow("complete");
    await executeMangaMigration(review, new Set([101]), "copy");
    expect(titles.get(2)!.chapters[1].isBookmarked).toBe(false); expect(titles.get(1)!.inLibrary).toBe(true);
  });

  it("blocks replacement when a partial page position cannot be mapped", async () => {
    titles.get(2)!.chapters[1].pageCount = 20;
    const review = await prepareMangaMigration(backend, 1, 2);
    expect(review.rows[1].positionSkipped).toBe(true); expect(canReplaceMigration(review, selected())).toBe(false);
    await executeMangaMigration(review, selected(), "copy");
    expect(titles.get(2)!.chapters[1]).toMatchObject({ isBookmarked: true, lastPageRead: 0 });
  });

  it("keeps the original on a partial write failure, then retries idempotently", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    vi.mocked(writeChapterProgress).mockImplementationOnce(async (_backend, id, patch) => {
      Object.assign(titles.get(2)!.chapters.find((chapter) => chapter.id === id)!, patch); return { acknowledged: true };
    }).mockRejectedValueOnce(new Error("not acknowledged"));
    await expect(executeMangaMigration(review, selected(), "replace")).rejects.toThrow("not acknowledged");
    expect(titles.get(1)!.inLibrary).toBe(true);
    await executeMangaMigration(review, selected(), "replace");
    expect(titles.get(1)!.inLibrary).toBe(false);
  });

  it("does not treat an acknowledgement without confirmed state as a complete transfer", async () => {
    vi.mocked(writeChapterProgress).mockResolvedValue({ acknowledged: true });
    const review = await prepareMangaMigration(backend, 1, 2);
    await expect(executeMangaMigration(review, selected(), "replace")).rejects.toThrow("not confirmed");
    expect(titles.get(1)!.inLibrary).toBe(true);
  });

  it("does not use pending target intent as proof of a server-confirmed copy", async () => {
    const targetChapter = titles.get(2)!.chapters[0];
    vi.mocked(getProgressHeads).mockResolvedValue([{ chapter: { chapterId: 201, chapterName: targetChapter.name, chapterNumber: 1, mangaId: 2, mangaTitle: "Destination", sourceOrder: 1, pageCount: 10 }, sequence: 1, acknowledgedSequence: 0, patch: { isRead: true, lastPageRead: 0 } } as any]);
    const review = await prepareMangaMigration(backend, 1, 2);
    await expect(executeMangaMigration(review, selected(), "replace")).rejects.toThrow("not confirmed");
    expect(titles.get(1)!.inLibrary).toBe(true);
  });

  it("rejects changed source progress and destination structure after review", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    titles.get(1)!.chapters[0].lastPageRead = 4;
    await expect(executeMangaMigration(review, selected(), "replace")).rejects.toThrow("changed after");
    expect(mocks.sdk.ToggleMangaLibrary).not.toHaveBeenCalled();
    titles.get(1)!.chapters[0].lastPageRead = 0; titles.get(2)!.chapters[0].pageCount = 15;
    await expect(executeMangaMigration(review, selected(), "replace")).rejects.toThrow("changed after");
  });

  it("keeps the original if its progress changes during the copy", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    vi.mocked(writeChapterProgress).mockImplementationOnce(async (_backend, id, patch) => {
      Object.assign(titles.get(2)!.chapters.find((chapter) => chapter.id === id)!, patch);
      titles.get(1)!.chapters[0].lastPageRead = 9; return { acknowledged: true };
    });
    await expect(executeMangaMigration(review, selected(), "replace")).rejects.toThrow("changed during");
    expect(titles.get(1)!.inLibrary).toBe(true);
  });

  it("rejects unstable pagination instead of accepting an incomplete mapping", async () => {
    mocks.sdk.GetMigrationChapters.mockImplementation(async ({ mangaId, after }) => ({ chapters: { totalCount: after ? 3 : 2, pageInfo: { hasNextPage: true, endCursor: "same" }, nodes: [structuredClone(titles.get(mangaId)!.chapters[0])] } }));
    await expect(prepareMangaMigration(backend, 1, 2)).rejects.toThrow("changed during loading");
    expect(mocks.sdk.ToggleMangaLibrary).not.toHaveBeenCalled();
  });

  it("stops further writes when the selected backend changes during copying", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    vi.mocked(writeChapterProgress).mockImplementationOnce(async () => { mocks.settings.serverBaseUrl = "http://other.example"; return { acknowledged: true }; });
    await expect(executeMangaMigration(review, selected(), "replace")).rejects.toThrow("server changed");
    expect(events).not.toContain("library:1:false"); expect(mocks.sdk.UpdateMangaCategories).not.toHaveBeenCalled();
  });

  it("resolves a lost removal response from confirmed server membership", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    mocks.sdk.ToggleMangaLibrary.mockImplementation(async ({ input }) => {
      titles.get(input.id)!.inLibrary = input.patch.inLibrary;
      if (!input.patch.inLibrary) throw new Error("response lost");
      return { updateManga: { manga: { id: input.id, inLibrary: true } } };
    });
    await expect(executeMangaMigration(review, selected(), "replace")).resolves.toMatchObject({ mode: "replace" });
    expect(titles.get(1)!.inLibrary).toBe(false);
  });

  it("reports uncertain membership honestly when removal and its follow-up check fail", async () => {
    const review = await prepareMangaMigration(backend, 1, 2);
    mocks.sdk.ToggleMangaLibrary.mockImplementation(async ({ input }) => {
      if (!input.patch.inLibrary) {
        mocks.sdk.GetMigrationManga.mockRejectedValue(new Error("offline")); throw new Error("response lost");
      }
      titles.get(input.id)!.inLibrary = true; return { updateManga: { manga: { id: input.id, inLibrary: true } } };
    });
    const failure = await executeMangaMigration(review, selected(), "replace").catch((error) => error);
    expect(failure).toBeInstanceOf(MigrationError); expect(failure.original).toBe("unknown");
  });
});
