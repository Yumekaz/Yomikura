import type { SuwayomiSdk } from "../../api/graphql/client";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { fetchAllExtensions } from "../../api/library/fetchAllExtensions";

export const EXTENSION_CHECK_INTERVAL = 12 * 60 * 60 * 1_000;
const CHECKS_KEY = "yomikura-extension-checks-v1";
type CheckStorage = Pick<Storage, "getItem" | "setItem">;
type CheckSdk = Pick<SuwayomiSdk, "GetExtensions" | "GetExtensionStores" | "FetchExtensionCatalog">;

export function extensionCheckKey(backend: ProgressBackend) {
  return JSON.stringify([backend.key, backend.libraryId ?? null]);
}

function readChecks(storage?: CheckStorage): Record<string, number> {
  try {
    const checks: unknown = JSON.parse(storage?.getItem(CHECKS_KEY) ?? "{}");
    if (!checks || typeof checks !== "object" || Array.isArray(checks)) return {};
    return Object.fromEntries(Object.entries(checks).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0)) as Record<string, number>;
  } catch { return {}; }
}

/** Catalogue discovery only. Installing an extension remains an explicit user action. */
export async function checkExtensionUpdates(
  sdk: CheckSdk,
  backend: ProgressBackend,
  options: { force?: boolean; signal?: AbortSignal; storage?: CheckStorage; now?: number; isCurrent: () => boolean },
) {
  const now = options.now ?? Date.now(), checks = readChecks(options.storage), key = extensionCheckKey(backend);
  let checkedAt = checks[key] ?? 0, refreshError: string | undefined;
  const assertCurrent = () => {
    options.signal?.throwIfAborted();
    if (!options.isCurrent()) throw new Error("The selected library changed during the extension check.");
  };
  assertCurrent();
  if (!backend.isDemo && (options.force || checkedAt > now || now - checkedAt >= EXTENSION_CHECK_INTERVAL)) {
    try {
      // Check only stores the reader already configured. Never add a publisher.
      const stores = await sdk.GetExtensionStores(undefined, undefined, options.signal);
      assertCurrent();
      if ((stores.extensionStores?.nodes?.length ?? 0) > 0) {
        const result = await sdk.FetchExtensionCatalog({ input: {} }, undefined, options.signal);
        assertCurrent();
        if (!result.fetchExtensions) throw new Error("The library did not confirm its source update check.");
        checkedAt = now;
      }
    } catch (error) {
      assertCurrent();
      refreshError = error instanceof Error ? error.message : "Source updates could not be checked.";
    }
  }
  const catalogue = await fetchAllExtensions(sdk, options.signal);
  assertCurrent();
  if (checkedAt !== (checks[key] ?? 0)) {
    try { options.storage?.setItem(CHECKS_KEY, JSON.stringify({ ...readChecks(options.storage), [key]: checkedAt })); } catch { /* Storage restrictions never block source browsing. */ }
  }
  return { ...catalogue, checkedAt, refreshError };
}
