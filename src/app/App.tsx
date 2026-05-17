import { Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import ConnectPage from "../pages/ConnectPage";
import RouteShell from "../pages/RouteShell";
import { routeCopy } from "./navigation";

function App() {
  return (
    <Routes>
      <Route path="/" element={<ConnectPage />} />
      <Route element={<AppShell />}>
        {Object.entries(routeCopy).map(([path, copy]) => (
          <Route
            key={path}
            path={path}
            element={<RouteShell title={copy.title} detail={copy.detail} />}
          />
        ))}
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
  );
}

export default App;
