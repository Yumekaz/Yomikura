export function readerShortcutAllowed(event: KeyboardEvent) {
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, button, a, [role="button"], [role="slider"], [role="switch"], [role="combobox"], [role="textbox"], [role="listbox"], [role="option"], [role="tab"], [role="dialog"], [role="alertdialog"]')) return false;
  const editable = target.closest("[contenteditable]");
  return !(target instanceof HTMLElement && target.isContentEditable) && (!editable || editable.getAttribute("contenteditable") === "false");
}
