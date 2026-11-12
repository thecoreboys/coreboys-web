"use client";

import { useSyncExternalStore } from "react";
import { isNativeAppRuntime } from "@/lib/native-app";

function subscribe(onChange: () => void) {
  const events = ["DOMContentLoaded", "load", "pageshow"] as const;
  for (const event of events) window.addEventListener(event, onChange);
  return () => { for (const event of events) window.removeEventListener(event, onChange); };
}

const clientSnapshot = () => isNativeAppRuntime(window);
// Withhold web-only surfaces through hydration to avoid a flash in the app.
const serverSnapshot = () => null;

export function useNativeApp(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, clientSnapshot, serverSnapshot);
}
