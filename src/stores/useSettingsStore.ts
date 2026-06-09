import { create } from "zustand";
import { persist, StateStorage, createJSONStorage } from "zustand/middleware";
import { testServerConnection } from "../api/suwayomi/connection";
import { DEFAULT_SERVER_BASE_URL } from "../config/server";

export const isTauri = () => typeof window !== "undefined" && (window as any).__TAURI__ !== undefined;

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
  resetAllSettings: () => void;
  
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
            set({ connectionStatus: "connected", errorMessage: "" });
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
      setMockMode: (mock) => set({ mockMode: mock }),
      
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
        };
      },
    }
  )
);
