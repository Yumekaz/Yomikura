import { ArrowDownAZ, ArrowUpAZ, FolderEdit, Grid2X2, List, X } from "lucide-react";
import type { LibrarySortMode, LibraryViewMode } from "../../stores/useSettingsStore";
import { useTranslation } from "../../hooks/useTranslation";
import { LibraryUpdateButton } from "../../components/library/LibraryUpdateButton";

export interface Category { id: string | number; name: string }
interface LibraryFiltersProps {
  downloadCounts?: Partial<Record<string, number>>;
  serverAvailable?: boolean;
  categories: Category[];
  activeCategoryId: string | number | null;
  onCategorySelect: (id: string | number | null) => void;
  onManageCategories: () => void;
  isSelectMode?: boolean;
  selectedCount?: number;
  onSelectAll?: () => void;
  onCancelSelect?: () => void;
  onStartSelect?: () => void;
  viewMode: LibraryViewMode;
  sortMode: LibrarySortMode;
  sortDescending: boolean;
  onViewModeChange: (mode: LibraryViewMode) => void;
  onSortModeChange: (mode: LibrarySortMode) => void;
  onSortDirectionChange: (descending: boolean) => void;
}
export function LibraryFilters({ downloadCounts = {}, serverAvailable = true, categories, activeCategoryId, onCategorySelect, onManageCategories, isSelectMode, selectedCount, onSelectAll, onCancelSelect, onStartSelect, viewMode, sortMode, sortDescending, onViewModeChange, onSortModeChange, onSortDirectionChange }: LibraryFiltersProps) {
  const { t } = useTranslation();
  if (isSelectMode) return <div className="yomi-selection-bar">
    <button className="yomi-icon-button" onClick={onCancelSelect} aria-label="Cancel selection"><X /></button>
    <strong>{selectedCount} selected</strong>
    <div className="ml-auto flex gap-2"><button className="yomi-button yomi-button-secondary" onClick={onSelectAll}>Select All</button><button className="yomi-button yomi-button-primary" onClick={onCancelSelect}>Done</button></div>
  </div>;

  const smartCategories = [
    { id: "smart:reading", name: t("reading") },
    { id: "smart:plan_to_read", name: t("plan_to_read") },
    { id: "smart:completed", name: t("completed") },
    { id: "smart:downloaded", name: t("downloaded") },
    { id: "smart:on_device", name: "On this device" },
    { id: "smart:on_server", name: "On server" },
  ];
  return <div className="yomi-library-tools">
    <div className="yomi-shelf-tabs" role="group" aria-label="Filter library">
      <button aria-pressed={activeCategoryId === null} onClick={() => onCategorySelect(null)}>All books</button>
      {smartCategories.map((cat) => <button key={cat.id} aria-label={cat.name} aria-pressed={activeCategoryId === cat.id} disabled={cat.id === "smart:on_server" && !serverAvailable} title={cat.id === "smart:on_server" && !serverAvailable ? "Reconnect to check server availability" : undefined} onClick={() => onCategorySelect(cat.id)}>
        {cat.name}{downloadCounts[cat.id] !== undefined && <span aria-hidden="true">{downloadCounts[cat.id]}</span>}
      </button>)}
    </div>
    <div className="yomi-shelf-controls">
      <label className="sr-only" htmlFor="library-collection">Collection</label>
      <select id="library-collection" className="yomi-field yomi-collection-select" value={activeCategoryId !== null && !String(activeCategoryId).startsWith("smart:") ? String(activeCategoryId) : ""} onChange={(event) => onCategorySelect(event.target.value === "" ? null : event.target.value)}>
        <option value="">Collections</option>{categories.map((cat) => <option key={cat.id} value={String(cat.id)}>{cat.name}</option>)}
      </select>
      <button className="yomi-icon-button" aria-label="Manage Categories" title="Manage collections" onClick={onManageCategories}><FolderEdit /></button>
      <LibraryUpdateButton />
      <span className="yomi-control-divider" aria-hidden="true" />
      <select className="yomi-field yomi-sort-select" aria-label="Sort library" value={sortMode} onChange={(event) => onSortModeChange(event.target.value as LibrarySortMode)}>
        <option value="title">Title</option><option value="unread">Unread</option><option value="status">Reading status</option>
      </select>
      <button className="yomi-icon-button" aria-label={sortDescending ? "Sort ascending" : "Sort descending"} title={sortDescending ? "Sort ascending" : "Sort descending"} onClick={() => onSortDirectionChange(!sortDescending)}>{sortDescending ? <ArrowDownAZ /> : <ArrowUpAZ />}</button>
      <div className="yomi-view-switch" role="group" aria-label="Library view">
        <button className="yomi-icon-button" aria-label="Grid view" aria-pressed={viewMode === "grid"} onClick={() => onViewModeChange("grid")}><Grid2X2 /></button>
        <button className="yomi-icon-button" aria-label="List view" aria-pressed={viewMode === "list"} onClick={() => onViewModeChange("list")}><List /></button>
      </div>
      <button className="yomi-button yomi-button-secondary yomi-select-books" onClick={onStartSelect}>Select</button>
    </div>
  </div>;
}
