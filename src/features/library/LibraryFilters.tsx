import { Search, FolderEdit } from "lucide-react";

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
}

export function LibraryFilters({
  categories,
  activeCategoryId,
  onCategorySelect,
  searchQuery,
  onSearchChange,
  onManageCategories,
}: LibraryFiltersProps) {
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
          All
        </button>
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

      {/* Search Input */}
      <div className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-ink-950/40 focus-within:border-yomi-jade/50 focus-within:shadow-glow px-3.5 py-2 lg:w-80 order-1 lg:order-2 transition-all duration-300">
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
  );
}

