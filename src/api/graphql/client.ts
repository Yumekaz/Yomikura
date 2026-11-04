import type { GraphQLClient } from "graphql-request";
import { LibraryGraphqlTransport, type GraphqlOptions } from "./transport";
import { getSdk } from "./generated/graphql";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { validateServerBaseUrl } from "../../config/server";
import { mockSdk } from "./mockSdk";
import { metadataRead, metadataScope } from "../suwayomi/libraryMetadata";
import { assertLibrarySession, rememberedLibrary } from "../suwayomi/librarySession";

type ClientOptions = GraphqlOptions;
type MetadataContext = { scope?: string; preferSaved: () => boolean; verify: () => Promise<void> };
const metadataContexts = new WeakMap<object, MetadataContext>();
export const sdkMetadataContext = (sdk: object) => metadataContexts.get(sdk);

// This is an unauthenticated client since Suwayomi typically relies on network access/CORS configuration
export function createGraphqlClient(endpoint: string, options?: ClientOptions, mode?: "live" | "demo") {
  try {
    const isMockMode = mode ? mode === "demo" : useSettingsStore.getState().mockMode;
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

  // Codegen only calls request({ document, variables, requestHeaders, signal }).
  // Its declared class also has unused administration methods; keep that adapter boundary here.
  const sdk = getSdk(new LibraryGraphqlTransport(endpoint, options) as unknown as GraphQLClient);
  const marker = options && Object.prototype.hasOwnProperty.call(options, "libraryId") ? options.libraryId ?? undefined : rememberedLibrary(validation.normalizedUrl)?.marker;
  const scope = marker ? metadataScope(validation.normalizedUrl, marker) : undefined;
  const verify = () => marker ? assertLibrarySession(validation.normalizedUrl, marker) : Promise.resolve();
  const preferSaved = () => {
    const settings = useSettingsStore.getState();
    return settings.connectionStatus === "error" && settings.serverBaseUrl.replace(/\/+$/, "") === validation.normalizedUrl.replace(/\/+$/, "");
  };
  const categories = sdk.GetCategories.bind(sdk), details = sdk.GetMangaDetails.bind(sdk);
  sdk.GetCategories = (...args: Parameters<typeof categories>) => metadataRead(scope, "categories", async () => { const value = await categories(...args); await verify(); return value; }, { preferSaved: preferSaved(), signal: args[2] });
  sdk.GetMangaDetails = (...args: Parameters<typeof details>) => metadataRead(scope, `manga:${args[0].id}`, async () => { const value = await details(...args); await verify(); return value; }, { preferSaved: preferSaved(), signal: args[2] });
  metadataContexts.set(sdk, { scope, preferSaved, verify });
  return sdk;
}


// Global default client if needed, though we usually want to derive it from the Zustand store
export type SuwayomiSdk = ReturnType<typeof getSdk>;
