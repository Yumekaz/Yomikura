import { create } from "zustand";
import { persist } from "zustand/middleware";
import { testServerConnection } from "../api/suwayomi/connection";
import { DEFAULT_SERVER_BASE_URL } from "../config/server";

export type ConnectionStatus = "disconnected" | "connected" | "error" | "testing";
export type ReaderMode = "WEBTOON" | "LTR" | "RTL";
export type FitMode = "FIT_SCREEN" | "FIT_WIDTH" | "FIT_HEIGHT";
export type PageSpread = "SINGLE" | "DOUBLE" | "DOUBLE_COVER";

interface SettingsState {
  serverBaseUrl: string;
  connectionStatus: ConnectionStatus;
  errorMessage: string;
  readerMode: ReaderMode;
  fitMode: FitMode;
  pageSpread: PageSpread;
  
  // Actions
  setServerBaseUrl: (url: string) => void;
  testConnection: () => Promise<boolean>;
  setReaderMode: (mode: ReaderMode) => void;
  setFitMode: (mode: FitMode) => void;
  setPageSpread: (spread: PageSpread) => void;
  
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

      setServerBaseUrl: (url: string) => {
        set({
          serverBaseUrl: url.trim(),
          connectionStatus: "disconnected",
          errorMessage: "",
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

      getGraphqlEndpoint: () => {
        const url = get().serverBaseUrl.replace(/\/$/, "");
        return url ? `${url}/api/graphql` : "";
      },
    }),
    {
      name: "yomikura-settings",
      partialize: (state) => ({ 
        serverBaseUrl: state.serverBaseUrl,
        connectionStatus: state.connectionStatus === "testing" ? "disconnected" : state.connectionStatus,
        errorMessage: state.errorMessage,
        readerMode: state.readerMode,
        fitMode: state.fitMode,
        pageSpread: state.pageSpread,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState> | undefined;

        return {
          ...currentState,
          ...persisted,
          serverBaseUrl: persisted?.serverBaseUrl?.trim() || currentState.serverBaseUrl,
          connectionStatus:
            persisted?.connectionStatus === "testing"
              ? "disconnected"
              : persisted?.connectionStatus || currentState.connectionStatus,
          errorMessage: persisted?.errorMessage || "",
        };
      },
    }
  )
);
