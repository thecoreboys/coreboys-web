"use client";

import { Select as UntitledSelect, type SelectItemType } from "@/components/base/select/select";

export type WatchSelectOption = SelectItemType & { label: string };

/**
 * `site` follows the page's light/dark tokens. `dark` is for surfaces that
 * are always dark (chat panels, the Multiview room) so the trigger and its
 * menu match them in either site theme.
 */
const TONES = {
  site: {
    trigger: "[&_button]:bg-[color:var(--ui-surface)] [&_button]:ring-[color:var(--ui-line)] [&_button:hover]:bg-[color:var(--ui-hover)] [&_button_p]:text-[color:var(--ink)] [&_button_svg]:text-[color:var(--ink-dim)]",
    popover: "bg-[color:var(--bg-elev)] ring-[color:var(--ui-line)]",
    item: "[&>div]:text-[color:var(--ink-dim)] [&_svg]:text-[color:var(--ink)]",
    active: "[&>div]:bg-[color:var(--ui-hover)] [&>div]:text-[color:var(--ink)]",
  },
  dark: {
    trigger: "[&_button]:bg-[#202026] [&_button]:ring-white/14 [&_button:hover]:bg-[#27272e] [&_button:hover]:ring-white/25 [&_button_p]:text-white [&_button_svg]:text-white/55",
    popover: "bg-[#1a1a1f] ring-white/12 [color-scheme:dark]",
    item: "[&>div]:text-white/70 [&_svg]:text-white",
    active: "[&>div]:bg-white/[0.08] [&>div]:text-white",
  },
} as const;

export function WatchSelect({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  tone = "site",
  className = "",
  popoverClassName = "",
}: {
  ariaLabel: string;
  value: string;
  options: WatchSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  tone?: keyof typeof TONES;
  className?: string;
  popoverClassName?: string;
}) {
  const colors = TONES[tone];
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
      } [&_button]:rounded-xl [&_button]:shadow-none [&_button]:transition-colors [&_button]:duration-150 [&_button_p]:text-sm [&_button_p]:font-medium ${colors.trigger} ${className}`}
      popoverClassName={`watch-select-popover z-[120] rounded-xl p-1 shadow-xl ${colors.popover} ${popoverClassName}`}
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
            `px-1 py-px [&>div]:min-h-11 [&>div]:px-3 [&>div]:text-sm [&>div]:transition-colors ${colors.item} ${
              state.isSelected || state.isFocused || state.isHovered ? colors.active : ""
            }`
          }
        />
      )}
    </UntitledSelect>
  );
}
