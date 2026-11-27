import { validLibraryMarker } from "./libraryIdentity";
import { validateServerBaseUrl } from "../../config/server";

const KEY = "yomikura-managed-library-locations-v1";
const localAddress = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/;

export interface ManagedLibraryLocation {
  root: string;
  server: string;
  marker: string;
  movingTo?: string;
  retired?: string[];
}

export function managedLibraryLocations(): ManagedLibraryLocation[] {
  if (typeof localStorage === "undefined") return [];
  const locations = JSON.parse(localStorage.getItem(KEY) ?? "[]") as ManagedLibraryLocation[];
  if (!Array.isArray(locations) || locations.some((item) => !item || typeof item.root !== "string" || !item.root
    || !localAddress.test(item.server) || !validLibraryMarker(item.marker)
    || item.movingTo !== undefined && !localAddress.test(item.movingTo)
    || item.retired !== undefined && (!Array.isArray(item.retired) || item.retired.some((server) => !localAddress.test(server))))) {
    throw new Error("Saved local library locations could not be read. Device data was retained.");
  }
  return locations;
}

export function recordManagedLibraryLocation(location: ManagedLibraryLocation) {
  const locations = managedLibraryLocations().filter(({ root }) => root !== location.root);
  localStorage.setItem(KEY, JSON.stringify([...locations, location]));
}

export function movingManagedLibrary(server: string) {
  if (!localAddress.test(server)) return false;
  return managedLibraryLocations().some(({ server: from, movingTo }) => !!movingTo && (server === from || server === movingTo));
}

export function retiredManagedLibrary(server: string, marker?: string) {
  if (!marker || !localAddress.test(server)) return false;
  return managedLibraryLocations().some((location) => location.marker === marker && location.retired?.includes(server));
}

export const isManagedLoopbackAddress = (server: string) => localAddress.test(server);

interface VerifiedEngine {
  profileId: string;
  dataPath: string;
  server: string;
}

let engine: VerifiedEngine | undefined;

export function allowManagedEngineSession(location: VerifiedEngine) {
  engine = location;
  return () => { if (engine === location) engine = undefined; };
}

export async function assertManagedEngineSession(server: string) {
  if (typeof window === "undefined" || !localAddress.test(server)) return;
  // The settings store calls the same transport when testing a connection.
  // Resolve it at request time, after transport initialization.
  const { isTauri, useSettingsStore } = await import("../../stores/useSettingsStore");
  if (!isTauri()) return;
  const settings = useSettingsStore.getState();
  const address = validateServerBaseUrl(settings.serverBaseUrl);
  const isManaged = settings.serverDataPath && (settings.managedLibraryProfileId === settings.activeProfileId
    || !settings.managedLibraryProfileId && settings.activeProfileId === "default");
  if (isManaged && address.valid && address.normalizedUrl === server
    && (engine?.server !== server || engine.profileId !== settings.activeProfileId || engine.dataPath !== settings.serverDataPath)) {
    throw new Error("Yomikura is still verifying the local library. Saved data remains available on this device.");
  }
}

export function assertManagedDeviceDataAddress(server: string, marker?: string | null) {
  if (movingManagedLibrary(server) || retiredManagedLibrary(server, marker ?? undefined)) {
    throw new Error("The local library address is changing. Open the managed library again before saving changes.");
  }
}
