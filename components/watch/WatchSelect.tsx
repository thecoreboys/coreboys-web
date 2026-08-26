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
      } [&_button]:rounded-xl [&_button]:bg-white/10 [&_button]:shadow-none [&_button]:ring-white/20 [&_button]:transition-[background-color,box-shadow,transform] [&_button]:duration-100 [&_button:hover]:bg-white/[0.14] [&_button:active]:scale-[0.99] [&_button_p]:text-xs [&_button_p]:font-semibold [&_button_p]:text-white [&_button_svg]:text-white/55 ${className}`}
      popoverClassName={`z-[120] rounded-xl bg-[#151519] py-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.58)] ring-white/15 ${popoverClassName}`}
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
            `px-1.5 py-px [&>div]:min-h-10 [&>div]:px-3 [&>div]:text-xs [&>div]:text-white/75 [&>div]:transition-colors [&_svg]:text-[#ef3b8f] ${
              state.isSelected ? "[&>div]:bg-white/10 [&>div]:text-white" : ""
            } ${state.isFocused || state.isHovered ? "[&>div]:bg-white/[0.08] [&>div]:text-white" : ""}`
          }
        />
      )}
    </UntitledSelect>
  );
}
