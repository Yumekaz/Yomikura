// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testServerConnection } from "../api/suwayomi/connection";
import { useSettingsStore } from "./useSettingsStore";

vi.mock("../api/suwayomi/connection", () => ({ testServerConnection: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), hasHydrated: true, serverBaseUrl: "http://first.example", connectionStatus: "disconnected", mockMode: false });
});
describe("connection result ownership", () => {
  it.each([true, false])("does not apply an old connection result to a new endpoint (success=%s)", async (success) => {
    let finish!: (success: boolean) => void;
    vi.mocked(testServerConnection).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = useSettingsStore.getState().testConnection();
    useSettingsStore.getState().setServerBaseUrl("http://second.example");
    finish(success); await pending;
    expect(useSettingsStore.getState()).toMatchObject({ serverBaseUrl: "http://second.example", connectionStatus: "disconnected", errorMessage: "" });
  });

  it("does not leave demo mode when an earlier live connection completes", async () => {
    let finish!: (success: boolean) => void;
    vi.mocked(testServerConnection).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = useSettingsStore.getState().testConnection();
    useSettingsStore.getState().setMockMode(true);
    finish(true); await pending;
    expect(useSettingsStore.getState()).toMatchObject({ mockMode: true, connectionStatus: "disconnected" });
  });
});
