import { cx, sortCx } from "@/utils/cx";

// Class tables for the Untitled UI buttons, kept apart from the components so
// always-mounted chrome (TopNav) can style a native <button> identically
// without loading react-aria-components on every page.
export const buttonStyles = sortCx({
    common: {
        root: [
            "group relative inline-flex h-max min-w-0 max-sm:min-h-11 cursor-pointer items-center justify-center whitespace-nowrap outline-brand transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2",
            // When button is used within `InputGroup`
            "in-data-input-wrapper:shadow-xs in-data-input-wrapper:focus:!z-50 in-data-input-wrapper:in-data-leading:-mr-px in-data-input-wrapper:in-data-leading:rounded-r-none in-data-input-wrapper:in-data-leading:before:rounded-r-none in-data-input-wrapper:in-data-trailing:-ml-px in-data-input-wrapper:in-data-trailing:rounded-l-none in-data-input-wrapper:in-data-trailing:before:rounded-l-none",
            // Disabled styles
            "disabled:cursor-not-allowed disabled:opacity-50 in-data-input-wrapper:disabled:opacity-100",
            // Same as `icon` but for SSR icons that cannot be passed to the client as functions.
            "*:data-icon:pointer-events-none *:data-icon:size-5 *:data-icon:shrink-0 *:data-icon:transition-inherit-all",
        ].join(" "),
        icon: "pointer-events-none size-5 shrink-0 transition-inherit-all",
    },
    sizes: {
        xs: {
            root: [
                "gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium data-icon-only:p-2",
                "in-data-input-wrapper:px-3.5 in-data-input-wrapper:py-2.5 in-data-input-wrapper:data-icon-only:p-2.5",
                "*:data-icon:size-4 *:data-icon:stroke-[2.25px]",
            ].join(" "),
            linkRoot: "gap-1 *:data-text:underline-offset-3",
        },
        sm: {
            root: [
                "gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium data-icon-only:p-2",
                "in-data-input-wrapper:px-3.5 in-data-input-wrapper:py-2.5 in-data-input-wrapper:data-icon-only:p-2.5",
            ].join(" "),
            linkRoot: "gap-1 *:data-text:underline-offset-3",
        },
        md: {
            root: [
                "gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium data-icon-only:p-2.5",
                "in-data-input-wrapper:gap-1.5 in-data-input-wrapper:px-4 in-data-input-wrapper:text-md in-data-input-wrapper:data-icon-only:p-3",
            ].join(" "),
            linkRoot: "gap-1 *:data-text:underline-offset-4",
        },
        lg: {
            root: "gap-2 rounded-xl px-4.5 py-2.5 text-md font-medium data-icon-only:p-3",
            linkRoot: "gap-1.5 *:data-text:underline-offset-4",
        },
        xl: {
            root: "gap-2 rounded-xl px-5 py-3 text-md font-medium data-icon-only:p-3.5",
            linkRoot: "gap-1.5 *:data-text:underline-offset-4",
        },
    },

    colors: {
        primary: {
            root: [
                "bg-brand-solid text-white ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover data-loading:bg-brand-solid_hover",
                // Icon styles
                "*:data-icon:text-white/60 hover:*:data-icon:text-white/70",
            ].join(" "),
        },
        secondary: {
            root: [
                "bg-[color:var(--ui-surface)] text-secondary ring-1 ring-[color:var(--ui-line)] ring-inset hover:bg-primary_hover hover:text-secondary_hover data-loading:bg-primary_hover",
                // Icon styles
                "*:data-icon:text-fg-quaternary hover:*:data-icon:text-fg-quaternary_hover",
            ].join(" "),
        },
        tertiary: {
            root: [
                "text-tertiary hover:bg-primary_hover hover:text-tertiary_hover data-loading:bg-primary_hover",
                // Icon styles
                "*:data-icon:text-fg-quaternary hover:*:data-icon:text-fg-quaternary_hover",
            ].join(" "),
        },
        "link-color": {
            root: [
                "justify-normal rounded p-0! text-brand-secondary hover:text-brand-secondary_hover",
                // Inner text underline
                "*:data-text:underline *:data-text:decoration-transparent hover:*:data-text:decoration-fg-brand-secondary_alt",
                // Icon styles
                "*:data-icon:text-fg-brand-secondary_alt hover:*:data-icon:text-fg-brand-secondary_hover",
            ].join(" "),
        },
        "link-gray": {
            root: [
                "justify-normal rounded p-0! text-tertiary hover:text-tertiary_hover",
                // Inner text underline
                "*:data-text:underline *:data-text:decoration-transparent hover:*:data-text:decoration-fg-quaternary",
                // Icon styles
                "*:data-icon:text-fg-quaternary hover:*:data-icon:text-fg-quaternary_hover",
            ].join(" "),
        },
        "primary-destructive": {
            root: [
                "bg-error-solid text-white ring-1 ring-transparent outline-error ring-inset hover:bg-error-solid_hover data-loading:bg-error-solid_hover",
                // Icon styles
                "*:data-icon:text-white/60 hover:*:data-icon:text-white/70",
            ].join(" "),
        },
        "secondary-destructive": {
            root: [
                "bg-primary text-error-primary ring-1 ring-error_subtle outline-error ring-inset hover:bg-error-primary hover:text-error-primary_hover data-loading:bg-error-primary",
                // Icon styles
                "*:data-icon:text-fg-error-secondary hover:*:data-icon:text-fg-error-primary",
            ].join(" "),
        },
        "tertiary-destructive": {
            root: [
                "text-error-primary outline-error hover:bg-error-primary hover:text-error-primary_hover data-loading:bg-error-primary",
                // Icon styles
                "*:data-icon:text-fg-error-secondary hover:*:data-icon:text-fg-error-primary",
            ].join(" "),
        },
        "link-destructive": {
            root: [
                "justify-normal rounded p-0! text-error-primary outline-error hover:text-error-primary_hover",
                // Inner text underline
                "*:data-text:underline *:data-text:decoration-transparent *:data-text:underline-offset-2 hover:*:data-text:decoration-current",
                // Icon styles
                "*:data-icon:text-fg-error-secondary hover:*:data-icon:text-fg-error-primary",
            ].join(" "),
        },
    },
});

export const buttonUtilityStyles = {
    secondary:
        "bg-[color:var(--ui-surface)] text-fg-quaternary ring-1 ring-[color:var(--ui-line)] ring-inset hover:bg-primary_hover hover:text-fg-quaternary_hover",
    tertiary: "text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover",
};

export const BUTTON_UTILITY_ROOT =
    "group relative inline-flex min-h-10 min-w-10 max-sm:min-h-11 max-sm:min-w-11 cursor-pointer items-center justify-center rounded-xl p-2 outline-focus-ring transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const BUTTON_UTILITY_ICON = "*:data-icon:pointer-events-none *:data-icon:shrink-0 *:data-icon:text-current *:data-icon:transition-inherit-all";

/** Class list for a non-link text button (no loading state). */
export function buttonClassName(
    size: keyof typeof buttonStyles.sizes = "sm",
    color: keyof typeof buttonStyles.colors = "primary",
    className?: string,
): string {
    return cx(buttonStyles.common.root, buttonStyles.sizes[size].root, buttonStyles.colors[color].root, className);
}

/** Class list for an icon-only utility button. */
export function buttonUtilityClassName(
    size: "xs" | "sm" = "sm",
    color: keyof typeof buttonUtilityStyles = "secondary",
    className?: string,
): string {
    return cx(BUTTON_UTILITY_ROOT, buttonUtilityStyles[color], BUTTON_UTILITY_ICON, size === "xs" ? "*:data-icon:size-4" : "*:data-icon:size-5", className);
}
