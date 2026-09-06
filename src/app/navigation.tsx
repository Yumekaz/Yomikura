import type { ComponentType } from "react";
import {
  Clock3,
  Compass,
  Library,
  BookOpen,
  Settings,
  Download,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
};

export const primaryNav: NavItem[] = [
  { label: "Library", path: "/library", icon: Library },
  { label: "Continue", path: "/history", icon: BookOpen },
  { label: "Updates", path: "/updates", icon: Clock3 },
];

export const browseNav: NavItem[] = [
  { label: "Browse", path: "/browse/sources", icon: Compass },
  { label: "Downloads", path: "/downloads", icon: Download },
];

export const utilityNav: NavItem[] = [
  { label: "Settings", path: "/settings", icon: Settings },
];

export const routeCopy: Record<string, { title: string; detail: string }> = {
  "/library": {
    title: "Library",
    detail: "Your saved manga appears here from the connected Suwayomi server.",
  },
  "/updates": {
    title: "Updates",
    detail: "Review recently updated chapters from your library.",
  },
  "/history": {
    title: "History",
    detail: "Your reading activity is saved chronologically, whether you read online or offline.",
  },
  "/browse": {
    title: "Browse",
    detail: "Browse installed sources from your Suwayomi server.",
  },
  "/browse/search": {
    title: "Global Search",
    detail: "Search for a title across all your installed sources.",
  },
  "/extensions": {
    title: "Extensions",
    detail: "Browse and install source extensions.",
  },
  "/browse/sources": {
    title: "Sources",
    detail: "Installed source browsing runs through Suwayomi, not frontend scraping.",
  },
  "/browse/extensions": {
    title: "Extensions",
    detail: "Extension install and execution belongs to the backend. Yomikura never runs APKs in the browser.",
  },
  "/browse/extension-repos": {
    title: "Extension Repos",
    detail: "Manage extension repository metadata used by your Suwayomi server.",
  },
  "/settings": {
    title: "Settings",
    detail: "Manage the Suwayomi server URL and reader preferences.",
  },
  "/downloads": {
    title: "Downloads",
    detail: "Manage locally saved chapters and the Suwayomi download queue in one place.",
  },
};
