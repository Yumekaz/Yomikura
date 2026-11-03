import { useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { FitMode } from "../../stores/useSettingsStore";
import type { ReaderExperience } from "../../stores/readerExperience";
import { blankBorderBounds, clampPan, fullImageBounds, imageFrame, splitImageBounds, type CropBounds } from "./imageGeometry";
import { ReaderZoomContext, boundedReaderZoom } from "./useReaderZoom";
const cropCache = new Map<string, CropBounds>();
function findImageBorders(image: HTMLImageElement): CropBounds {
  const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("Image analysis is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const bounds = blankBorderBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    return { x: bounds.x / canvas.width * image.naturalWidth, y: bounds.y / canvas.height * image.naturalHeight, width: bounds.width / canvas.width * image.naturalWidth, height: bounds.height / canvas.height * image.naturalHeight };
  } finally { canvas.width = 0; canvas.height = 0; }
}
export function useImageLayout({ url, container, image, mode, fit, crop, preferences, half, rtl }: { url: string; container: RefObject<HTMLDivElement>; image: RefObject<HTMLImageElement>; mode: "webtoon" | "single"; fit: FitMode; crop: boolean; preferences: ReaderExperience; half?: 0 | 1; rtl: boolean }) {
  const [naturalRecord, setNatural] = useState<{ url: string; width: number; height: number }>();
  const natural = naturalRecord?.url === url ? naturalRecord : undefined;
  const [boundsRecord, setBounds] = useState<{ url: string; value: CropBounds }>();
  const bounds = boundsRecord?.url === url ? boundsRecord.value : undefined;
  const [area, setArea] = useState({ width: window.innerWidth, height: window.innerHeight });
  const shared = useContext(ReaderZoomContext);
  const [localZoom, setLocalZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [dragging, setDragging] = useState(false);
  const zoom = shared?.scale ?? localZoom;
  const setZoom = useCallback((value: number | ((current: number) => number)) => {
    const next = typeof value === "function" ? value(zoom) : value;
    if (shared) shared.change(next); else setLocalZoom(boundedReaderZoom(next, preferences.disableZoomOut));
  }, [shared, zoom, preferences.disableZoomOut]);
  const pointer = useRef<{ x: number; y: number; px: number; py: number; id: number }>();
  const suppressed = useRef(0);
  const [cropState, setCropState] = useState<"off" | "checked" | "unavailable">("off");
  // A cached image can load before passive effects run. Associate dimensions
  // with the URL instead of clearing a newer onLoad result in this effect.
  useEffect(() => { if (!shared) setLocalZoom(1); setPan({ x: 0, y: 0 }); }, [url, half, preferences.rotation, preferences.widePages]);
  useEffect(() => {
    const root = container.current; if (!root) return;
    const measure = () => setArea({ width: root.clientWidth || window.innerWidth, height: window.innerHeight });
    measure(); const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined; observer?.observe(root); window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [container]);
  useEffect(() => {
    if (!crop || !natural) { setBounds(undefined); setCropState("off"); return; }
    const known = cropCache.get(url); if (known) { setBounds({ url, value: known }); setCropState("checked"); return; }
    let active = true; let copy: HTMLImageElement | undefined;
    const apply = (source: HTMLImageElement) => {
      const found = findImageBorders(source);
      if (!active) return;
      cropCache.set(url, found); if (cropCache.size > 100) cropCache.delete(cropCache.keys().next().value!);
      setBounds({ url, value: found }); setCropState("checked");
    };
    try { if (image.current) apply(image.current); }
    catch {
      // Retry just the analysis with CORS. The successfully displayed image is
      // never replaced by a failed request from a source that blocks access.
      copy = new Image(); copy.crossOrigin = "anonymous";
      copy.onload = () => { try { apply(copy!); } catch { if (active) setCropState("unavailable"); } };
      copy.onerror = () => { if (active) setCropState("unavailable"); }; copy.src = url;
    }
    return () => { active = false; if (copy) { copy.onload = null; copy.onerror = null; } };
  }, [crop, natural, url, image]);
  const layout = useMemo(() => {
    if (!natural) return;
    let visible = bounds ?? fullImageBounds(natural.width, natural.height);
    const wide = natural.width > natural.height;
    const treatment = mode === "webtoon" ? preferences.wideWebtoon : preferences.widePages;
    if (wide && treatment === "split" && half !== undefined) visible = splitImageBounds(visible, half);
    const rotation = preferences.rotation || (wide && treatment === "rotate" ? 90 : 0);
    const frame = imageFrame(visible, Math.min(area.width, mode === "webtoon" ? 896 : area.width), area.height, mode === "webtoon" ? "FIT_WIDTH" : fit, rotation);
    const viewportWidth = Math.min(area.width, frame.width), viewportHeight = mode === "webtoon" || fit === "FIT_WIDTH" ? frame.height : Math.min(area.height, frame.height);
    return { ...frame, visible, rotation, viewportWidth, viewportHeight, wide };
  }, [natural, bounds, area, mode, fit, preferences.rotation, preferences.widePages, preferences.wideWebtoon, half]);
  const clamp = useCallback((x: number, y: number, nextZoom: number) => layout ? { x: clampPan(x, layout.viewportWidth, layout.width, nextZoom), y: clampPan(y, layout.viewportHeight, layout.height, nextZoom) } : { x: 0, y: 0 }, [layout]);
  useEffect(() => { setPan((current) => clamp(current.x, current.y, zoom)); }, [clamp, zoom]);
  const automaticKey = useRef("");
  useEffect(() => {
    if (!layout || !natural || !preferences.autoZoomWide || !layout.wide || half !== undefined || automaticKey.current === url || shared?.vertical) return;
    automaticKey.current = url;
    const nextZoom = Math.max(1, Math.min(3, area.height / layout.height)); setZoom(nextZoom);
    const start = preferences.zoomStart === "automatic" ? rtl ? "right" : "left" : preferences.zoomStart;
    setPan(clamp(start === "right" ? -100000 : start === "left" ? 100000 : 0, 0, nextZoom));
  }, [layout, natural, preferences.autoZoomWide, preferences.zoomStart, half, rtl, clamp, area.height, url]);
  useEffect(() => {
    const root = container.current; if (!root || shared) return;
    const wheel = (event: WheelEvent) => { if (!event.ctrlKey) return; event.preventDefault(); setZoom((current) => Math.max(preferences.disableZoomOut ? 1 : .5, Math.min(4, current * (event.deltaY < 0 ? 1.15 : 1 / 1.15)))); };
    root.addEventListener("wheel", wheel, { passive: false }); return () => root.removeEventListener("wheel", wheel);
  }, [container, preferences.disableZoomOut, !!shared]);
  const reset = () => { if (shared) shared.reset(); else setZoom(1); setPan(clamp(0, 0, 1)); };
  const dimensions = useCallback((width: number, height: number) => { if (width && height) setNatural((previous) => previous?.url === url && previous.width === width && previous.height === height ? previous : { url, width, height }); }, [url]);
  return { natural, layout, zoom, shared: !!shared, pan: mode === "webtoon" && shared ? { x: layout ? clampPan(shared.panX, layout.viewportWidth, layout.width, zoom) : 0, y: 0 } : pan, dragging, cropState, dimensions, loaded: (node: HTMLImageElement) => { dimensions(node.naturalWidth, node.naturalHeight); }, reset,
    doubleClick: (event: React.MouseEvent) => { if (!preferences.doubleTapZoom || Date.now() < (shared?.touchDoubleUntil.current ?? 0) || (event.target as Element).closest("button,a")) return; event.preventDefault(); event.stopPropagation(); if (zoom !== 1) reset(); else { const box = container.current!.getBoundingClientRect(); setZoom(2); setPan(clamp((box.width / 2 - (event.clientX - box.left)) * 2, (box.height / 2 - (event.clientY - box.top)) * 2, 2)); } },
    pointerDown: (event: React.PointerEvent) => { if (!layout || (!preferences.panWidePages && layout.wide) || (zoom <= 1 && layout.width <= layout.viewportWidth) || (event.target as Element).closest("button,a")) return; event.preventDefault(); event.stopPropagation(); pointer.current = { x: event.clientX, y: event.clientY, px: mode === "webtoon" && shared ? shared.panX : pan.x, py: pan.y, id: event.pointerId }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); },
    pointerMove: (event: React.PointerEvent) => { const initial = pointer.current; if (!initial || event.pointerId !== initial.id) return; const x = event.clientX - initial.x, y = event.clientY - initial.y; if (Math.abs(x) + Math.abs(y) > 4) suppressed.current = Date.now() + 400; if (mode === "webtoon" && shared && layout) { shared.setPanX(clampPan(initial.px + x, layout.viewportWidth, layout.width, zoom)); window.scrollBy({ top: -y, behavior: "instant" }); initial.y = event.clientY; } else setPan(clamp(initial.px + x, initial.py + y, zoom)); },
    pointerUp: () => { pointer.current = undefined; setDragging(false); },
    captureClick: (event: React.MouseEvent) => { if (Date.now() < Math.max(suppressed.current, shared?.suppressUntil.current ?? 0)) { event.preventDefault(); event.stopPropagation(); } },
  };
}
