import { beforeEach, describe, expect, it, vi } from "vitest";
import { progressBackend } from "./backendIdentity";
import { isSelectedLibrary, recordLibraryUpdateRequest } from "./libraryUpdateState";
import { DEFAULT_EXPERIENCE } from "../../stores/experiencePreferences";
const mocks = vi.hoisted(() => ({ state: {} as any, legacy: vi.fn() }));
vi.mock("../../stores/useSettingsStore", () => ({ useSettingsStore: { getState: () => mocks.state } }));
const first = progressBackend("http://first.example"), second = progressBackend("http://second.example");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = { serverBaseUrl: second.serverBaseUrl, mockMode: false, experience: { ...DEFAULT_EXPERIENCE, libraryUpdateRuns: {} }, setScheduledLibraryUpdateResult: mocks.legacy };
  mocks.state.updateExperience = (change: (value: typeof DEFAULT_EXPERIENCE) => object) => { mocks.state.experience = { ...mocks.state.experience, ...change(mocks.state.experience) }; };
});
describe("library update ownership", () => {
  it("records a delayed result only for the captured backend without checking off another profile", () => {
    recordLibraryUpdateRequest(first, "success");
    expect(mocks.state.experience.libraryUpdateRuns[first.key].requestedAt).toBeGreaterThan(0);
    expect(mocks.state.experience.libraryUpdateRuns[second.key]).toBeUndefined(); expect(mocks.legacy).not.toHaveBeenCalled();
    recordLibraryUpdateRequest(second, "success"); expect(mocks.legacy).toHaveBeenCalledWith("success", "");
  });
  it("keeps failure and retry state without replacing the last acknowledged request time", () => {
    recordLibraryUpdateRequest(second, "success"); const timestamp = mocks.state.experience.libraryUpdateRuns[second.key].requestedAt;
    recordLibraryUpdateRequest(second, "error", "Offline"); expect(mocks.state.experience.libraryUpdateRuns[second.key]).toMatchObject({ status: "error", requestedAt: timestamp });
  });
  it("distinguishes demo from live libraries sharing an address and rejects incomplete connections", () => {
    expect(isSelectedLibrary(second)).toBe(true); expect(isSelectedLibrary(progressBackend(second.serverBaseUrl, true))).toBe(false);
    mocks.state.serverBaseUrl = "incomplete"; expect(isSelectedLibrary(second)).toBe(false);
  });
});
