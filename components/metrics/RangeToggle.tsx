"use client";

import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";

export type RangeOption<T extends string> = { key: T; label: string };

/**
 * Untitled UI segmented range selector. Wraps the UUI ButtonGroup with
 * single-selection wired to a controlled value so the metrics dashboards
 * share one consistent control instead of hand-rolled pill rows.
 */
export function RangeToggle<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel = "Select range",
}: {
  options: ReadonlyArray<RangeOption<T>>;
  value: T;
  onChange: (next: T) => void;
  "aria-label"?: string;
}) {
  return (
    <ButtonGroup
      size="sm"
      aria-label={ariaLabel}
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        if (next != null) onChange(String(next) as T);
      }}
      disallowEmptySelection
    >
      {options.map((o) => (
        <ButtonGroupItem key={o.key} id={o.key}>
          {o.label}
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  );
}
