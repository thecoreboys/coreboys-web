"use client";

import { Select } from "@/components/base/select/select";
import type { ReactNode } from "react";
import styles from "./BrowseControls.module.css";

export type FilterSelectOption = { value: string; label: string; count?: number; avatarUrl?: string; icon?: ReactNode; disabled?: boolean };

/** Shared browse picker: consistent label, trigger, portal, and keyboard behavior. */
export function FilterSelect({ label, ariaLabel, value, options, onChange, className = "", disabled = false }: {
  label: string;
  ariaLabel?: string;
  value: string;
  options: readonly FilterSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  // Nonempty keys preserve the genuine empty-string “All” value as a selection.
  const items = options.map((option) => ({
    id: `filter:${option.value}`,
    label: `${option.label}${option.count !== undefined ? ` (${option.count})` : ""}`,
    avatarUrl: option.avatarUrl,
    icon: option.icon,
    isDisabled: option.disabled,
  }));
  return <Select
    label={label}
    aria-label={ariaLabel ?? label}
    selectedKey={options.some((option) => option.value === value) ? `filter:${value}` : null}
    onSelectionChange={(key) => {
      const option = options.find((option) => `filter:${option.value}` === key);
      if (option) onChange(option.value);
    }}
    items={items}
    isDisabled={disabled}
    placeholder="Choose…"
    size="sm"
    className={`${styles.select} ${className}`}
    popoverClassName={styles.menu}
  >{(item) => <Select.Item {...item} className={styles.option} />}</Select>;
}
