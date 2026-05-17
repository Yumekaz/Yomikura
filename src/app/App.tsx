import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppShell from "../components/layout/AppShell";
import ConnectPage from "../pages/ConnectPage";
import SettingsPage from "../pages/SettingsPage";
import RouteShell from "../pages/RouteShell";
import LibraryPage from "../features/library/LibraryPage";
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
            element={
              <RouteShell
                title="Manga Details"
                detail="Manga metadata and chapter lists start in Phase 5 after real library entries exist."
              />
            }
          />
          <Route
            path="/reader/:chapterId"
            element={
              <RouteShell
                title="Reader"
                detail="The reader is intentionally empty until Phase 6 can fetch real chapter pages."
                immersive
              />
            }
          />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}

export default App;
