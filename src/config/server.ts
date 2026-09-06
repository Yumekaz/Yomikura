export const DEFAULT_SERVER_BASE_URL = "http://127.0.0.1:4567";

export type ServerUrlValidation =
  | { valid: true; normalizedUrl: string }
  | { valid: false; message: string };

/**
 * Validate the user-controlled Suwayomi base URL before it reaches GraphQL,
 * image, or native page-fetch code. HTTP remains supported for localhost and
 * LAN deployments; public deployments should use HTTPS.
 */
export function validateServerBaseUrl(input: string): ServerUrlValidation {
  const value = input.trim();
  if (!value) return { valid: false, message: "Server URL cannot be empty." };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { valid: false, message: "Enter a complete server URL, such as http://127.0.0.1:4567." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, message: "Server URL must use http:// or https://." };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, message: "Do not put a username or password in the server URL." };
  }
  if (parsed.search || parsed.hash) {
    return { valid: false, message: "Server URL cannot contain a query string or fragment." };
  }
  if (!parsed.hostname) {
    return { valid: false, message: "Server URL must include a hostname." };
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString().replace(/\/$/, ""),
  };
}
