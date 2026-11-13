"use client";

import type { FC, ReactElement, ReactNode } from "react";
import React, { isValidElement } from "react";
import type { ButtonProps as AriaButtonProps, LinkProps as AriaLinkProps } from "react-aria-components";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { cx } from "@/utils/cx";
import { buttonStyles } from "./button-styles";
import { isReactComponent } from "@/utils/is-react-component";

export const styles = buttonStyles;

/**
 * Common props shared between button and anchor variants
 */
export interface CommonProps {
    /** Disables the button and shows a disabled state */
    isDisabled?: boolean;
    /** Shows a loading spinner and disables the button */
    isLoading?: boolean;
    /** The size variant of the button */
    size?: keyof typeof styles.sizes;
    /** The color variant of the button */
    color?: keyof typeof styles.colors;
    /** Icon component or element to show before the text */
    iconLeading?: FC<{ className?: string }> | ReactNode;
    /** Icon component or element to show after the text */
    iconTrailing?: FC<{ className?: string }> | ReactNode;
    /** Removes horizontal padding from the text content */
    noTextPadding?: boolean;
    /** When true, keeps the text visible during loading state */
    showTextWhileLoading?: boolean;

    children?: ReactNode;
    className?: string;
}

/**
 * Props for the button variant (non-link)
 */
export interface ButtonProps extends CommonProps, Omit<AriaButtonProps, "children" | "className"> {}
/**
 * Props for the link variant (anchor tag)
 */
interface LinkProps extends CommonProps, Omit<AriaLinkProps, "children" | "className"> {
    href: NonNullable<AriaLinkProps["href"]>;
}

/** Union type of button and link props */
export type Props = ButtonProps | LinkProps;

export const Button: {
    (props: LinkProps): ReactElement<LinkProps>;
    (props: ButtonProps): ReactElement<ButtonProps>;
} = ({
    size = "sm",
    color = "primary",
    children,
    className,
    noTextPadding,
    iconLeading: IconLeading,
    iconTrailing: IconTrailing,
    isDisabled: disabled,
    isLoading: loading,
    showTextWhileLoading,
    ...props
}) => {
    const href = "href" in props ? props.href : undefined;

    const isIcon = (IconLeading || IconTrailing) && !children;
    const isLinkType = ["link-gray", "link-color", "link-destructive"].includes(color);

    noTextPadding = isLinkType || noTextPadding;

    const commonChildren = (
        <>
            {/* Leading icon */}
            {isValidElement(IconLeading) && IconLeading}
            {isReactComponent(IconLeading) && <IconLeading data-icon="leading" className={styles.common.icon} />}

            {loading && (
                <svg
                    fill="none"
                    data-icon="loading"
                    viewBox="0 0 20 20"
                    className={cx(styles.common.icon, !showTextWhileLoading && "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2")}
                >
                    {/* Background circle */}
                    <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                    {/* Spinning circle */}
                    <circle
                        className="origin-center animate-spin stroke-current"
                        cx="10"
                        cy="10"
                        r="8"
                        fill="none"
                        strokeWidth="2"
                        strokeDasharray="12.5 50"
                        strokeLinecap="round"
                    />
                </svg>
            )}

            {children && (
                <span data-text className={cx("transition-inherit-all", !noTextPadding && "px-0.5")}>
                    {children}
                </span>
            )}

            {/* Trailing icon */}
            {isValidElement(IconTrailing) && IconTrailing}
            {isReactComponent(IconTrailing) && <IconTrailing data-icon="trailing" className={styles.common.icon} />}
        </>
    );

    const commonProps = {
        "data-loading": loading ? true : undefined,
        "data-icon-only": isIcon ? true : undefined,
        ...props,
        isDisabled: disabled,
        className: cx(
            styles.common.root,
            styles.sizes[size].root,
            styles.colors[color].root,
            isLinkType && styles.sizes[size].linkRoot,
            (loading || (href && (disabled || loading))) && "pointer-events-none",
            // If in `loading` state, hide everything except the loading icon (and text if `showTextWhileLoading` is true).
            loading && (showTextWhileLoading ? "[&>*:not([data-icon=loading]):not([data-text])]:hidden" : "[&>*:not([data-icon=loading])]:invisible"),
            className,
        ),
        children: commonChildren,
    };

    if ("href" in commonProps) {
        return <AriaLink {...commonProps} href={disabled ? undefined : href} />;
    }

    return <AriaButton {...commonProps} type={commonProps.type || "button"} isPending={loading} />;
};
