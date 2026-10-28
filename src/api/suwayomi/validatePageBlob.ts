/** A successful HTTP response can still be an error page. Only retain decodable images. */
export async function validatePageBlob(blob: Blob, signal: AbortSignal): Promise<void> {
  const check = () => { if (signal.aborted) throw new DOMException("Download cancelled", "AbortError"); };
  check();
  if (!blob.size || blob.size > 80 * 1024 * 1024) throw new Error("This page is empty or too large to save safely.");
  if (typeof createImageBitmap === "function") {
    try {
      const image = await createImageBitmap(blob);
      try { check(); if (image.width < 1 || image.height < 1) throw new Error("Empty image"); }
      finally { image.close(); }
      return;
    } catch { check(); /* Some valid formats need the WebView image decoder instead. */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const finish = (error?: Error) => {
        clearTimeout(timer); signal.removeEventListener("abort", cancel);
        image.onload = image.onerror = null; image.removeAttribute("src");
        if (error) reject(error); else resolve();
      };
      const cancel = () => finish(new DOMException("Download cancelled", "AbortError"));
      const timer = setTimeout(() => finish(new Error("The page could not be verified. Retry this chapter.")), 30_000);
      signal.addEventListener("abort", cancel, { once: true });
      image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? undefined : new Error("The page contains no image."));
      image.onerror = () => finish(new Error("The library returned an unreadable image. Retry this chapter."));
      image.src = url;
      if (signal.aborted) cancel();
    });
  } finally { URL.revokeObjectURL(url); }
  check();
}
