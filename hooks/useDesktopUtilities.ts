"use client";

import { useSyncExternalStore } from "react";

const query = "(min-width: 1024px)";
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

/** Desktop corner utilities never mount observers or artwork on phones/tablets. */
export function useDesktopUtilities() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
