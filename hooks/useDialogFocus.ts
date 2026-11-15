"use client";

import { useEffect, type RefObject } from "react";

/** Keyboard containment and focus restoration for mounted photo viewers. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const targets = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0 && element.tabIndex >= 0);
    (targets()[0] ?? dialog).focus({ preventScroll: true });
    document.body.style.overflow = "hidden";

    function containFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const elements = targets();
      const first = elements[0];
      const last = elements.at(-1);
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        dialog!.focus();
      } else if (!dialog!.contains(active) || active === dialog || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
    document.addEventListener("keydown", containFocus);
    return () => {
      document.removeEventListener("keydown", containFocus);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref]);
}
