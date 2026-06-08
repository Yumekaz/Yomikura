import { GraphQLClient } from "graphql-request";
import { getSdk } from "./generated/graphql";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { mockSdk } from "./mockSdk";

type ClientOptions = ConstructorParameters<typeof GraphQLClient>[1];

// This is an unauthenticated client since Suwayomi typically relies on network access/CORS configuration
export function createGraphqlClient(endpoint: string, options?: ClientOptions) {
  try {
    const isMockMode = useSettingsStore.getState().mockMode;
    if (isMockMode) {
      return mockSdk;
    }
  } catch {
    // Safe fallback if settings store is not initialized
  }

  const client = new GraphQLClient(endpoint, { ...options });
  return getSdk(client);
}


// Global default client if needed, though we usually want to derive it from the Zustand store
export type SuwayomiSdk = ReturnType<typeof getSdk>;
