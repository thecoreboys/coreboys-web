/** Hidden responsive panels must not participate in a dialog's focus order. */
export function visibleDialogControls(dialog: HTMLElement | null): HTMLElement[] {
  if (!dialog) return [];
  return [...dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((node) => node.tabIndex >= 0
    && node.getClientRects().length > 0
    && !node.closest('[hidden], [inert], [aria-hidden="true"]'));
}

export function dialogTabBoundary<T>(controls: readonly T[], active: T | null, backwards: boolean): T | null {
  if (!controls.length) return null;
  const first = controls[0]!;
  const last = controls[controls.length - 1]!;
  if (!controls.includes(active as T)) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}
