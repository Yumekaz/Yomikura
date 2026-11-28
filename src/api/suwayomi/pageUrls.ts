export function normalizeServerUrl(serverBaseUrl: string) {
  return serverBaseUrl.replace(/\/$/, "");
}

export function resolveBackendUrl(serverBaseUrl: string, url: string) {
  if (/^(?:https?:|blob:|data:)/i.test(url)) {
    return url;
  }

  return `${normalizeServerUrl(serverBaseUrl)}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function buildSuwayomiPageUrl({
  serverBaseUrl,
  mangaId,
  chapterSourceOrder,
  pageIndex,
}: {
  serverBaseUrl: string;
  mangaId: number;
  chapterSourceOrder: number;
  pageIndex: number;
}) {
  return `${normalizeServerUrl(serverBaseUrl)}/api/v1/manga/${mangaId}/chapter/${chapterSourceOrder}/page/${pageIndex}`;
}
