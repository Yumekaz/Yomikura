import { create } from "zustand";
import { persist, StateStorage, createJSONStorage } from "zustand/middleware";
import { testServerConnection } from "../api/suwayomi/connection";
import { DEFAULT_SERVER_BASE_URL } from "../config/server";

/** Tauri v2 sets `window.isTauri`; v1 used `__TAURI__` when withGlobalTauri is enabled. */
export const isTauri = () => {
  if (typeof window === "undefined") return false;
  const w = window as typeof window & {
    isTauri?: boolean;
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return !!(w.isTauri || w.__TAURI__ || w.__TAURI_INTERNALS__);
};

const customTauriStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (isTauri()) {
      try {
        const { readTextFile, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        const fileExists = await exists(name + ".json", { baseDir: BaseDirectory.AppConfig });
        if (fileExists) {
          return await readTextFile(name + ".json", { baseDir: BaseDirectory.AppConfig });
        }
      } catch (err) {
        console.error("Failed to read settings from Tauri FS:", err);
      }
    }
    return localStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (isTauri()) {
      try {
        const { writeTextFile, mkdir, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        const dirExists = await exists("", { baseDir: BaseDirectory.AppConfig });
        if (!dirExists) {
          await mkdir("", { baseDir: BaseDirectory.AppConfig, recursive: true });
        }
        await writeTextFile(name + ".json", value, { baseDir: BaseDirectory.AppConfig });
        return;
      } catch (err) {
        console.error("Failed to write settings to Tauri FS:", err);
      }
    }
    localStorage.setItem(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    if (isTauri()) {
      try {
        const { remove, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        const fileExists = await exists(name + ".json", { baseDir: BaseDirectory.AppConfig });
        if (fileExists) {
          await remove(name + ".json", { baseDir: BaseDirectory.AppConfig });
          return;
        }
      } catch (err) {
        console.error("Failed to remove settings in Tauri FS:", err);
      }
    }
    localStorage.removeItem(name);
  }
};

export type ConnectionStatus = "disconnected" | "connected" | "error" | "testing";
export type ReaderMode = "WEBTOON" | "LTR" | "RTL";
export type FitMode = "FIT_SCREEN" | "FIT_WIDTH" | "FIT_HEIGHT";
export type PageSpread = "SINGLE" | "DOUBLE" | "DOUBLE_COVER";

export interface ServerProfile {
  id: string;
  name: string;
  url: string;
}

export interface MangaOverride {
  readerMode?: ReaderMode;
  fitMode?: FitMode;
  pageSpread?: PageSpread;
  imageFilters?: Partial<ImageFilters>;
  cropBorders?: boolean;
  pageTransition?: "fade" | "slide" | "none";
  autoDownloadCount?: number;
}

export interface ImageFilters {
  grayscale: number;
  invert: number;
  brightness: number;
  contrast: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  sourceId: string;
  query: string;
  filters: string;
}

export interface SettingsProfile {
  id: string;
  name: string;
  readerMode: ReaderMode;
  fitMode: FitMode;
  pageSpread: PageSpread;
}

interface SettingsState {
  serverBaseUrl: string;
  connectionStatus: ConnectionStatus;
  errorMessage: string;
  readerMode: ReaderMode;
  fitMode: FitMode;
  pageSpread: PageSpread;
  profiles: ServerProfile[];
  activeProfileId: string;
  showNsfw: boolean;
  accentColor: "jade" | "mint" | "gold" | "plum" | "coral";
  coverDensity: "compact" | "normal" | "spacious";
  themeMode: "dark" | "light" | "system";
  mockMode: boolean;
  serverDataPath: string;
  
  // Phase 2 features
  mangaSettingsOverrides: Record<string | number, MangaOverride>;
  autoScrollSpeed: number;
  imageFilters: ImageFilters;
  cropBorders: boolean;
  pageTransition: "fade" | "slide" | "none";
  autoDownloadCount: number;
  customKeybinds: Record<string, string[]>;
  savedSearches: SavedSearch[];

  // Phase 3 features
  language: string;
  autoDeleteReadChapters: boolean;
  settingsProfiles: SettingsProfile[];
  highContrastMode: boolean;
  reducedMotion: boolean;
  infiniteChapterReading: boolean;
  coverDynamicTheme: boolean;
  portableMode: boolean;
  
  // Actions
  setServerBaseUrl: (url: string) => void;
  testConnection: () => Promise<boolean>;
  setReaderMode: (mode: ReaderMode) => void;
  setFitMode: (mode: FitMode) => void;
  setPageSpread: (spread: PageSpread) => void;
  addProfile: (name: string, url: string) => void;
  updateProfile: (id: string, name: string, url: string) => void;
  deleteProfile: (id: string) => void;
  setActiveProfileId: (id: string) => void;
  setShowNsfw: (show: boolean) => void;
  setAccentColor: (color: "jade" | "mint" | "gold" | "plum" | "coral") => void;
  setCoverDensity: (density: "compact" | "normal" | "spacious") => void;
  setThemeMode: (mode: "dark" | "light" | "system") => void;
  setMockMode: (mock: boolean) => void;
  setServerDataPath: (path: string) => void;
  resetAllSettings: () => void;
  
  // Phase 2 actions
  setMangaOverride: (mangaId: string | number, override: Partial<MangaOverride>) => void;
  clearMangaOverride: (mangaId: string | number) => void;
  setAutoScrollSpeed: (speed: number) => void;
  setImageFilters: (filters: Partial<ImageFilters>) => void;
  setCropBorders: (crop: boolean) => void;
  setPageTransition: (transition: "fade" | "slide" | "none") => void;
  setAutoDownloadCount: (count: number) => void;
  setCustomKeybinds: (keybinds: Record<string, string[]>) => void;
  addSavedSearch: (name: string, sourceId: string, query: string, filters: string) => void;
  deleteSavedSearch: (id: string) => void;

  // Phase 3 actions
  setLanguage: (lang: string) => void;
  setAutoDeleteReadChapters: (deleteChapters: boolean) => void;
  setHighContrastMode: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setInfiniteChapterReading: (enabled: boolean) => void;
  setCoverDynamicTheme: (enabled: boolean) => void;
  setPortableMode: (enabled: boolean) => void;
  addSettingsProfile: (name: string, profile: Omit<SettingsProfile, "id" | "name">) => void;
  deleteSettingsProfile: (id: string) => void;
  applySettingsProfile: (id: string) => void;
  
  // Derived
  getGraphqlEndpoint: () => string;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      serverBaseUrl: DEFAULT_SERVER_BASE_URL,
      connectionStatus: "disconnected",
      errorMessage: "",
      readerMode: "WEBTOON",
      fitMode: "FIT_SCREEN",
      pageSpread: "SINGLE",
      profiles: [
        { id: "default", name: "Default Server", url: DEFAULT_SERVER_BASE_URL }
      ],
      activeProfileId: "default",
      showNsfw: false,
      accentColor: "jade",
      coverDensity: "normal",
      themeMode: "dark",
      mockMode: false,
      serverDataPath: "",
      
      // Phase 2 default state
      mangaSettingsOverrides: {},
      autoScrollSpeed: 1,
      imageFilters: { grayscale: 0, invert: 0, brightness: 100, contrast: 100 },
      cropBorders: false,
      pageTransition: "none",
      autoDownloadCount: 0,
      customKeybinds: {
        prevPage: ["arrowleft", "a", "backspace"],
        nextPage: ["arrowright", "d", " ", "enter"],
        toggleOverlay: ["escape"],
        cycleFit: ["w"],
        cycleSpread: ["s"]
      },
      savedSearches: [],

      // Phase 3 default state
      language: "en",
      autoDeleteReadChapters: false,
      settingsProfiles: [],
      highContrastMode: false,
      reducedMotion: false,
      infiniteChapterReading: true,
      coverDynamicTheme: false,
      portableMode: false,

      setServerBaseUrl: (url: string) => {
        set((state) => {
          // Keep active profile synced if it changes from settings URL input
          const updatedProfiles = state.profiles.map(p => 
            p.id === state.activeProfileId ? { ...p, url: url.trim() } : p
          );
          return {
            serverBaseUrl: url.trim(),
            profiles: updatedProfiles,
            connectionStatus: "disconnected",
            errorMessage: "",
          };
        });
      },

      testConnection: async () => {
        const { serverBaseUrl } = get();
        if (!serverBaseUrl) {
          set({ connectionStatus: "error", errorMessage: "Server URL cannot be empty." });
          return false;
        }

        set({ connectionStatus: "testing", errorMessage: "" });

        try {
          const success = await testServerConnection(serverBaseUrl);
          if (success) {
            set({ connectionStatus: "connected", errorMessage: "", mockMode: false });
            return true;
          }
          return false;
        } catch (error: any) {
          set({ connectionStatus: "error", errorMessage: error.message || "Connection failed" });
          return false;
        }
      },

      setReaderMode: (mode: ReaderMode) => set({ readerMode: mode }),
      setFitMode: (mode: FitMode) => set({ fitMode: mode }),
      setPageSpread: (spread: PageSpread) => set({ pageSpread: spread }),

      addProfile: (name: string, url: string) => {
        const newId = Math.random().toString(36).substring(2, 9);
        const newProfile: ServerProfile = { id: newId, name: name.trim(), url: url.trim() };
        set((state) => ({
          profiles: [...state.profiles, newProfile],
          activeProfileId: newId,
          serverBaseUrl: url.trim(),
          connectionStatus: "disconnected",
          errorMessage: "",
        }));
      },

      updateProfile: (id: string, name: string, url: string) => {
        set((state) => {
          const updatedProfiles = state.profiles.map(p => 
            p.id === id ? { ...p, name: name.trim(), url: url.trim() } : p
          );
          const isCurrentActive = state.activeProfileId === id;
          return {
            profiles: updatedProfiles,
            ...(isCurrentActive ? { serverBaseUrl: url.trim() } : {}),
          };
        });
      },

      deleteProfile: (id: string) => {
        const { profiles } = get();
        if (profiles.length <= 1) return;

        set((state) => {
          const updatedProfiles = state.profiles.filter(p => p.id !== id);
          let nextActiveId = state.activeProfileId;
          let nextUrl = state.serverBaseUrl;

          if (state.activeProfileId === id) {
            nextActiveId = updatedProfiles[0].id;
            nextUrl = updatedProfiles[0].url;
          }

          return {
            profiles: updatedProfiles,
            activeProfileId: nextActiveId,
            serverBaseUrl: nextUrl,
            connectionStatus: "disconnected",
            errorMessage: "",
          };
        });
      },

      setActiveProfileId: (id: string) => {
        const { profiles } = get();
        const profile = profiles.find(p => p.id === id);
        if (profile) {
          set({
            activeProfileId: id,
            serverBaseUrl: profile.url,
            connectionStatus: "disconnected",
            errorMessage: "",
          });
        }
      },

      setShowNsfw: (show: boolean) => set({ showNsfw: show }),
      setAccentColor: (color) => set({ accentColor: color }),
      setCoverDensity: (density) => set({ coverDensity: density }),
      setThemeMode: (mode) => set({ themeMode: mode }),
      setMockMode: (mock: boolean) => set({ mockMode: mock }),
      setServerDataPath: (path: string) => set({ serverDataPath: path.trim() }),
      
      // Phase 2 actions implementation
      setMangaOverride: (mangaId, override) => set((state) => ({
        mangaSettingsOverrides: {
          ...state.mangaSettingsOverrides,
          [mangaId]: {
            ...state.mangaSettingsOverrides[mangaId],
            ...override
          }
        }
      })),
      clearMangaOverride: (mangaId) => set((state) => {
        const copy = { ...state.mangaSettingsOverrides };
        delete copy[mangaId];
        return { mangaSettingsOverrides: copy };
      }),
      setAutoScrollSpeed: (speed) => set({ autoScrollSpeed: speed }),
      setImageFilters: (filters) => set((state) => ({
        imageFilters: { ...state.imageFilters, ...filters }
      })),
      setCropBorders: (crop) => set({ cropBorders: crop }),
      setPageTransition: (transition) => set({ pageTransition: transition }),
      setAutoDownloadCount: (count) => set({ autoDownloadCount: count }),
      setCustomKeybinds: (keybinds) => set({ customKeybinds: keybinds }),
      addSavedSearch: (name, sourceId, query, filters) => {
        const newSearch: SavedSearch = {
          id: Math.random().toString(36).substring(2, 9),
          name: name.trim(),
          sourceId,
          query,
          filters
        };
        set((state) => ({
          savedSearches: [...state.savedSearches, newSearch]
        }));
      },
      deleteSavedSearch: (id) => set((state) => ({
        savedSearches: state.savedSearches.filter(s => s.id !== id)
      })),

      // Phase 3 actions implementation
      setLanguage: (lang) => set({ language: lang }),
      setAutoDeleteReadChapters: (deleteChapters) => set({ autoDeleteReadChapters: deleteChapters }),
      setHighContrastMode: (enabled) => set({ highContrastMode: enabled }),
      setReducedMotion: (enabled) => set({ reducedMotion: enabled }),
      setInfiniteChapterReading: (enabled) => set({ infiniteChapterReading: enabled }),
      setCoverDynamicTheme: (enabled) => set({ coverDynamicTheme: enabled }),
      setPortableMode: (enabled) => set({ portableMode: enabled }),
      addSettingsProfile: (name, profile) => {
        const newProfile: SettingsProfile = {
          id: Math.random().toString(36).substring(2, 9),
          name: name.trim(),
          ...profile
        };
        set((state) => ({
          settingsProfiles: [...state.settingsProfiles, newProfile]
        }));
      },
      deleteSettingsProfile: (id) => set((state) => ({
        settingsProfiles: state.settingsProfiles.filter(p => p.id !== id)
      })),
      applySettingsProfile: (id) => {
        const profile = get().settingsProfiles.find(p => p.id === id);
        if (profile) {
          set({
            readerMode: profile.readerMode,
            fitMode: profile.fitMode,
            pageSpread: profile.pageSpread
          });
        }
      },
      
      resetAllSettings: () => {
        set({
          serverBaseUrl: DEFAULT_SERVER_BASE_URL,
          connectionStatus: "disconnected",
          errorMessage: "",
          readerMode: "WEBTOON",
          fitMode: "FIT_SCREEN",
          pageSpread: "SINGLE",
          profiles: [
            { id: "default", name: "Default Server", url: DEFAULT_SERVER_BASE_URL }
          ],
          activeProfileId: "default",
          showNsfw: false,
          accentColor: "jade",
          coverDensity: "normal",
          themeMode: "dark",
          mockMode: false,
          serverDataPath: "",
          mangaSettingsOverrides: {},
          autoScrollSpeed: 1,
          imageFilters: { grayscale: 0, invert: 0, brightness: 100, contrast: 100 },
          cropBorders: false,
          pageTransition: "none",
          autoDownloadCount: 0,
          customKeybinds: {
            prevPage: ["arrowleft", "a", "backspace"],
            nextPage: ["arrowright", "d", " ", "enter"],
            toggleOverlay: ["escape"],
            cycleFit: ["w"],
            cycleSpread: ["s"]
          },
          savedSearches: [],
          language: "en",
          autoDeleteReadChapters: false,
          settingsProfiles: [],
          highContrastMode: false,
          reducedMotion: false,
          infiniteChapterReading: true,
          coverDynamicTheme: false,
          portableMode: false,
        });

      },

      getGraphqlEndpoint: () => {
        const url = get().serverBaseUrl.replace(/\/$/, "");
        return url ? `${url}/api/graphql` : "";
      },
    }),
    {
      name: "yomikura-settings",
      storage: createJSONStorage(() => customTauriStorage),
      partialize: (state) => ({ 
        serverBaseUrl: state.serverBaseUrl,
        connectionStatus: state.connectionStatus === "testing" ? "disconnected" : state.connectionStatus,
        errorMessage: state.errorMessage,
        readerMode: state.readerMode,
        fitMode: state.fitMode,
        pageSpread: state.pageSpread,
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
        showNsfw: state.showNsfw,
        accentColor: state.accentColor,
        coverDensity: state.coverDensity,
        themeMode: state.themeMode,
        mockMode: state.mockMode,
        serverDataPath: state.serverDataPath,
        mangaSettingsOverrides: state.mangaSettingsOverrides,
        autoScrollSpeed: state.autoScrollSpeed,
        imageFilters: state.imageFilters,
        cropBorders: state.cropBorders,
        pageTransition: state.pageTransition,
        autoDownloadCount: state.autoDownloadCount,
        customKeybinds: state.customKeybinds,
        savedSearches: state.savedSearches,
        language: state.language,
        autoDeleteReadChapters: state.autoDeleteReadChapters,
        settingsProfiles: state.settingsProfiles,
        highContrastMode: state.highContrastMode,
        reducedMotion: state.reducedMotion,
        infiniteChapterReading: state.infiniteChapterReading,
        coverDynamicTheme: state.coverDynamicTheme,
        portableMode: state.portableMode,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState> | undefined;
        
        const mergedBaseUrl = persisted?.serverBaseUrl?.trim() || currentState.serverBaseUrl;
        const mergedProfiles = persisted?.profiles && persisted.profiles.length > 0
          ? persisted.profiles
          : [{ id: "default", name: "Default Server", url: mergedBaseUrl }];
        const mergedActiveId = persisted?.activeProfileId || mergedProfiles[0].id;

        return {
          ...currentState,
          ...persisted,
          serverBaseUrl: mergedBaseUrl,
          profiles: mergedProfiles,
          activeProfileId: mergedActiveId,
          connectionStatus:
            persisted?.connectionStatus === "testing"
              ? "disconnected"
              : persisted?.connectionStatus || currentState.connectionStatus,
          errorMessage: persisted?.errorMessage || "",
          showNsfw: persisted?.showNsfw ?? currentState.showNsfw,
          accentColor: persisted?.accentColor ?? currentState.accentColor,
          coverDensity: persisted?.coverDensity ?? currentState.coverDensity,
          themeMode: persisted?.themeMode ?? currentState.themeMode,
          mockMode: persisted?.mockMode ?? currentState.mockMode,
          serverDataPath: persisted?.serverDataPath ?? currentState.serverDataPath,
          mangaSettingsOverrides: persisted?.mangaSettingsOverrides ?? currentState.mangaSettingsOverrides,
          autoScrollSpeed: persisted?.autoScrollSpeed ?? currentState.autoScrollSpeed,
          imageFilters: persisted?.imageFilters ?? currentState.imageFilters,
          cropBorders: persisted?.cropBorders ?? currentState.cropBorders,
          pageTransition: persisted?.pageTransition ?? currentState.pageTransition,
          autoDownloadCount: persisted?.autoDownloadCount ?? currentState.autoDownloadCount,
          customKeybinds: persisted?.customKeybinds ?? currentState.customKeybinds,
          savedSearches: persisted?.savedSearches ?? currentState.savedSearches,
          language: persisted?.language ?? currentState.language,
          autoDeleteReadChapters: persisted?.autoDeleteReadChapters ?? currentState.autoDeleteReadChapters,
          settingsProfiles: persisted?.settingsProfiles ?? currentState.settingsProfiles,
          highContrastMode: persisted?.highContrastMode ?? currentState.highContrastMode,
          reducedMotion: persisted?.reducedMotion ?? currentState.reducedMotion,
          infiniteChapterReading: persisted?.infiniteChapterReading ?? currentState.infiniteChapterReading,
          coverDynamicTheme: persisted?.coverDynamicTheme ?? currentState.coverDynamicTheme,
          portableMode: persisted?.portableMode ?? currentState.portableMode,
        };
      },
    }
  )
);
