"use client";

import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import styles from "./BrowseControls.module.css";

export type FilterSelectOption = { value: string; label: string; count?: number; avatarUrl?: string; icon?: ReactNode; disabled?: boolean };

// Load the react-aria select only where a picker renders. The server still
// renders the full control; this keeps it out of each page's initial JS.
const FilterSelectControl = lazy(() => import("./FilterSelectControl").then((module) => ({ default: module.FilterSelectControl })));

/** Shared browse picker: consistent label, trigger, portal, and keyboard behavior. */
export function FilterSelect(props: ComponentProps<typeof FilterSelectControl>) {
  const selected = props.options.find((option) => option.value === props.value);
  return (
    <Suspense fallback={
      <div className={`${styles.select} ${props.className ?? ""}`}>
        <span aria-hidden className="flex h-[46px] w-full items-center rounded-[.8rem] border border-[color:var(--ui-line)] bg-[color:var(--bg-elev)] px-3 text-[.9375rem] text-[color:var(--ink)]">{selected?.label ?? "Choose…"}</span>
      </div>
    }>
      <FilterSelectControl {...props} />
    </Suspense>
  );
}
