import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2, Edit2, Loader2, Save, ArrowUp, ArrowDown } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { isSelectedLibrary } from "../../api/suwayomi/libraryUpdateState";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { useModalFocus } from "../../hooks/useModalFocus";

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
  const backend = useProgressBackend();
  return backend ? <CategoryManager key={backend.key} backend={backend} isOpen={isOpen} onClose={onClose} categories={categories.filter((item) => Number(item.id) > 0)} /> : null;
}

function CategoryManager({ isOpen, onClose, categories, backend }: CategoryDialogProps & { backend: ProgressBackend }) {
  const modal = useModalFocus(isOpen, onClose);
  const { confirm } = useFeedback();
  const queryClient = useQueryClient();
  const [newCatName, setNewCatName] = useState("");
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const sdk = useMemo(() => {
    return createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live");
  }, [backend]);
  const assertSelected = () => { if (!isSelectedLibrary(backend)) throw new Error("Your active library changed. Open its collection manager again."); };
  const { mutate: moveCategory, isPending: moving } = useMutation({ mutationFn: async ({ id, position }: { id: number; position: number }) => {
    assertSelected();
    const saved = (await sdk.UpdateCategoryOrder({ input: { id, position } }, undefined, AbortSignal.timeout(15000))).updateCategoryOrder?.categories;
    if (!saved || saved.find((item) => item.id === id)?.order !== position) throw new Error("Your library did not confirm the collection order.");
  }, onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["categories"] }); void queryClient.invalidateQueries({ queryKey: ["library-policy", backend.key] }); }, onError: () => setErrorMsg("The order wasn’t confirmed. Reload the collection list and try again.") });

  // Mutation: Create Category
  const { mutate: createCat, isPending: creating } = useMutation({
    mutationFn: async (name: string) => {
      assertSelected();
      const saved = await sdk.CreateCategory({
        input: { name },
      }, undefined, AbortSignal.timeout(15000));
      if (!saved.createCategory?.category || saved.createCategory.category.name !== name) throw new Error("The new collection wasn’t confirmed.");
      return saved;
    },
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
    mutationFn: async (id: number) => {
      assertSelected();
      const clientMutationId = crypto.randomUUID();
      const saved = await sdk.DeleteCategory({ input: { categoryId: id, clientMutationId } }, undefined, AbortSignal.timeout(15000));
      if (saved.deleteCategory?.clientMutationId !== clientMutationId) throw new Error("The removal wasn’t confirmed.");
    },
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
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      assertSelected();
      const saved = await sdk.UpdateCategory({
        input: {
          id,
          patch: { name },
        },
      }, undefined, AbortSignal.timeout(15000));
      if (saved.updateCategory?.category?.id !== id || saved.updateCategory.category.name !== name) throw new Error("The new name wasn’t confirmed.");
    },
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
      <div {...modal} className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" role="dialog" aria-modal="true" aria-labelledby="category-dialog-title">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <h2 id="category-dialog-title" className="text-lg font-semibold text-white">Manage Categories</h2>
          <button
            onClick={onClose}
            aria-label="Close category manager"
            className="rounded-full p-1.5 hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Message */}
        {errorMsg && <p role="alert" className="mt-3 text-sm text-red-400">{errorMsg}</p>}

        {/* Categories List */}
        <div className="mt-4 max-h-60 overflow-y-auto space-y-2 pr-1">
          {categories.map((cat, index) => (
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
                  aria-label={`Rename category ${cat.name}`}
                />
              ) : (
                <span className="text-sm font-medium text-slate-200 truncate">{cat.name}</span>
              )}

              <div className="flex items-center gap-1 shrink-0">
                <button type="button" aria-label={`Move ${cat.name} up`} disabled={moving || index === 0} onClick={() => moveCategory({ id: Number(cat.id), position: index })} className="yomi-icon-button disabled:opacity-30"><ArrowUp /></button>
                <button type="button" aria-label={`Move ${cat.name} down`} disabled={moving || index === categories.length - 1} onClick={() => moveCategory({ id: Number(cat.id), position: index + 2 })} className="yomi-icon-button disabled:opacity-30"><ArrowDown /></button>
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
                  onClick={async () => {
                    if (await confirm({ title: `Delete “${cat.name}”?`, detail: "The category will be removed. Manga inside it stay in your library.", confirmLabel: "Delete category", danger: true })) deleteCat(parseInt(String(cat.id)));
                  }}
                  aria-label={`Delete category ${cat.name}`}
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
            aria-label="New category name"
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
