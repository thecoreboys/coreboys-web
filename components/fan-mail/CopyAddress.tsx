"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy01 } from "@untitledui/icons";

/**
 * Copy-to-clipboard button styled as a typewriter pill on the paper card.
 *
 *   - Primary path: `navigator.clipboard.writeText` (secure context).
 *   - Fallback: hidden <textarea> + `document.execCommand('copy')` for
 *     non-secure contexts (e.g. local network previews on plain HTTP).
 *   - Inline state change to "Copied" and a 2.5s revert.
 *   - Keyboard accessible — `Enter`/`Space` activate normally.
 */
export function CopyAddress({
  payload,
  label = "Copy address",
}: {
  payload: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function copy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        legacyCopy(payload);
      }
      setCopied(true);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Last-resort fallback if writeText threw despite being available.
      try {
        legacyCopy(payload);
        setCopied(true);
        timerRef.current = window.setTimeout(() => setCopied(false), 2500);
      } catch {
        // Give up silently — the address is still rendered above.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      aria-label={copied ? "Address copied to clipboard" : label}
      data-copied={copied ? "1" : "0"}
      className="paper-button inline-flex items-center gap-2"
    >
      {copied ? <Check className="size-3" aria-hidden /> : <Copy01 className="size-3" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

function legacyCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  // execCommand is deprecated but still works in non-secure contexts.
  document.execCommand("copy");
  document.body.removeChild(ta);
}
