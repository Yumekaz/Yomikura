import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppShell from "../components/layout/AppShell";
import SettingsPage from "../pages/SettingsPage";
import RouteShell from "../pages/RouteShell";
import LibraryPage from "../features/library/LibraryPage";
import MangaDetailPage from "../features/manga/MangaDetailPage";
import ReaderPage from "../features/reader/ReaderPage";
import SourcesPage from "../features/browse/SourcesPage";
import SourceBrowsePage from "../features/browse/SourceBrowsePage";
import ExtensionsPage from "../features/extensions/ExtensionsPage";
import ReposPage from "../features/extensions/ReposPage";
import { routeCopy } from "./navigation";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
            if (path === "/browse") {
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
          <Route path="/extensions/repos" element={<ReposPage />} />
          <Route
            path="/reader/:chapterId"
            element={<ReaderPage />}
          />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}

export default App;
