// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("../../stores/useSettingsStore", () => ({ useSettingsStore: vi.fn() }));
import { TauriUpdaterRow } from "./UpdatePanels";
let cleanup = () => {};
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function mount() {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); act(() => root.render(<TauriUpdaterRow />));
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  const click = async (text: string) => {
    const button = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(text));
    expect(button, text).toBeTruthy(); await act(async () => button!.click());
  };
  return { container, click };
}
it("failed checks expose a recovery action and can retry without false success", async () => {
  mocks.check.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce(null);
  const { container, click } = mount(); await click("Check for Updates");
  await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be checked"));
  expect(container.textContent).not.toContain("No newer stable release");
  expect(container.querySelector('a[href="https://github.com/Yumekaz/Yomikura/releases/latest"]')).toBeTruthy();
  await click("Check for Updates"); await vi.waitFor(() => expect(container.textContent).toContain("No newer stable release"));
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("successful installation followed by relaunch failure explains how to reopen", async () => {
  const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
  mocks.check.mockResolvedValue({ version: "9.0.0", downloadAndInstall }); mocks.relaunch.mockRejectedValue(new Error("relaunch denied"));
  const { container, click } = mount(); await click("Check for Updates"); await click("Install");
  await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("was installed"));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("usual shortcut");
  expect(downloadAndInstall).toHaveBeenCalledOnce(); expect(mocks.relaunch).toHaveBeenCalledOnce();
});
