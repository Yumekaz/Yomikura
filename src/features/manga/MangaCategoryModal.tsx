import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Save } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { getErrorMessage } from "../../api/suwayomi/errors";

interface MangaCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  mangaId: number;
  currentCategoryIds: number[];
}

export function MangaCategoryModal({
  isOpen,
  onClose,
  mangaId,
  currentCategoryIds,
}: MangaCategoryModalProps) {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch all categories
  const { data: catData, isLoading: loadingCats } = useQuery({
    queryKey: ["categories", serverBaseUrl],
    queryFn: () => sdk.GetCategories(),
    enabled: isOpen && !!serverBaseUrl,
  });

  const categories = useMemo(() => {
    if (!catData?.categories?.edges) return [];
    return catData.categories.edges
      .map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node != null)
      .map((cat) => ({
        id: parseInt(String(cat.id)),
        name: cat.name,
      }));
  }, [catData]);

  // Sync selected categories when modal opens or current categories change
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(currentCategoryIds);
      setErrorMsg("");
    }
  }, [isOpen, currentCategoryIds]);

  // Mutation: Update categories assignment
  const { mutate: saveCategories, isPending: saving } = useMutation({
    mutationFn: () =>
      sdk.UpdateMangaCategories({
        input: {
          id: mangaId,
          patch: {
            clearCategories: true,
            addToCategories: selectedIds,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manga", String(mangaId)] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      onClose();
    },
    onError: (err) => {
      setErrorMsg(`Save failed: ${getErrorMessage(err)}`);
    },
  });

  // Mutation: Remove from library
  const { mutate: removeFromLibrary, isPending: removing } = useMutation({
    mutationFn: () =>
      sdk.ToggleMangaLibrary({
        input: {
          id: mangaId,
          patch: {
            inLibrary: false,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manga", String(mangaId)] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      onClose();
    },
    onError: (err) => {
      setErrorMsg(`Remove failed: ${getErrorMessage(err)}`);
    },
  });

  const handleToggle = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <h2 className="text-lg font-semibold text-white">Select Categories</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error */}
        {errorMsg && <p className="mt-3 text-sm text-red-400">{errorMsg}</p>}

        {/* List */}
        {loadingCats ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-yomi-jade" />
          </div>
        ) : (
          <div className="mt-4 max-h-56 overflow-y-auto space-y-3">
            {categories.map((cat) => (
              <label
                key={cat.id}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-ink-950/30 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(cat.id)}
                  onChange={() => handleToggle(cat.id)}
                  className="rounded border-slate-700 bg-ink-950 text-yomi-jade focus:ring-yomi-jade/50 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-200">{cat.name}</span>
              </label>
            ))}

            {categories.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-6">No custom categories created yet.</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/5 pt-4">
          <button
            onClick={() => removeFromLibrary()}
            disabled={removing || saving}
            className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
          >
            {removing ? "Removing..." : "Remove"}
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={() => saveCategories()}
              disabled={saving || removing || loadingCats}
              className="flex items-center gap-1.5 rounded-lg bg-yomi-jade px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-yomi-jade/90 disabled:opacity-50 transition"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
