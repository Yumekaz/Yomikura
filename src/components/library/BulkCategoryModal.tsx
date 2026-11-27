import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Save } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { type ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { isSelectedLibrary } from "../../api/suwayomi/libraryUpdateState";
import { useFeedback } from "../ui/FeedbackProvider";
import { useModalFocus } from "../../hooks/useModalFocus";

interface BulkBook {
  id: number;
  title: string;
  categoryIds: readonly number[];
}

interface BulkCategoryModalProps {
  backend: ProgressBackend;
  onClose: () => void;
  books: BulkBook[];
  categories: { id: number; name: string }[];
}

type CategoryMembership = "all" | "some" | "none";
type CategoryPatch = { addToCategories: number[]; removeFromCategories: number[] };

export function BulkCategoryModal({ backend, onClose, books, categories }: BulkCategoryModalProps) {
  const { confirm } = useFeedback();
  const queryClient = useQueryClient();
  const [membership] = useState(() => new Map(categories.map(({ id }) => {
    const count = books.filter((book) => book.categoryIds.includes(id)).length;
    const state: CategoryMembership = count === 0 ? "none" : count === books.length ? "all" : "some";
    return [id, state] as const;
  })));
  const [changes, setChanges] = useState(new Map<number, boolean>());
  const [errorMsg, setErrorMsg] = useState("");

  const run = async (patch: CategoryPatch | null) => {
    const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live");
    const failures: string[] = [];
    const requireSelectedLibrary = () => {
      if (!isSelectedLibrary(backend)) throw new Error("Your connected library changed. Open bulk categories again.");
    };
    requireSelectedLibrary();
    for (const book of books) {
      requireSelectedLibrary();
      try {
        const signal = AbortSignal.timeout(15000);
        const current = (await sdk.GetMigrationManga({ id: book.id }, undefined, signal)).manga;
        requireSelectedLibrary();
        if (current?.id !== book.id || current.title !== book.title) throw new Error("This title changed while the editor was open.");
        if (patch && !current.inLibrary) throw new Error("This title is no longer in your library.");
        if (!patch && current.inLibrary) await sdk.ToggleMangaLibrary({ input: { id: book.id, patch: { inLibrary: false } } }, undefined, signal);
        if (patch) {
          const currentIds = new Set(current.categories.nodes.map((category) => category.id));
          const addToCategories = patch.addToCategories.filter((id) => !currentIds.has(id));
          const removeFromCategories = patch.removeFromCategories.filter((id) => currentIds.has(id));
          if (addToCategories.length || removeFromCategories.length) {
            await sdk.UpdateMangaCategories({ input: { id: book.id, patch: { addToCategories, removeFromCategories } } }, undefined, signal);
          }
        }
        const confirmed = (await sdk.GetMigrationManga({ id: book.id }, undefined, signal)).manga;
        requireSelectedLibrary();
        const confirmedIds = new Set(confirmed?.categories.nodes.map((category) => category.id));
        if (confirmed?.id !== book.id || confirmed.title !== book.title || (patch
          ? !confirmed.inLibrary || patch.addToCategories.some((id) => !confirmedIds.has(id))
            || patch.removeFromCategories.some((id) => confirmedIds.has(id))
          : confirmed.inLibrary)) throw new Error("The change could not be confirmed.");
      } catch (error) {
        failures.push(`${book.title}: ${getErrorMessage(error)}`);
      }
    }
    return failures;
  };

  const { mutate, isPending } = useMutation({
    mutationFn: run,
    onMutate: () => setErrorMsg(""),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      for (const { id } of books) void queryClient.invalidateQueries({ queryKey: ["manga", String(id)] });
    },
    onSuccess: (failures) => {
      if (!isSelectedLibrary(backend)) return;
      if (failures.length) setErrorMsg(`Changes could not be confirmed for ${failures.length} of ${books.length} titles. ${failures.join(" ")}`);
      else onClose();
    },
    onError: (error) => setErrorMsg(getErrorMessage(error)),
  });
  const close = () => { if (!isPending) onClose(); };
  const modal = useModalFocus(true, close);

  const toggle = (id: number) => {
    const original = membership.get(id);
    setChanges((current) => {
      const next = new Map(current);
      const value = next.get(id);
      if (original === "some") {
        // Mixed → add to all → remove from all → leave unchanged.
        if (value === false) next.delete(id); else next.set(id, value === undefined);
      } else if (value !== undefined) {
        next.delete(id);
      } else {
        next.set(id, original !== "all");
      }
      return next;
    });
  };

  const apply = () => {
    if (!changes.size) { close(); return; }
    const patch: CategoryPatch = { addToCategories: [], removeFromCategories: [] };
    for (const [id, included] of changes) {
      (included ? patch.addToCategories : patch.removeFromCategories).push(id);
    }
    mutate(patch);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm select-none">
      <div {...modal} className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel" role="dialog" aria-modal="true" aria-labelledby="bulk-category-title" aria-busy={isPending}>
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h2 id="bulk-category-title" className="text-lg font-semibold text-white">Bulk Categories</h2>
            <p className="text-xs text-slate-400">Applying to {books.length} selected {books.length === 1 ? "title" : "titles"}</p>
          </div>
          <button type="button" onClick={close} disabled={isPending} aria-label="Close bulk category editor" className="yomi-icon-button">
            <X />
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">Only edited categories change. A dash means some selected titles are in that category.</p>
        {errorMsg && <p role="alert" className="mt-3 max-h-28 overflow-y-auto text-sm text-red-400">{errorMsg}</p>}
        <div className="mt-4 max-h-56 overflow-y-auto space-y-3">
          {categories.map(({ id, name }) => {
            const change = changes.get(id), original = membership.get(id);
            const mixed = change === undefined && original === "some";
            return (
              <label key={id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-ink-950/30 px-3 py-2.5 cursor-pointer hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={change ?? original === "all"}
                  ref={(input) => { if (input) input.indeterminate = mixed; }}
                  onChange={() => toggle(id)}
                  disabled={isPending}
                  className="h-4 w-4 shrink-0"
                />
                <span className="min-w-0 text-sm font-medium text-slate-200">{name}</span>
              </label>
            );
          })}
          {categories.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No custom categories created yet.</p>}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/5 pt-4">
          <button type="button" onClick={async () => {
            if (await confirm({ title: `Remove ${books.length} titles?`, detail: "The selected titles leave your library. Reading progress on the server is not deleted.", confirmLabel: "Remove titles", danger: true })) mutate(null);
          }} disabled={isPending} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50">
            Remove
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={isPending} className="yomi-button yomi-button-secondary">Cancel</button>
            <button type="button" onClick={apply} disabled={isPending} className="yomi-button yomi-button-primary">
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
