import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useNavigationType, type LinkProps } from "react-router-dom";

const Views = createContext<Map<string, object> | null>(null);

export function BookNavigation({ children }: { children: ReactNode }) {
  const [views] = useState(() => new Map<string, object>());
  return <Views.Provider value={views}>{children}</Views.Provider>;
}

/** Keep the active filters of an in-app history entry while its page is unmounted. */
export function useBookListView<T extends object>(defaults: T) {
  const views = useContext(Views);
  const { key } = useLocation();
  const navigation = useNavigationType();
  const saved = views?.get(key) as T | undefined;
  const [entry, setEntry] = useState(() => ({ key, view: saved ?? defaults }));
  const view = entry.key === key ? entry.view : saved ?? (navigation === "POP" ? defaults : entry.view);
  if (entry.key !== key) setEntry({ key, view });
  useLayoutEffect(() => {
    if (!views) return;
    views.set(key, view);
    if (views.size > 100) views.delete(views.keys().next().value!);
  }, [key, view, views]);
  const update = (patch: Partial<T>) => setEntry((previous) => ({ key, view: { ...previous.view, ...patch } }));
  return [view, update] as const;
}

type Click = Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;
export const isPrimaryClick = (event: Click) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;

const listLabels: Record<string, string> = {
  "/library": "library", "/history": "history", "/browse/search": "search",
};

function listName(pathname: string) {
  const path = pathname.replace(/\/$/, "");
  return listLabels[path] ?? (/^\/browse\/[^/]+$/.test(path) ? "source" : undefined);
}

export function BookLink({ bookId, ...props }: Omit<LinkProps, "to" | "replace" | "state"> & { bookId: string | number }) {
  const { pathname, search, hash } = useLocation();
  return <Link {...props} to={`/manga/${bookId}`} state={{ bookList: pathname + search + hash }} data-book-link={bookId} />;
}

export function BookBackLink({ children, className }: { children: ReactNode; className: string }) {
  const from: unknown = useLocation().state?.bookList;
  const name = typeof from === "string" && listName(from.split(/[?#]/, 1)[0]);
  const navigate = useNavigate();
  const label = `Back to ${name || "library"}`;
  return <Link className={className} to={name && typeof from === "string" ? from : "/library"} aria-label={label} title={label} onClick={(event) => {
    if (name && window.history.state?.idx > 0 && isPrimaryClick(event)) {
      event.preventDefault();
      navigate(-1);
    }
  }}>{children}</Link>;
}
