import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

// Used by component tests with the happy-dom environment. No browser layout
// or native Tauri behavior is simulated by this helper.
export async function render(element: ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const rerender = async (next: ReactNode) => {
    await act(async () => root.render(next));
  };
  await rerender(element);
  return {
    container,
    rerender,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

export async function waitForRender(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assertion();
  });
}
