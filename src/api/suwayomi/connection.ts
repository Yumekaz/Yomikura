import { createGraphqlClient } from "../graphql/client";

export class SuwayomiConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuwayomiConnectionError";
  }
}

export async function testServerConnection(baseUrl: string): Promise<boolean> {
  // Trim trailing slash just in case
  const cleanUrl = baseUrl.replace(/\/$/, "");
  const endpoint = `${cleanUrl}/api/graphql`;

  try {
    const sdk = createGraphqlClient(endpoint, { signal: AbortSignal.timeout(5000) });
    
    // Execute our generated connection test query
    const data = await sdk.ConnectionTest({});

    // If it returns successfully and has a __typename of 'Query', the server is good
    if (data && data.__typename) {
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
