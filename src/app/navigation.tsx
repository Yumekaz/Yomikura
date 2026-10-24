import type { ComponentType } from "react";
import {
  Clock3,
  Compass,
  Library,
  History,
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
  { label: "Discover", path: "/browse/sources", icon: Compass },
  { label: "Updates", path: "/updates", icon: Clock3 },
  { label: "Downloads", path: "/downloads", icon: Download },
];

export const browseNav: NavItem[] = [];

export const utilityNav: NavItem[] = [
  { label: "History", path: "/history", icon: History },
  { label: "Settings", path: "/settings", icon: Settings },
];

export const routeCopy: Record<string, { title: string; detail: string }> = {
  "/library": {
    title: "Library",
    detail: "A home for everything you love to read.",
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
