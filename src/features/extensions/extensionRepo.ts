export function validateExtensionRepositoryUrl(value: string): { valid: true; url: string; host: string } | { valid: false; message: string } {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { valid: false, message: "Enter a complete extension repository URL." };
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    return { valid: false, message: "Extension repositories must use HTTPS. Plain HTTP is allowed only for localhost." };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { valid: false, message: "Repository URLs cannot contain credentials, query parameters, or fragments." };
  }
  if (!parsed.pathname.toLowerCase().endsWith(".json")) {
    return { valid: false, message: "Repository URLs must point to a JSON index." };
  }
  return { valid: true, url: parsed.toString(), host: parsed.host };
}
