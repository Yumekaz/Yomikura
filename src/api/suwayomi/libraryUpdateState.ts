import { progressBackend, type ProgressBackend } from "./backendIdentity";
import { useSettingsStore } from "../../stores/useSettingsStore";
export function isSelectedLibrary(backend: ProgressBackend) {
  try { const state = useSettingsStore.getState(); return progressBackend(state.serverBaseUrl, state.mockMode).key === backend.key; } catch { return false; }
}
export function recordLibraryUpdateRequest(backend: ProgressBackend, status: "idle" | "running" | "success" | "error", error = "") {
  const state = useSettingsStore.getState();
  state.updateExperience((current) => ({ libraryUpdateRuns: { ...current.libraryUpdateRuns, [backend.key]: { status, error, requestedAt: status === "success" ? Date.now() : current.libraryUpdateRuns[backend.key]?.requestedAt ?? 0 } } }));
  if (isSelectedLibrary(backend)) state.setScheduledLibraryUpdateResult(status, error);
}
