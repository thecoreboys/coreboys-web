"use client";

import { Select as UntitledSelect, type SelectItemType } from "@/components/base/select/select";

export type WatchSelectOption = SelectItemType & { label: string };

export function WatchSelect({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  className = "",
  popoverClassName = "",
}: {
  ariaLabel: string;
  value: string;
  options: WatchSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  popoverClassName?: string;
}) {
  return (
    <UntitledSelect
      aria-label={ariaLabel}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
      items={options}
      size="sm"
      isDisabled={disabled}
      className={`w-full gap-0 ${
        compact ? "[&_button]:min-h-9" : "[&_button]:min-h-11"
      } [&_button]:rounded-xl [&_button]:bg-[color:var(--ui-surface)] [&_button]:shadow-none [&_button]:ring-[color:var(--ui-line)] [&_button]:transition-colors [&_button]:duration-150 [&_button:hover]:bg-[color:var(--ui-hover)] [&_button_p]:text-sm [&_button_p]:font-medium [&_button_p]:text-[color:var(--ink)] [&_button_svg]:text-[color:var(--ink-dim)] ${className}`}
      popoverClassName={`watch-select-popover z-[120] rounded-xl bg-[color:var(--bg-elev)] p-1 shadow-xl ring-[color:var(--ui-line)] ${popoverClassName}`}
    >
      {(item) => (
        <UntitledSelect.Item
          id={item.id}
          label={item.label}
          avatarUrl={item.avatarUrl}
          supportingText={item.supportingText}
          icon={item.icon}
          isDisabled={item.isDisabled}
          style={{ outline: "none" }}
          className={(state) =>
            `px-1 py-px [&>div]:min-h-11 [&>div]:px-3 [&>div]:text-sm [&>div]:text-[color:var(--ink-dim)] [&>div]:transition-colors [&_svg]:text-[color:var(--ink)] ${
              state.isSelected ? "[&>div]:bg-[color:var(--ui-hover)] [&>div]:text-[color:var(--ink)]" : ""
            } ${state.isFocused || state.isHovered ? "[&>div]:bg-[color:var(--ui-hover)] [&>div]:text-[color:var(--ink)]" : ""}`
          }
        />
      )}
    </UntitledSelect>
  );
}
