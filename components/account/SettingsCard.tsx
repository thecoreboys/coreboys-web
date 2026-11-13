import type { ComponentType, ReactNode } from "react";
import { cx } from "@/utils/cx";

/**
 * The shared card used by Passport account settings sections: icon, title,
 * supporting copy and optional actions in the header, content below a rule.
 */
export function SettingsCard({
  id,
  icon: Icon,
  title,
  description,
  actions,
  children,
  footer,
  tone = "default",
  className,
}: {
  id?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx(
        "scroll-mt-32 overflow-hidden rounded-xl border bg-primary",
        tone === "danger" ? "border-error_subtle" : "border-secondary",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span
              className={cx(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                tone === "danger" ? "bg-error-primary text-fg-error-secondary ring-error_subtle" : "bg-primary text-brand-secondary ring-secondary",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-semibold text-primary">{title}</h2>
            {description ? <div className="mt-1 max-w-2xl text-sm leading-6 text-tertiary">{description}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="border-t border-secondary p-5 sm:p-6">{children}</div> : null}
      {footer ? <div className="flex flex-wrap items-center justify-end gap-3 border-t border-secondary bg-secondary_alt px-5 py-4 sm:px-6">{footer}</div> : null}
    </section>
  );
}

export function InlineNotice({ tone, children }: { tone: "success" | "error" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset",
        tone === "error" && "bg-error-primary text-error-primary ring-error_subtle",
        tone === "success" && "bg-success-primary text-success-primary ring-success_subtle",
        tone === "info" && "bg-secondary text-secondary ring-secondary",
      )}
    >
      {children}
    </p>
  );
}
