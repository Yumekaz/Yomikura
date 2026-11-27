// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, waitForRender } from "../../test/render";
import { BulkCategoryModal } from "./BulkCategoryModal";

const mocks = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn(), selected: vi.fn() }));
vi.mock("../../api/graphql/client", () => ({
  createGraphqlClient: () => ({ GetMigrationManga: mocks.read, UpdateMangaCategories: mocks.update }),
}));
vi.mock("../../api/suwayomi/libraryUpdateState", () => ({ isSelectedLibrary: mocks.selected }));
vi.mock("../ui/FeedbackProvider", () => ({ useFeedback: () => ({ confirm: vi.fn() }) }));

let view: Awaited<ReturnType<typeof render>> | undefined;
let client: QueryClient | undefined;
afterEach(async () => {
  await view?.unmount();
  client?.clear();
  vi.resetAllMocks();
});

async function fixture() {
  const books = [
    { id: 1, title: "Courier", categoryIds: [1, 3] },
    { id: 2, title: "Garden", categoryIds: [2, 3] },
  ];
  const records = new Map(books.map((book) => [book.id, [...book.categoryIds]]));
  const categories = [
    { id: 1, name: "Courier only" },
    { id: 2, name: "Garden only" },
    { id: 3, name: "Shared" },
    { id: 4, name: "Weekend" },
  ];
  mocks.selected.mockReturnValue(true);
  mocks.read.mockImplementation(async ({ id }: { id: number }) => ({
    manga: { ...books.find((book) => book.id === id), inLibrary: true, categories: { nodes: records.get(id)?.map((id) => ({ id })) } },
  }));
  const update = async ({ input }: { input: { id: number; patch: { addToCategories: number[]; removeFromCategories: number[] } } }) => {
    const retained = records.get(input.id)!.filter((id) => !input.patch.removeFromCategories.includes(id));
    records.set(input.id, [...new Set([...retained, ...input.patch.addToCategories])]);
    return { updateMangaCategories: { manga: { id: input.id } } };
  };
  mocks.update.mockImplementation(update);
  const close = vi.fn();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  view = await render(<QueryClientProvider client={client}><BulkCategoryModal
    backend={{ key: "fixture", serverBaseUrl: "http://localhost:4567", isDemo: false, libraryId: "fixture" }}
    books={books}
    categories={categories}
    onClose={close}
  /></QueryClientProvider>);
  const inputs = [...view.container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
  const apply = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Apply")!;
  return { records, close, inputs, apply, update };
}

it("shows actual shared and mixed membership and makes untouched Apply a no-op", async () => {
  const { close, inputs, apply } = await fixture();
  expect(inputs.map((input) => [input.checked, input.indeterminate])).toEqual([[false, true], [false, true], [true, false], [false, false]]);
  await act(async () => apply.click());
  expect(close).toHaveBeenCalledOnce();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});

it("adds one category and removes a shared category without overwriting unrelated memberships", async () => {
  const { records, close, inputs, apply } = await fixture();
  records.get(2)!.push(5); // Changed by another client while this editor was open.
  await act(async () => { inputs[2].click(); inputs[3].click(); apply.click(); });
  await waitForRender(() => expect(close).toHaveBeenCalledOnce());
  expect(records.get(1)).toEqual([1, 4]);
  expect(records.get(2)).toEqual([2, 5, 4]);
  expect(mocks.update).toHaveBeenNthCalledWith(1, { input: { id: 1, patch: { addToCategories: [4], removeFromCategories: [3] } } }, undefined, expect.any(AbortSignal));
  expect(mocks.update).toHaveBeenNthCalledWith(2, { input: { id: 2, patch: { addToCategories: [4], removeFromCategories: [3] } } }, undefined, expect.any(AbortSignal));
});

it("reports an unconfirmed title and can retry without rewriting already-applied memberships", async () => {
  const { records, close, inputs, apply, update } = await fixture();
  mocks.update.mockImplementationOnce(update).mockRejectedValueOnce(new Error("Disconnected"));
  await act(async () => { inputs[3].click(); apply.click(); });
  await waitForRender(() => expect(view?.container.querySelector('[role="alert"]')?.textContent).toContain("1 of 2 titles. Garden"));
  expect(close).not.toHaveBeenCalled();
  expect(records.get(1)).toEqual([1, 3, 4]);
  await act(async () => apply.click());
  await waitForRender(() => expect(close).toHaveBeenCalledOnce());
  expect(records.get(2)).toEqual([2, 3, 4]);
  expect(mocks.update.mock.calls.map(([{ input }]) => input.id)).toEqual([1, 2, 2]);
});

it("does not send a mutation if the selected library changes during the membership read", async () => {
  const { close, inputs, apply } = await fixture();
  mocks.read.mockImplementationOnce(async () => {
    mocks.selected.mockReturnValue(false);
    return { manga: { id: 1, title: "Courier", inLibrary: true, categories: { nodes: [{ id: 1 }] } } };
  });
  await act(async () => { inputs[3].click(); apply.click(); });
  await waitForRender(() => expect(apply.disabled).toBe(false));
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
