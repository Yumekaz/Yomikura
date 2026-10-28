// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_DOWNLOAD_EXPERIENCE } from "../../stores/downloadExperience";
import { allowDeviceDownload, allowedPreloadPages, isUnmetered, waitForDownloadNetwork, type ConnectionInformation } from "./networkPolicy";
afterEach(() => vi.unstubAllGlobals());
const connection = (value: Partial<ConnectionInformation>) => Object.assign(new EventTarget(), value) as ConnectionInformation;
it("does not infer cost from speed or an unknown desktop connection", () => {
  const strict = { ...DEFAULT_DOWNLOAD_EXPERIENCE, unmeteredOnly: true };
  expect(allowDeviceDownload(strict, connection({ effectiveType: "4g" }))).toBe(false);
  expect(isUnmetered(strict, connection({ type: "wifi" }))).toBe(true);
  expect(isUnmetered(strict, connection({ type: "cellular" }))).toBe(false);
  expect(isUnmetered({ ...strict, connectionCost: "unmetered" }, undefined)).toBe(true);
  expect(allowDeviceDownload(DEFAULT_DOWNLOAD_EXPERIENCE, undefined)).toBe(true);
});
it("limits automatic preloading without blocking a foreground reading request", () => {
  expect(allowedPreloadPages(DEFAULT_DOWNLOAD_EXPERIENCE, connection({ saveData: true }))).toBe(0);
  expect(allowedPreloadPages({ ...DEFAULT_DOWNLOAD_EXPERIENCE, preloadUnmeteredOnly: true }, connection({}))).toBe(0);
  expect(allowedPreloadPages({ ...DEFAULT_DOWNLOAD_EXPERIENCE, connectionCost: "unmetered", preloadUnmeteredOnly: true }, connection({}))).toBe(3);
});
it("resumes a network wait on a preference change and releases its listeners", async () => {
  let allowed = false; const listeners = new Set<() => void>(); const controller = new AbortController();
  const pending = waitForDownloadNetwork(() => allowed, (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, controller.signal);
  expect(listeners.size).toBe(1); allowed = true; [...listeners].forEach((listener) => listener()); await pending; expect(listeners.size).toBe(0);
});
it("cancels a blocked download without leaving a network subscription", async () => {
  const listeners = new Set<() => void>(), controller = new AbortController();
  const pending = waitForDownloadNetwork(() => false, (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, controller.signal);
  controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(listeners.size).toBe(0);
});
