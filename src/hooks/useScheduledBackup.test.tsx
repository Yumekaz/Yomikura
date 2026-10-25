// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listLibraryBackups, readLibraryBackup, type LibraryBackup } from "../api/suwayomi/backupStorage";
import { createLibraryBackup } from "../api/suwayomi/libraryBackups";
import { useSettingsStore } from "../stores/useSettingsStore";
import { render, waitForRender } from "../test/render";
import { useScheduledBackup } from "./useScheduledBackup";

vi.mock("../api/suwayomi/backupStorage", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/suwayomi/backupStorage")>(),
  listLibraryBackups: vi.fn(), readLibraryBackup: vi.fn(),
}));
vi.mock("../api/suwayomi/libraryBackups", () => ({ createLibraryBackup: vi.fn() }));

const serverA = "http://localhost:4567";
const serverB = "http://localhost:4568";
const saved = (server = serverA, createdAt = Date.now()): LibraryBackup => ({ id: "backup-fixture", fileName: "fixture.tachibk", serverBaseUrl: server, createdAt, size: 44, purpose: "scheduled", sha256: null, storage: "browser" });
let view: Awaited<ReturnType<typeof render>> | undefined;
function Harness() { useScheduledBackup(); return null; }

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), hasHydrated: true, serverBaseUrl: serverA, mockMode: false, connectionStatus: "connected", backupIntervalHours: 12 });
  vi.mocked(listLibraryBackups).mockResolvedValue([]);
  vi.mocked(readLibraryBackup).mockImplementation(async (server) => ({ backup: saved(server), bytes: new Uint8Array([1]) }));
});
afterEach(async () => { await view?.unmount(); view = undefined; });

describe("scheduled backup confirmation", () => {
  it("waits for saved-file verification and runs once under StrictMode", async () => {
    let finish!: (backup: LibraryBackup) => void;
    vi.mocked(createLibraryBackup).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    useSettingsStore.setState({ lastScheduledBackupAt: Date.now(), scheduledBackupStatus: "success" });
    view = await render(<StrictMode><Harness /></StrictMode>);
    await waitForRender(() => expect(createLibraryBackup).toHaveBeenCalledOnce());
    expect(useSettingsStore.getState().scheduledBackupStatus).toBe("running");
    expect(useSettingsStore.getState().lastScheduledBackupAt).toBe(0);
    const backup = saved();
    await act(async () => finish(backup));
    await waitForRender(() => expect(useSettingsStore.getState().lastScheduledBackupAt).toBe(backup.createdAt));
    expect(useSettingsStore.getState().scheduledBackupStatus).toBe("success");
    expect(createLibraryBackup).toHaveBeenCalledOnce();
  });

  it("does not postpone a due backup because another profile just succeeded", async () => {
    let finishA!: (backup: LibraryBackup) => void;
    const backupB = saved(serverB, Date.now() - 500);
    vi.mocked(createLibraryBackup).mockImplementation((_sdk, server) => server === serverA ? new Promise((resolve) => { finishA = resolve; }) : Promise.resolve(backupB));
    view = await render(<Harness />);
    await waitForRender(() => expect(createLibraryBackup).toHaveBeenCalledTimes(1));
    await act(async () => useSettingsStore.setState({ serverBaseUrl: serverB }));
    await waitForRender(() => expect(useSettingsStore.getState().lastScheduledBackupAt).toBe(backupB.createdAt));
    await act(async () => finishA(saved(serverA)));
    expect(useSettingsStore.getState().lastScheduledBackupAt).toBe(backupB.createdAt);
    expect(createLibraryBackup).toHaveBeenCalledTimes(2);
  });

  it("verifies the retained copy before trusting its timestamp", async () => {
    const backup = saved();
    vi.mocked(listLibraryBackups).mockResolvedValue([backup]);
    vi.mocked(readLibraryBackup).mockRejectedValue(new Error("corrupt file"));
    vi.mocked(createLibraryBackup).mockResolvedValue(saved());
    view = await render(<Harness />);
    await waitForRender(() => expect(createLibraryBackup).toHaveBeenCalledOnce());
    expect(readLibraryBackup).toHaveBeenCalledWith(serverA, backup.id);
  });

  it("uses a verified recent copy without creating another export", async () => {
    const backup = saved();
    vi.mocked(listLibraryBackups).mockResolvedValue([backup]);
    view = await render(<Harness />);
    await waitForRender(() => expect(useSettingsStore.getState().lastScheduledBackupAt).toBe(backup.createdAt));
    expect(readLibraryBackup).toHaveBeenCalledWith(serverA, backup.id);
    expect(createLibraryBackup).not.toHaveBeenCalled();
  });
});
