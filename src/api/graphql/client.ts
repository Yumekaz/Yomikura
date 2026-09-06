import { GraphQLClient } from "graphql-request";
import { getSdk } from "./generated/graphql";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { validateServerBaseUrl } from "../../config/server";
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

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("The configured Suwayomi GraphQL endpoint is invalid.");
  }

  if (!/\/api\/graphql\/?$/i.test(parsedEndpoint.pathname)) {
    throw new Error("The configured Suwayomi GraphQL endpoint is invalid.");
  }
  if (parsedEndpoint.search || parsedEndpoint.hash) {
    throw new Error("The configured Suwayomi GraphQL endpoint cannot contain a query string or fragment.");
  }

  const baseUrl = new URL(parsedEndpoint.toString());
  baseUrl.pathname = baseUrl.pathname.replace(/\/api\/graphql\/?$/i, "") || "/";
  baseUrl.search = "";
  baseUrl.hash = "";
  const validation = validateServerBaseUrl(baseUrl.toString());
  if (!validation.valid) throw new Error(validation.message);

  const client = new GraphQLClient(endpoint, { ...options });
  return getSdk(client);
}


// Global default client if needed, though we usually want to derive it from the Zustand store
export type SuwayomiSdk = ReturnType<typeof getSdk>;
