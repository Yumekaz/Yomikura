import { Search, FolderEdit, X } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { LibraryUpdateButton } from "../../components/library/LibraryUpdateButton";

export interface Category {
  id: string | number;
  name: string;
}

interface LibraryFiltersProps {
  categories: Category[];
  activeCategoryId: string | number | null;
  onCategorySelect: (id: string | number | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onManageCategories: () => void;
  
  // Selection mode additions
  isSelectMode?: boolean;
  selectedCount?: number;
  onSelectAll?: () => void;
  onCancelSelect?: () => void;
}

export function LibraryFilters({
  categories,
  activeCategoryId,
  onCategorySelect,
  searchQuery,
  onSearchChange,
  onManageCategories,
  isSelectMode = false,
  selectedCount = 0,
  onSelectAll,
  onCancelSelect,
}: LibraryFiltersProps) {
  const { t } = useTranslation();

  if (isSelectMode) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-yomi-jade/30 bg-yomi-jade/10 backdrop-blur-xl shadow-glow-hover px-5 py-3 mx-4 lg:mx-0 mt-2 lg:mt-0 mb-6 animate-fade-in transition-all duration-300">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancelSelect}
            className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold text-slate-200">
            {selectedCount} Selected
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {onSelectAll && (
            <button
              onClick={onSelectAll}
              className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-1.5 text-xs font-bold text-slate-200 transition"
            >
              Select All
            </button>
          )}
          <button
            onClick={onCancelSelect}
            className="rounded-lg bg-yomi-jade px-3.5 py-1.5 text-xs font-bold text-ink-950 hover:bg-yomi-jade/90 transition"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-ink-900/35 backdrop-blur-xl shadow-lg px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between mx-4 lg:mx-0 mt-2 lg:mt-0 mb-6 transition-all duration-300">
      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide lg:pb-0 order-2 lg:order-1 flex-1">
        <button
          onClick={() => onCategorySelect(null)}
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-300 ${
            activeCategoryId === null
              ? "bg-gradient-to-r from-yomi-jade to-yomi-mint text-ink-950 shadow-glow scale-[1.02]"
              : "bg-white/5 border border-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 hover:scale-[1.01]"
          }`}
        >
          {t("all")}
        </button>

        {/* Smart Categories */}
        {[
          { id: "smart:reading", name: t("reading") },
          { id: "smart:plan_to_read", name: t("plan_to_read") },
          { id: "smart:completed", name: t("completed") },
          { id: "smart:downloaded", name: t("downloaded") },
        ].map((smartCat) => (
          <button
            key={smartCat.id}
            onClick={() => onCategorySelect(smartCat.id)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-300 ${
              activeCategoryId === smartCat.id
                ? "bg-gradient-to-r from-yomi-jade/80 to-yomi-mint/80 text-ink-950 shadow-glow scale-[1.02] border border-yomi-jade/30"
                : "bg-white/5 border border-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 hover:scale-[1.01]"
            }`}
          >
            {smartCat.name}
          </button>
        ))}

        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategorySelect(cat.id)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-300 ${
              activeCategoryId === cat.id
                ? "bg-gradient-to-r from-yomi-jade to-yomi-mint text-ink-950 shadow-glow scale-[1.02]"
                : "bg-white/5 border border-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 hover:scale-[1.01]"
            }`}
          >
            {cat.name}
          </button>
        ))}
        
        {/* Manage Categories Action */}
        <button
          onClick={onManageCategories}
          className="flex-shrink-0 rounded-full bg-white/5 border border-white/10 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-all duration-200 hover:rotate-12 hover:scale-105"
          title="Manage Categories"
        >
          <FolderEdit className="h-4 w-4" />
        </button>
      </div>

      <div className="flex w-full items-center gap-2 order-1 lg:order-2 lg:w-auto">
        <LibraryUpdateButton />
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-950/40 focus-within:border-yomi-jade/50 focus-within:shadow-glow px-3.5 py-2 lg:w-72 transition-all duration-300">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search library..."
            className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
