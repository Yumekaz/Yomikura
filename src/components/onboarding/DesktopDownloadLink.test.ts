import { expect, it } from "vitest";
import { desktopInstaller } from "./DesktopDownloadLink";
const asset = (name: string, url = `https://github.com/Yumekaz/Yomikura/releases/download/v1/${name}`) => ({ name, browser_download_url: url });
it("offers the platform's installer without asking a reader to choose GitHub assets", () => {
  const assets = [asset("Yomikura_x64-setup.exe"), asset("Yomikura_x64.dmg"), asset("Yomikura_x86_64.AppImage")];
  expect(desktopInstaller(assets, "Win32")).toMatch(/setup\.exe$/);
  expect(desktopInstaller(assets, "MacIntel")).toMatch(/\.dmg$/);
  expect(desktopInstaller(assets, "Linux x86_64")).toMatch(/\.AppImage$/);
});
it("keeps the official release-page fallback when a platform installer is unavailable", () => expect(desktopInstaller([], "Win32")).toBeUndefined());
it("rejects an asset link outside the project's official GitHub releases", () => {
  expect(desktopInstaller([asset("setup.exe", "https://other.example/setup.exe")], "Win32")).toBeUndefined();
  expect(desktopInstaller([asset("setup.exe", "http://github.com/Yumekaz/Yomikura/releases/download/v1/setup.exe")], "Win32")).toBeUndefined();
});
