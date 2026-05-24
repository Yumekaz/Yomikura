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
    <div className="flex flex-col gap-4 border-b border-white/10 bg-ink-950 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide lg:pb-0 order-2 lg:order-1 flex-1">
        <button
          onClick={() => onCategorySelect(null)}
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            activeCategoryId === null
              ? "bg-yomi-jade text-ink-950"
              : "bg-ink-850 text-slate-400 hover:bg-white/10 hover:text-slate-200"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategorySelect(cat.id)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeCategoryId === cat.id
                ? "bg-yomi-jade text-ink-950"
                : "bg-ink-850 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            }`}
          >
            {cat.name}
          </button>
        ))}
        
        {/* Manage Categories Action */}
        <button
          onClick={onManageCategories}
          className="flex-shrink-0 rounded-full bg-white/5 border border-white/10 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          title="Manage Categories"
        >
          <FolderEdit className="h-4 w-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-ink-900 px-3 py-2 lg:w-96 order-1 lg:order-2">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search library..."
          className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}

