import type { ComponentType } from "react";
import {
  Clock3,
  Compass,
  Library,
  History,
  Settings,
  Download,
  ChartNoAxesCombined,
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
  { label: "Statistics", path: "/statistics", icon: ChartNoAxesCombined },
  { label: "Settings", path: "/settings", icon: Settings },
];
