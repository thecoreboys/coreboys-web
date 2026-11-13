"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import type { SelectItemType } from "@/components/base/select/select";

export type WatchSelectOption = SelectItemType & { label: string };

// The react-aria select (list box, popover, collections) is one of the largest
// client chunks. Load it only where a select actually renders; the server still
// renders the full control, so hydration keeps the same markup.
const WatchSelectControl = lazy(() => import("./WatchSelectControl").then((module) => ({ default: module.WatchSelectControl })));

type WatchSelectProps = ComponentProps<typeof WatchSelectControl>;

export function WatchSelect(props: WatchSelectProps) {
  const label = props.options.find((option) => option.id === props.value)?.label ?? "";
  return (
    <Suspense fallback={
      <div className={`w-full ${props.className ?? ""}`}>
        <span aria-hidden className={`flex w-full items-center rounded-xl bg-[color:var(--ui-surface)] px-3 text-sm font-medium text-[color:var(--ink)] ring-1 ring-[color:var(--ui-line)] ring-inset ${props.compact ? "min-h-9" : "min-h-11"}`}>{label}</span>
      </div>
    }>
      <WatchSelectControl {...props} />
    </Suspense>
  );
}
