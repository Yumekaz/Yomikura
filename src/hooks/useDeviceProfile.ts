import { useEffect, useRef } from "react";
import { useSettingsStore } from "../stores/useSettingsStore";

function detectDeviceKind(): "mobile" | "tablet" | "desktop" {
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1100) return "tablet";
  return "desktop";
}

/** Auto-apply a saved reader layout preset once per device class. */
export function useDeviceProfileBootstrap() {
  const { hasHydrated, settingsProfiles, applySettingsProfile } = useSettingsStore();
  const applied = useRef(false);

  useEffect(() => {
    if (!hasHydrated || applied.current || settingsProfiles.length === 0) return;

    const kind = detectDeviceKind();
    const match = settingsProfiles.find((p) =>
      p.name.toLowerCase().includes(kind)
    );
    if (match) {
      applySettingsProfile(match.id);
      applied.current = true;
    }
  }, [hasHydrated, settingsProfiles, applySettingsProfile]);
}
