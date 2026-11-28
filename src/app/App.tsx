import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, type ReactNode } from "react";
import { FeedbackProvider } from "../components/ui/FeedbackProvider";
import { NavigationScroll } from "./NavigationScroll";
import { BookNavigation } from "./BookNavigation";
import { PrivacyGuard } from "../components/PrivacyGuard";

const AppShell = lazy(() => import("../components/layout/AppShell"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const LibraryPage = lazy(() => import("../features/library/LibraryPage"));
const MangaDetailPage = lazy(() => import("../features/manga/MangaDetailPage"));
const ReaderPage = lazy(() => import("../features/reader/ReaderPage"));
const SourcesPage = lazy(() => import("../features/browse/SourcesPage"));
const SourceBrowsePage = lazy(() => import("../features/browse/SourceBrowsePage"));
const SourcePrefsPage = lazy(() => import("../features/browse/SourcePrefsPage"));
const GlobalSearchPage = lazy(() => import("../features/browse/GlobalSearchPage"));
const ExtensionsPage = lazy(() => import("../features/extensions/ExtensionsPage"));
const ReposPage = lazy(() => import("../features/extensions/ReposPage"));
const UpdatesPage = lazy(() => import("../features/updates/UpdatesPage"));
const HistoryPage = lazy(() => import("../features/history/HistoryPage"));
const DownloadsPage = lazy(() => import("../features/downloads/DownloadsPage"));
const InsightsPage = lazy(() => import("../features/insights/InsightsPage"));
const BrowserSetupPage = lazy(() => import("../features/setup/BrowserSetupPage"));

const screens = {
  library: LibraryPage, updates: UpdatesPage, history: HistoryPage, downloads: DownloadsPage,
  browse: SourcesPage, "browse/sources": SourcesPage, "browse/search": GlobalSearchPage,
  extensions: ExtensionsPage, "browse/extensions": ExtensionsPage,
  "extensions/repos": ReposPage, "browse/extension-repos": ReposPage,
  settings: SettingsPage, "settings/:section": SettingsPage, setup: BrowserSetupPage,
  statistics: InsightsPage, upcoming: InsightsPage,
};

// Device caches and a loopback/LAN engine can remain usable when the browser
// reports offline. Let the actual request and each feature's fallback decide.
const queryClient = new QueryClient({ defaultOptions: { queries: { networkMode: "always" }, mutations: { networkMode: "always" } } });

function MissingPage({ title = "Page not found" }: { title?: string }) {
  return <section className="yomi-route-empty"><h1>{title}</h1><p>Check the link or return to your library.</p>
    <Link to="/library" className="yomi-button yomi-button-primary">Open library</Link>
  </section>;
}

function ReadingRoute({ parameter, children }: { parameter: "mangaId" | "chapterId"; children: ReactNode }) {
  const id = useParams()[parameter];
  if (id && /^\d+$/.test(id) && Number(id) <= 2147483647) return children;
  return <MissingPage title={parameter === "mangaId" ? "Invalid book link" : "Invalid chapter link"} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NavigationScroll />
      <PrivacyGuard><FeedbackProvider><BookNavigation>
      <Suspense fallback={<div className="yomi-route-loading"><span className="yomi-skeleton h-8 w-40" /><span className="yomi-skeleton h-24 w-full" /></div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route element={<AppShell />}>
          {Object.entries(screens).map(([path, Screen]) => <Route key={path} path={path} element={<Screen />} />)}
          <Route path="/manga/:mangaId" element={<ReadingRoute parameter="mangaId"><MangaDetailPage /></ReadingRoute>} />
          <Route path="/browse/:sourceId" element={<SourceBrowsePage />} />
          <Route path="/browse/source/:sourceId/settings" element={<SourcePrefsPage />} />
          <Route path="/reader/:chapterId" element={<ReadingRoute parameter="chapterId"><ReaderPage /></ReadingRoute>} />
        </Route>
        <Route path="*" element={<main><MissingPage /></main>} />
      </Routes>
      </Suspense>
      </BookNavigation></FeedbackProvider></PrivacyGuard>
    </QueryClientProvider>
  );
}

export default App;
