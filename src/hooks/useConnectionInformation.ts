import { useEffect, useState } from "react";
import { connectionInformation } from "../api/suwayomi/networkPolicy";
export function useConnectionInformation() {
  const [revision, setRevision] = useState(0);
  useEffect(() => { const connection = connectionInformation(); const changed = () => setRevision((value) => value + 1); connection?.addEventListener?.("change", changed); window.addEventListener("online", changed); window.addEventListener("offline", changed); return () => { connection?.removeEventListener?.("change", changed); window.removeEventListener("online", changed); window.removeEventListener("offline", changed); }; }, []);
  return { connection: connectionInformation(), revision };
}
