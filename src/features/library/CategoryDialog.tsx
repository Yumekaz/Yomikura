import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2, Edit2, Loader2, Save } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { getErrorMessage } from "../../api/suwayomi/errors";

interface Category {
  id: string | number;
  name: string;
}

interface CategoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
}

export function CategoryDialog({ isOpen, onClose, categories }: CategoryDialogProps) {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [newCatName, setNewCatName] = useState("");
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Mutation: Create Category
  const { mutate: createCat, isPending: creating } = useMutation({
    mutationFn: (name: string) =>
      sdk.CreateCategory({
        input: { name },
      }),
    onSuccess: () => {
      setNewCatName("");
      setErrorMsg("");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (err) => {
      setErrorMsg(`Create failed: ${getErrorMessage(err)}`);
    },
  });

  // Mutation: Delete Category
  const { mutate: deleteCat } = useMutation({
    mutationFn: (id: number) =>
      sdk.DeleteCategory({
        input: { categoryId: id },
      }),
    onSuccess: () => {
      setErrorMsg("");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (err) => {
      setErrorMsg(`Delete failed: ${getErrorMessage(err)}`);
    },
  });

  // Mutation: Rename Category
  const { mutate: updateCat, isPending: updating } = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      sdk.UpdateCategory({
        input: {
          id,
          patch: { name },
        },
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditingName("");
      setErrorMsg("");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (err) => {
      setErrorMsg(`Rename failed: ${getErrorMessage(err)}`);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    createCat(newCatName.trim());
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  const handleSaveRename = (id: string | number) => {
    if (!editingName.trim()) return;
    updateCat({ id: parseInt(String(id)), name: editingName.trim() });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <h2 className="text-lg font-semibold text-white">Manage Categories</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Message */}
        {errorMsg && <p className="mt-3 text-sm text-red-400">{errorMsg}</p>}

        {/* Categories List */}
        <div className="mt-4 max-h-60 overflow-y-auto space-y-2 pr-1">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-ink-950/40 p-2.5"
            >
              {editingId === cat.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="flex-1 rounded bg-ink-900 px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-yomi-jade/50 border border-white/5"
                  autoFocus
                />
              ) : (
                <span className="text-sm font-medium text-slate-200 truncate">{cat.name}</span>
              )}

              <div className="flex items-center gap-1 shrink-0">
                {editingId === cat.id ? (
                  <button
                    onClick={() => handleSaveRename(cat.id)}
                    disabled={updating}
                    className="p-1.5 text-yomi-jade hover:bg-yomi-jade/10 rounded transition"
                    title="Save Rename"
                  >
                    {updating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => handleStartEdit(cat)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded transition"
                    title="Rename"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm(`Delete category "${cat.name}"?`)) {
                      deleteCat(parseInt(String(cat.id)));
                    }
                  }}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {categories.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-6">No custom categories created yet.</p>
          )}
        </div>

        {/* Add Form */}
        <form onSubmit={handleCreate} className="mt-6 flex gap-2 border-t border-white/5 pt-4">
          <input
            type="text"
            placeholder="New category name..."
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="flex-1 rounded-lg bg-ink-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-yomi-jade/50 border border-white/5"
            required
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !newCatName.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-yomi-jade px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-yomi-jade/90 disabled:opacity-50 transition"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
