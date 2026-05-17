import { create } from "zustand";
import { persist } from "zustand/middleware";
import { testServerConnection } from "../api/suwayomi/connection";

export type ConnectionStatus = "disconnected" | "connected" | "error" | "testing";
export type ReaderMode = "WEBTOON" | "LTR" | "RTL";

interface SettingsState {
  serverBaseUrl: string;
  connectionStatus: ConnectionStatus;
  errorMessage: string;
  readerMode: ReaderMode;
  
  // Actions
  setServerBaseUrl: (url: string) => void;
  testConnection: () => Promise<boolean>;
  setReaderMode: (mode: ReaderMode) => void;
  
  // Derived
  getGraphqlEndpoint: () => string;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      serverBaseUrl: "",
      connectionStatus: "disconnected",
      errorMessage: "",
      readerMode: "WEBTOON",

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
      }),
    }
  )
);
