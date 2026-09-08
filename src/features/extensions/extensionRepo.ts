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

const SNAPSHOT_KEY = "yomikura-extension-repositories-v1";

export type ExtensionRepositorySnapshot = { serverBaseUrl: string; repositories: string[]; savedAt: number };

export function readRepositorySnapshots(storage: Pick<Storage, "getItem">): ExtensionRepositorySnapshot[] {
  try {
    const parsed = JSON.parse(storage.getItem(SNAPSHOT_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ExtensionRepositorySnapshot =>
      typeof item?.serverBaseUrl === "string" &&
      typeof item?.savedAt === "number" &&
      Array.isArray(item?.repositories) &&
      item.repositories.every((url: unknown) => typeof url === "string"),
    );
  } catch {
    return [];
  }
}

export function saveRepositorySnapshot(
  storage: Pick<Storage, "getItem" | "setItem">,
  serverBaseUrl: string,
  repositories: string[],
  savedAt = Date.now(),
) {
  if (repositories.length === 0) return;
  const normalizedServer = serverBaseUrl.replace(/\/$/, "");
  const snapshots = readRepositorySnapshots(storage).filter((item) => item.serverBaseUrl !== normalizedServer);
  snapshots.push({ serverBaseUrl: normalizedServer, repositories: [...new Set(repositories)], savedAt });
  storage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(-8)));
}

export function getRepositorySnapshot(storage: Pick<Storage, "getItem">, serverBaseUrl: string) {
  const normalizedServer = serverBaseUrl.replace(/\/$/, "");
  return readRepositorySnapshots(storage).find((item) => item.serverBaseUrl === normalizedServer) ?? null;
}
