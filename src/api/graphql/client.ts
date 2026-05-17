import { GraphQLClient } from "graphql-request";
import { getSdk } from "./generated/graphql";

type ClientOptions = ConstructorParameters<typeof GraphQLClient>[1];

// This is an unauthenticated client since Suwayomi typically relies on network access/CORS configuration
export function createGraphqlClient(endpoint: string, options?: ClientOptions) {
  const client = new GraphQLClient(endpoint, { ...options });
  return getSdk(client);
}

// Global default client if needed, though we usually want to derive it from the Zustand store
export type SuwayomiSdk = ReturnType<typeof getSdk>;
