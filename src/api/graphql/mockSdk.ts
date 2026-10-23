import { Sdk } from "./generated/graphql";
import type { TrackerRecordFieldsFragment } from "./generated/graphql";

// A high-fidelity mock implementation of the Suwayomi SDK
// Keep sample activity believable whenever Demo Sandbox Mode is opened. A fixed
// calendar date made an otherwise healthy history view look as if it were using
// stale server time.
const recentDemoTimestamp = () => new Date(Date.now() - 13 * 60_000).toISOString();
const demoMembership = new Map<number, boolean>();
const demoTracks = new Map<number, TrackerRecordFieldsFragment[]>();
function sampleTrack(mangaId: number, trackerId = 1, remoteId = String(mangaId + 100000), title?: string): TrackerRecordFieldsFragment {
  return { id: mangaId * 10 + trackerId, mangaId, trackerId, remoteId, title: title ?? (mangaId === 10001 ? "Sita's Sister (Synced)" : "Pepper & Carrot (Synced)"),
    lastChapterRead: 1, totalChapters: 24, score: 9, displayScore: "9", status: 1, remoteUrl: "https://anilist.co", private: false };
}
function tracksFor(mangaId: number) {
  if (!demoTracks.has(mangaId)) demoTracks.set(mangaId, mangaId === 10001 || mangaId === 10002 ? [sampleTrack(mangaId)] : []);
  return demoTracks.get(mangaId)!;
}

const mockImpl: any = {
  async ConnectionTest() {
    return { __typename: "Query" };
  },

  async GetCategories() {
    return {
      categories: {
        nodes: [
          { id: 1, name: "Default", order: 1 },
          { id: 2, name: "Favorites", order: 2 },
        ],
      },
    };
  },

  async GetLibrary() {
    return {
      mangas: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: 10001,
            title: "[Demo] Sita's Sister",
            thumbnailUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300",
            unreadCount: 3,
            downloadCount: 0,
            lastReadChapter: null,
            categories: { nodes: [{ id: 1 }] },
          },
          {
            id: 10002,
            title: "[Demo] Pepper & Carrot",
            thumbnailUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300",
            unreadCount: 5,
            downloadCount: 0,
            lastReadChapter: { id: 20002 },
            categories: { nodes: [{ id: 1 }] },
          },
        ],
      },
    };
  },

  async GetMangaDetails({ id }: any) {
    const isSita = id === 10001;
    return {
      manga: {
        id,
        title: isSita ? "[Demo] Sita's Sister" : "[Demo] Pepper & Carrot",
        author: isSita ? "Amit Tayal" : "David Revoy",
        artist: isSita ? "Amit Tayal" : "David Revoy",
        description: isSita
          ? "A beautiful graphic novel set in ancient India following the story of Sita's lesser known sister."
          : "The webcomic about Pepper, a young witch, and her cat, Carrot. It's free, open-source, and funded directly by its patrons.",
        thumbnailUrl: isSita
          ? "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300"
          : "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300",
        status: "COMPLETED",
        genre: ["Demo", "Fantasy", "Indie"],
        inLibrary: demoMembership.get(id) ?? true,
        categories: { edges: [{ node: { id: 1 } }] },
        source: { name: "Yomikura Playground" },
        chapters: {
          edges: [
            {
              node: {
                id: isSita ? 20001 : 20002,
                name: "Chapter 1: The Journey Begins",
                chapterNumber: 1,
                isRead: false,
                isBookmarked: false,
                isDownloaded: false,
                uploadDate: "2026-06-01",
                scanlator: "Yomikura",
              },
            },
          ],
        },
      },
    };
  },

  async GetChapter({ id }: any) {
    const isSita = id === 20001;
    return {
      chapter: {
        id,
        name: "Chapter 1: The Journey Begins",
        chapterNumber: 1,
        isRead: false,
        lastPageRead: 0,
        pageCount: 4,
        sourceOrder: 1,
        mangaId: isSita ? 10001 : 10002,
        manga: {
          title: isSita ? "[Demo] Sita's Sister" : "[Demo] Pepper & Carrot",
          chapters: {
            edges: [
              { node: { id, chapterNumber: 1 } },
            ],
          },
        },
      },
    };
  },

  async GetMigrationManga({ id }: any) {
    const { manga } = await mockImpl.GetMangaDetails({ id });
    return { manga: { id, title: manga.title, sourceId: "mock-source", inLibrary: demoMembership.get(id) ?? true, categories: manga.categories } };
  },
  async GetMigrationChapters({ mangaId }: any) {
    const { manga } = await mockImpl.GetMangaDetails({ id: mangaId });
    const nodes = manga.chapters.edges.map(({ node }: any) => ({ ...node, mangaId, pageCount: 4, lastPageRead: 0, sourceOrder: 1 }));
    return { chapters: { totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes } };
  },
  async RefreshMigrationTarget({ input }: any) {
    const { chapters } = await mockImpl.GetMigrationChapters({ mangaId: input.id });
    return { fetchMangaAndChapters: { manga: { id: input.id }, chapters: chapters.nodes.map(({ id }: any) => ({ id })) } };
  },

  async FetchChapterPages() {
    return {
      fetchChapterPages: {
        pages: [
          "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
          "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800",
          "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?w=800",
          "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800",
        ],
      },
    };
  },

  async GetExtensions() {
    return {
      extensions: {
        totalCount: 2,
        nodes: [
          {
            pkgName: "mock.playground.manga",
            name: "Yomikura Playground Source",
            lang: "en",
            isNsfw: false,
            isInstalled: true,
            iconUrl: "",
            versionName: "1.0.0",
          },
          {
            pkgName: "mock.playground.nsfw",
            name: "Playground 18+ Catalog",
            lang: "en",
            isNsfw: true,
            isInstalled: true,
            iconUrl: "",
            versionName: "1.0.0",
          },
        ],
      },
    };
  },

  async GetSources() {
    return {
      sources: {
        totalCount: 1,
        nodes: [
          {
            id: "mock-source",
            name: "Yomikura Playground",
            lang: "en",
            iconUrl: "",
            supportsLatest: true,
            isNsfw: false,
            isConfigurable: false,
            extension: {
              pkgName: "mock.playground.manga",
              isInstalled: true,
            },
          },
        ],
      },
    };
  },

  async GetSourcesByCondition({ lang }: any) {
    if (lang !== "en" && lang !== "__all__") {
      return { sources: { totalCount: 0, nodes: [] } };
    }
    return {
      sources: {
        totalCount: 1,
        nodes: [
          {
            id: "mock-source",
            name: "Yomikura Playground",
            lang: "en",
            iconUrl: "",
            supportsLatest: true,
            isNsfw: false,
            isConfigurable: false,
          },
        ],
      },
    };
  },

  async GetInstalledExtensionLangs() {
    return {
      extensions: {
        totalCount: 1,
        nodes: [
          { pkgName: "mock.playground.manga", lang: "en" },
        ],
      },
    };
  },

  async FetchSourceManga() {
    return {
      fetchSourceManga: {
        hasNextPage: false,
        mangas: [
          {
            id: 10001,
            title: "[Demo] Sita's Sister",
            thumbnailUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300",
            inLibrary: true,
            status: "COMPLETED",
          },
          {
            id: 10002,
            title: "[Demo] Pepper & Carrot",
            thumbnailUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300",
            inLibrary: true,
            status: "ONGOING",
          },
        ],
      },
    };
  },

  async GetUpdates() {
    return {
      chapters: {
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [
          {
            node: {
              id: 20001,
              name: "Chapter 1: The Journey Begins",
              chapterNumber: 1,
              isRead: false,
              lastPageRead: 0,
              uploadDate: "2026-06-01T10:00:00Z",
              scanlator: "Yomikura",
              mangaId: 10001,
              manga: {
                id: 10001,
                title: "[Demo] Sita's Sister",
                thumbnailUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300",
              },
            },
          },
        ],
      },
    };
  },

  async GetHistory() {
    return {
      chapters: {
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [
          {
            node: {
              id: 20002,
              name: "Chapter 1: The Journey Begins",
              chapterNumber: 1,
              isRead: true,
              lastPageRead: 1,
              lastReadAt: recentDemoTimestamp(),
              scanlator: "Yomikura",
              mangaId: 10002,
              manga: {
                id: 10002,
                title: "[Demo] Pepper & Carrot",
                thumbnailUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300",
              },
            },
          },
        ],
      },
    };
  },

  // Dummy actions returning default types
  async CreateBackup() {
    return { createBackup: { url: "" } };
  },
  async RestoreBackup() {
    return { restoreBackup: { status: { state: "SUCCESS" } } };
  },
  async ToggleMangaLibrary({ input }: any) {
    demoMembership.set(input.id, input.patch.inLibrary);
    return { updateManga: { manga: { id: input.id, inLibrary: input.patch.inLibrary } } };
  },
  async CreateCategory({ input }: any) {
    return { createCategory: { category: { id: 99, name: input.name, order: 9 } } };
  },
  async DeleteCategory() {
    return { deleteCategory: { clientMutationId: "1" } };
  },
  async UpdateCategory({ input }: any) {
    return { updateCategory: { category: { id: input.id, name: input.patch.name || "", order: 1 } } };
  },
  async UpdateCategoryOrder() {
    return { updateCategoryOrder: { categories: [] } };
  },
  async UpdateMangaCategories({ input }: any) {
    return { updateMangaCategories: { manga: { id: input.mangaId } } };
  },
  async AddExtensionStore({ input }: any) {
    return { addExtensionStore: { extensionStore: { name: "Demo Store", indexUrl: input.indexUrl, isLegacy: false, signingKey: "demo", badgeLabel: "DEMO" } } };
  },
  async RemoveExtensionStore() {
    return { removeExtensionStore: { extensionStore: null } };
  },
  async FetchExtensionCatalog() {
    return { fetchExtensions: { extensions: [] } };
  },
  async ToggleExtensionInstall({ input }: any) {
    return { updateExtension: { extension: { pkgName: input.id, isInstalled: !!input.patch?.install } } };
  },
  async UpdateExtensions({ input }: any) {
    return {
      updateExtensions: {
        extensions: (input.ids || []).map((id: string) => ({
          pkgName: id,
          isInstalled: true,
          hasUpdate: false,
          versionName: "1.0.0",
        })),
      },
    };
  },
  async GetLibraryUpdateStatus() {
    return {
      libraryUpdateStatus: {
        jobsInfo: {
          isRunning: false,
          finishedJobs: 0,
          totalJobs: 0,
          skippedMangasCount: 0,
        },
      },
    };
  },
  async UpdateLibrary() {
    return {
      updateLibrary: {
        updateStatus: {
          jobsInfo: {
            isRunning: false,
            finishedJobs: 2,
            totalJobs: 2,
            skippedMangasCount: 0,
          },
        },
      },
    };
  },
  async GetServerSettings() {
    return { settings: { localSourcePath: "/mock/local", globalUpdateInterval: 12 } };
  },
  async UpdateChapterProgress({ input }: any) {
    return { updateChapter: { chapter: { id: input.id, isRead: !!input.patch?.isRead, lastPageRead: input.patch?.lastPageRead || 0 } } };
  },
  async GetDownloadStatus() {
    return { downloadStatus: { state: "STOPPED", queue: [] } };
  },
  async StartDownloader() {
    return { startDownloader: { downloadStatus: { state: "RUNNING" } } };
  },
  async StopDownloader() {
    return { stopDownloader: { downloadStatus: { state: "STOPPED" } } };
  },
  async ClearDownloader() {
    return { clearDownloader: { downloadStatus: { state: "STOPPED" } } };
  },
  async DequeueChapterDownload() {
    return { dequeueChapterDownload: { downloadStatus: { state: "STOPPED" } } };
  },
  async EnqueueChapterDownload() {
    return { enqueueChapterDownload: { downloadStatus: { state: "STARTED", queue: [] } } };
  },
  async DeleteDownloadedChapter({ input }: any) {
    return { deleteDownloadedChapter: { clientMutationId: input.clientMutationId || "1" } };
  },
  async GetExtensionStores() {
    return { extensionStores: { totalCount: 0, nodes: [] } };
  },
  async GetSourcePreferences() {
    return { source: { id: "mock-source", name: "Yomikura Playground", isConfigurable: false, preferences: [] } };
  },
  async UpdateSourcePreference() {
    return { updateSourcePreference: { preferences: [] } };
  },
  async GetTrackers() {
    return {
      trackers: {
        nodes: [
          {
            id: 1,
            name: "AniList",
            icon: "https://anilist.co/img/icons/favicon-32x32.png",
            isLoggedIn: true,
            isTokenExpired: false,
            supportsPrivateTracking: true,
            authUrl: "",
            scores: ["10", "9", "8", "7", "6", "5"],
            statuses: [
              { name: "Reading", value: 1 },
              { name: "Completed", value: 2 },
              { name: "On Hold", value: 3 },
              { name: "Dropped", value: 4 },
              { name: "Plan to Read", value: 5 },
            ],
          },
          {
            id: 2,
            name: "MyAnimeList",
            icon: "https://myanimelist.net/favicon.ico",
            isLoggedIn: false,
            isTokenExpired: false,
            supportsPrivateTracking: false,
            authUrl: "https://myanimelist.net",
            scores: ["10", "9", "8", "7", "6", "5"],
            statuses: [
              { name: "Reading", value: 1 },
              { name: "Completed", value: 2 },
            ],
          },
        ],
      },
    };
  },
  async GetMangaTrackers({ mangaId }: any) {
    const { manga } = await mockImpl.GetMangaDetails({ id: mangaId });
    return { ...(await mockImpl.GetTrackers()), manga: { id: mangaId, title: manga.title, trackRecords: { nodes: tracksFor(mangaId) } }, chapters: { nodes: mangaId === 10001 || mangaId === 10002 ? [{ chapterNumber: 1 }] : [] } };
  },
  async SearchTracker({ input }: any) {
    return { searchTracker: { trackSearches: [0, 1].map((index) => ({ id: index + 1, trackerId: input.trackerId, remoteId: String(700000 + index), title: `[Demo] ${input.query}${index ? " — alternative edition" : ""}`, coverUrl: "", summary: "Sample search results stay in the demo sandbox.", totalChapters: 24, lastChapterRead: 0, trackingUrl: "https://anilist.co", private: false, publishingType: "Manga", publishingStatus: "Sample" })) } };
  },
  async BindTrackerWork({ input }: any) {
    const record = { ...sampleTrack(input.mangaId, input.trackerId, input.remoteId, "[Demo] Linked work"), private: input.private ?? false };
    demoTracks.set(input.mangaId, [...tracksFor(input.mangaId).filter((item) => item.trackerId !== input.trackerId), record]);
    return { bindTrack: { trackRecord: record } };
  },
  async RefreshTrackerRecord({ input }: any) {
    const record = [...demoTracks.values()].flat().find((item) => item.id === input.recordId);
    if (!record) throw new Error("The demo tracker record is no longer linked.");
    return { fetchTrack: { trackRecord: record } };
  },
  async TrackProgress({ input }: any) {
    return { trackProgress: { trackRecords: tracksFor(input.mangaId) } };
  },
  async UnbindTrack({ input }: any) {
    const record = [...demoTracks.values()].flat().find((item) => item.id === input.recordId);
    if (record) demoTracks.set(record.mangaId, tracksFor(record.mangaId).filter((item) => item.id !== record.id));
    return { unbindTrack: { trackRecord: record ? { id: record.id, mangaId: record.mangaId } : null } };
  },
  async UpdateTrack({ input }: any) {
    const record = [...demoTracks.values()].flat().find((item) => item.id === input.recordId);
    if (!record) throw new Error("The demo tracker record is no longer linked.");
    Object.assign(record, {
      ...(input.lastChapterRead != null ? { lastChapterRead: input.lastChapterRead } : {}),
      ...(input.status != null ? { status: input.status } : {}),
      ...(input.scoreString != null ? { score: Number(input.scoreString), displayScore: input.scoreString } : {}),
      ...(input.private != null ? { private: input.private } : {}),
    });
    return { updateTrack: { trackRecord: record } };
  },

  async LogoutTracker({ input }: any) {
    return {
      logoutTracker: {
        tracker: {
          id: input.id,
          isLoggedIn: false,
        },
      },
    };
  },
};

export const mockSdk: Sdk = mockImpl as unknown as Sdk;
