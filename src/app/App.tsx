import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { routeCopy } from "./navigation";

const AppShell = lazy(() => import("../components/layout/AppShell"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const RouteShell = lazy(() => import("../pages/RouteShell"));
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

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div className="yomi-route-loading"><span className="yomi-skeleton h-8 w-40" /><span className="yomi-skeleton h-24 w-full" /></div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route element={<AppShell />}>
          {Object.entries(routeCopy).map(([path, copy]) => {
            if (path === "/settings") {
              return <Route key={path} path={path} element={<SettingsPage />} />;
            }
            if (path === "/library") {
              return <Route key={path} path={path} element={<LibraryPage />} />;
            }
            if (path === "/updates") {
              return <Route key={path} path={path} element={<UpdatesPage />} />;
            }
            if (path === "/history") {
              return <Route key={path} path={path} element={<HistoryPage />} />;
            }
            if (path === "/downloads") {
              return <Route key={path} path={path} element={<DownloadsPage />} />;
            }
            if (path === "/browse" || path === "/browse/sources") {
              return <Route key={path} path={path} element={<SourcesPage />} />;
            }
            if (path === "/extensions") {
              return <Route key={path} path={path} element={<ExtensionsPage />} />;
            }
            if (path === "/browse/extensions") {
              return <Route key={path} path={path} element={<ExtensionsPage />} />;
            }
            if (path === "/browse/extension-repos") {
              return <Route key={path} path={path} element={<ReposPage />} />;
            }
            if (path === "/browse/search") {
              return <Route key={path} path={path} element={<GlobalSearchPage />} />;
            }
            return (
              <Route
                key={path}
                path={path}
                element={<RouteShell title={copy.title} detail={copy.detail} />}
              />
            );
          })}
          <Route
            path="/manga/:mangaId"
            element={<MangaDetailPage />}
          />
          <Route path="/browse/:sourceId" element={<SourceBrowsePage />} />
          <Route path="/browse/source/:sourceId/settings" element={<SourcePrefsPage />} />
          <Route path="/extensions/repos" element={<ReposPage />} />
          <Route
            path="/reader/:chapterId"
            element={<ReaderPage />}
          />
        </Route>
      </Routes>
      </Suspense>
    </QueryClientProvider>
  );
}

export default App;
