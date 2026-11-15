"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import styles from "./ThemeToggle.module.css";

/** The same native, keyboard-accessible theme control in both navigation layouts. */
export function ThemeToggle() {
  const { resolvedTheme, toggle } = useTheme();
  const label = resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const Icon = resolvedTheme === "dark" ? Sun : Moon;

  return (
    <button type="button" onClick={toggle} className={styles.button} aria-label={label} title={label}>
      <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}
