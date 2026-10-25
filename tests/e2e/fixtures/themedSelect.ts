import { expect, type Locator } from "@playwright/test";

/** Exercise the visible popup rather than changing a hidden form control. */
export async function chooseOption(control: Locator, value: string) {
  await control.click();
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ");
  const option = control.page().locator(`[role="option"][data-value="${escaped}"]`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(control).toHaveAttribute("data-value", String(value));
}
