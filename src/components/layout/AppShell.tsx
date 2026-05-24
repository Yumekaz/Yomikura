import { BookOpen, Server } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { browseNav, primaryNav, type NavItem } from "../../app/navigation";
import { useSettingsStore } from "../../stores/useSettingsStore";

function ProfileSwitcher() {
  const { profiles, activeProfileId, setActiveProfileId } = useSettingsStore();
  const queryClient = useQueryClient();

  if (profiles.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-ink-950/60 border border-white/5 px-2.5 py-1.5 text-xs text-slate-400">
      <Server className="h-3.5 w-3.5 text-yomi-jade shrink-0" />
      <select
        value={activeProfileId}
        onChange={(e) => {
          setActiveProfileId(e.target.value);
          queryClient.clear();
        }}
        className="flex-1 bg-transparent text-slate-300 outline-none font-medium cursor-pointer"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id} className="bg-ink-900 text-slate-200">
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen bg-ink-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-ink-900/95 px-4 py-5 lg:block">
        <BrandLockup />
        
        {/* Profile Switcher */}
        <div className="mt-5 px-1">
          <ProfileSwitcher />
        </div>

        <nav className="mt-6 space-y-1" aria-label="Primary navigation">
          {primaryNav.map((item) => (
            <ShellNavLink key={item.path} item={item} />
          ))}
        </nav>
        <div className="mt-8 border-t border-white/10 pt-5">
          <p className="px-3 text-xs font-semibold uppercase text-slate-500">Browse</p>
          <nav className="mt-2 space-y-1" aria-label="Browse navigation">
            {browseNav.map((item) => (
              <ShellNavLink key={item.path} item={item} />
            ))}
          </nav>
        </div>
      </aside>
      <main className="min-h-screen pb-24 lg:pl-64">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}

export function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-yomi-jade text-ink-950">
        <BookOpen className="h-5 w-5" />
      </div>
      <div>
        <p className="text-base font-semibold text-white">Yomikura</p>
        <p className="text-xs text-slate-500">Suwayomi web reader</p>
      </div>
    </div>
  );
}

function ShellNavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
          isActive
            ? "bg-yomi-jade/15 text-yomi-mint"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
        }`
      }
      to={item.path}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </NavLink>
  );
}

function MobileNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-ink-900/95 px-2 py-2 backdrop-blur lg:hidden"
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-6 gap-1">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium ${
                  isActive ? "bg-yomi-jade/15 text-yomi-mint" : "text-slate-500"
                }`
              }
              to={item.path}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default AppShell;
