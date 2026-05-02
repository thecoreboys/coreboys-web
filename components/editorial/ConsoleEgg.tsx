"use client";

import { useEffect } from "react";

const ASCII = `
   ▄████▄    ▒█████   ██▀███  ▓█████
  ▒██▀ ▀█   ▒██▒  ██▒▓██ ▒ ██▒▓█   ▀
  ▒▓█    ▄  ▒██░  ██▒▓██ ░▄█ ▒▒███
  ▒▓▓▄ ▄██▒ ▒██   ██░▒██▀▀█▄  ▒▓█  ▄
  ▒ ▓███▀ ░ ░ ████▓▒░░██▓ ▒██▒░▒████▒
  ░ ░▒ ▒  ░ ░ ▒░▒░▒░ ░ ▒▓ ░▒▓░░░ ▒░ ░
    ░  ▒      ░ ▒ ▒░   ░▒ ░ ▒░ ░ ░  ░

  Create. Own. Run. Everything.
`;

/**
 * Console easter egg — prints once, on first paint.
 * Best effort, no UI.
 */
export function ConsoleEgg() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as unknown as { __coreboys_egg?: boolean }).__coreboys_egg) return;
    (window as unknown as { __coreboys_egg?: boolean }).__coreboys_egg = true;
    // eslint-disable-next-line no-console
    console.log(
      `%c${ASCII}`,
      "color:#FF6A00;font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.2;",
    );
  }, []);
  return null;
}
