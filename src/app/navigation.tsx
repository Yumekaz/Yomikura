import type { ComponentType } from "react";
import {
  Clock3,
  Compass,
  History,
  Library,
  Puzzle,
  RadioTower,
  Search,
  Settings,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
};

export const primaryNav: NavItem[] = [
  { label: "Library", path: "/library", icon: Library },
  { label: "Updates", path: "/updates", icon: Clock3 },
  { label: "History", path: "/history", icon: History },
  { label: "Browse", path: "/browse", icon: Compass },
  { label: "Settings", path: "/settings", icon: Settings },
];

export const browseNav: NavItem[] = [
  { label: "Sources", path: "/browse/sources", icon: Search },
  { label: "Extensions", path: "/browse/extensions", icon: Puzzle },
  { label: "Repos", path: "/browse/extension-repos", icon: RadioTower },
];

export const routeCopy: Record<string, { title: string; detail: string }> = {
  "/library": {
    title: "Library",
    detail: "Real library loading starts in Phase 4 after the Suwayomi API layer is verified.",
  },
  "/updates": {
    title: "Updates",
    detail: "Chapter update history arrives after real backend queries exist.",
  },
  "/history": {
    title: "History",
    detail: "Reading history will stay backend-owned and will not be faked in Phase 1.",
  },
  "/browse": {
    title: "Browse",
    detail: "Source discovery begins after installed source APIs are inspected.",
  },
  "/browse/sources": {
    title: "Sources",
    detail: "Installed source browsing will be wired through Suwayomi, not frontend scraping.",
  },
  "/browse/extensions": {
    title: "Extensions",
    detail: "Extension install and execution belongs to the backend. This shell makes no APK claims.",
  },
  "/browse/extension-repos": {
    title: "Extension Repos",
    detail: "Repository metadata management starts in Phase 8 with safe URL validation.",
  },
  "/settings": {
    title: "Settings",
    detail: "Server URL persistence and connection testing begin in Phase 2.",
  },
};
