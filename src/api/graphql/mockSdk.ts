import { Sdk } from "./generated/graphql";

// A high-fidelity mock implementation of the Suwayomi SDK
const mockImpl: any = {
  async ConnectionTest() {
    return { __typename: "Query" };
  },

  async GetCategories() {
    return {
      categories: {
        edges: [
          { node: { id: 1, name: "Default", order: 1 } },
          { node: { id: 2, name: "Favorites", order: 2 } },
        ],
      },
    };
  },

  async GetLibrary() {
    return {
      mangas: {
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [
          {
            node: {
              id: 10001,
              title: "[Demo] Sita's Sister",
              thumbnailUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300",
              unreadCount: 3,
              downloadCount: 0,
              categories: { edges: [{ node: { id: 1 } }] },
            },
          },
          {
            node: {
              id: 10002,
              title: "[Demo] Pepper & Carrot",
              thumbnailUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300",
              unreadCount: 5,
              downloadCount: 0,
              categories: { edges: [{ node: { id: 1 } }] },
            },
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
        inLibrary: true,
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
              lastReadAt: "2026-06-08T10:00:00Z",
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
    return { updateManga: { manga: { id: input.id, inLibrary: true } } };
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
  async SetExtensionRepos() {
    return { setSettings: { settings: { extensionRepos: [] } } };
  },
  async FetchExtensionCatalog() {
    return { fetchExtensions: { extensions: [] } };
  },
  async ToggleExtensionInstall({ input }: any) {
    return { updateExtension: { extension: { pkgName: input.id, isInstalled: !!input.patch?.install } } };
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
  async DeleteDownloadedChapter({ input }: any) {
    return { deleteDownloadedChapter: { clientMutationId: input.clientMutationId || "1" } };
  },
  async GetExtensionRepos() {
    return { settings: { extensionRepos: [] } };
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
    return {
      trackers: {
        nodes: [
          {
            id: 1,
            name: "AniList",
            icon: "https://anilist.co/img/icons/favicon-32x32.png",
            isLoggedIn: true,
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
            authUrl: "https://myanimelist.net",
            scores: ["10", "9", "8", "7", "6", "5"],
            statuses: [
              { name: "Reading", value: 1 },
              { name: "Completed", value: 2 },
            ],
          },
        ],
      },
      manga: {
        id: mangaId,
        trackRecords: {
          nodes: [
            {
              id: 501,
              trackerId: 1,
              mangaId: mangaId,
              title: mangaId === 10001 ? "Sita's Sister (Synced)" : "Pepper & Carrot (Synced)",
              lastChapterRead: 1,
              totalChapters: 24,
              score: 9,
              status: 1,
              remoteUrl: "https://anilist.co",
            },
          ],
        },
      },
    };
  },
  async TrackProgress({ input }: any) {
    return {
      trackProgress: {
        trackRecords: [
          {
            id: 501,
            trackerId: 1,
            mangaId: input.mangaId,
            title: "Synced Manga",
            lastChapterRead: 1,
          },
        ],
      },
    };
  },
  async UnbindTrack({ input }: any) {
    return {
      unbindTrack: {
        trackRecord: {
          id: input.recordId,
          mangaId: 10001,
        },
      },
    };
  },
  async UpdateTrack({ input }: any) {
    return {
      updateTrack: {
        trackRecord: {
          id: input.recordId,
          trackerId: 1,
          mangaId: 10001,
          title: "Demo Manga (Updated)",
          lastChapterRead: input.lastChapterRead,
          totalChapters: 24,
          score: parseInt(input.scoreString) || 9,
          status: input.status,
          remoteUrl: "https://anilist.co",
        },
      },
    };
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
