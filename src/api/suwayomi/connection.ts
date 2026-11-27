import { createGraphqlClient } from "../graphql/client";
import { validateServerBaseUrl } from "../../config/server";
import { establishLibraryIdentity, readLibraryIdentity } from "./libraryIdentity";
import { rememberLibrary } from "./librarySession";
import { pendingLibraryRestore } from "./restoreIdentity";
import { assertManagedEngineSession, movingManagedLibrary, retiredManagedLibrary } from "./managedLibraryLocations";

export class SuwayomiConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuwayomiConnectionError";
  }
}

export async function testServerConnection(baseUrl: string, expectedLibraryId?: string): Promise<boolean> {
  const validation = validateServerBaseUrl(baseUrl);
  if (!validation.valid) {
    throw new SuwayomiConnectionError(validation.message);
  }

  const cleanUrl = validation.normalizedUrl;
  const endpoint = `${cleanUrl}/api/graphql`;

  try {
    await assertManagedEngineSession(cleanUrl);
    const sdk = createGraphqlClient(endpoint, { signal: AbortSignal.timeout(5000) });
    
    // Execute our generated connection test query
    const data = await sdk.ConnectionTest({});

    // If it returns successfully and has a __typename of 'Query', the server is good
    if (data && data.__typename) {
      if (pendingLibraryRestore(cleanUrl)) throw new SuwayomiConnectionError("A restore needs confirmation. Open Backups to check its status; device updates remain paused.");
      if (movingManagedLibrary(cleanUrl)) throw new SuwayomiConnectionError("Device data is still being moved for this local library. Let the managed library finish starting.");
      // An explicit connection establishes the current marker. Mutations only verify it.
      const identity = expectedLibraryId ? await readLibraryIdentity(cleanUrl) : await establishLibraryIdentity(cleanUrl);
      if (!identity || expectedLibraryId && identity.marker !== expectedLibraryId) {
        throw new SuwayomiConnectionError("The local library identity changed while it was starting. Retry with the original library folder.");
      }
      if (retiredManagedLibrary(cleanUrl, identity.marker)) throw new SuwayomiConnectionError("This local library has moved. Open its managed profile to connect to the new address.");
      rememberLibrary(cleanUrl, identity);
      return true;
    }

    throw new SuwayomiConnectionError("Server returned unexpected GraphQL response.");
  } catch (error: any) {
    if (error instanceof SuwayomiConnectionError) {
      throw error;
    }
    
    // Handle graphql-request specific errors or generic fetch errors
    const message = error.message || String(error);

    if (message.includes("TimeoutError") || error.name === "TimeoutError") {
      throw new SuwayomiConnectionError("Connection timed out. Server is unreachable.");
    }
    if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("ECONNREFUSED")) {
      throw new SuwayomiConnectionError("Network error or CORS issue. Please check the URL and ensure the server is running.");
    }
    if (error.response && error.response.status === 400) {
      throw new SuwayomiConnectionError(`Server returned status 400. Is this a valid Suwayomi endpoint?`);
    }

    throw new SuwayomiConnectionError(`Connection failed: ${message}`);
  }
}
