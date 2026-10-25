import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

const releases = "https://github.com/Yumekaz/Yomikura/releases/latest";
type ReleaseAsset = { name: string; browser_download_url: string };
export function desktopInstaller(assets: ReleaseAsset[], platform: string): string | undefined {
  const windows = /win/i.test(platform), mac = /mac/i.test(platform);
  const matches = assets.filter((asset) => windows ? /setup\.exe$/i.test(asset.name) : mac ? /\.dmg$/i.test(asset.name) : /\.AppImage$/i.test(asset.name));
  const asset = matches.find((item) => /x64|x86_64|universal/i.test(item.name)) ?? matches[0];
  if (!asset) return undefined;
  try { const url = new URL(asset.browser_download_url); return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/Yumekaz/Yomikura/releases/download/") ? url.href : undefined; } catch { return undefined; }
}
export function DesktopDownloadLink() {
  const download = useQuery({
    queryKey: ["desktop-installer"], staleTime: 3_600_000, retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch("https://api.github.com/repos/Yumekaz/Yomikura/releases/latest", { signal });
      if (!response.ok) throw new Error("Desktop downloads are available on the release page.");
      const release: { assets?: ReleaseAsset[] } = await response.json();
      return desktopInstaller(release.assets ?? [], navigator.platform);
    },
  });
  return <a href={download.data || releases} target="_blank" rel="noreferrer" className="yomi-button yomi-button-primary yomi-welcome-primary"><span>Download Yomikura Desktop</span><Download aria-hidden="true" /></a>;
}
