import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@reader/fonts.css";
import "@reader/styles.css";

// This entry belongs only to the hosted product demo. The released desktop and
// downloadable web app continue to use the unmodified application entry.
const saved = (() => {
  try { return JSON.parse(localStorage.getItem("yomikura-settings") || "null")?.state || {}; }
  catch { return {}; }
})();
localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: {
  ...saved, mockMode: true, connectionStatus: "connected", errorMessage: "",
  serverBaseUrl: "http://127.0.0.1:4567",
  themeMode: saved.themeMode || "dark", colorPalette: saved.colorPalette || "ember",
} }));

// Seed demo identity before importing stores, so asynchronous hydration cannot
// issue an initial request to a visitor's loopback server.
const [{ default: App }, { useSettingsStore }, { applyPalette, paletteFor }] = await Promise.all([
  import("@reader/app/App"), import("@reader/stores/useSettingsStore"), import("@reader/theme/palettes"),
]);
await useSettingsStore.persist.rehydrate();
useSettingsStore.setState({ mockMode: true, connectionStatus: "connected", errorMessage: "" });
const state = useSettingsStore.getState();
const dark = state.themeMode !== "light" && (state.themeMode !== "system" || matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("light-theme", !dark);
document.documentElement.classList.toggle("reduce-motion", state.reducedMotion);
applyPalette(document.documentElement, paletteFor(state.colorPalette).id, dark, state.experience.pureBlack);

// In a hash-routed demo an ordinary fragment would be mistaken for a route.
// Keep the released app's keyboard skip link focused on its actual content.
document.addEventListener("click", (event) => {
  const link = (event.target as Element | null)?.closest?.('a[href="#main-content"]');
  if (link) { event.preventDefault(); document.getElementById("main-content")?.focus(); }
});

// No service worker: a marketing demo must not retain a stale application shell
// over a later homepage or affect another project on the same Pages origin.
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><HashRouter><App /></HashRouter></React.StrictMode>);
