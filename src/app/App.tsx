import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppShell from "../components/layout/AppShell";
import ConnectPage from "../pages/ConnectPage";
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
        <Route path="/" element={<ConnectPage />} />
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
