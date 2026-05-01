import { Eyebrow } from "@/components/typography";
import { cn } from "@/lib/utils";

/**
 * Editorial section number — pinned to the section's left rule.
 * Renders e.g.   01 / MANIFESTO   in mono small caps.
 *
 * Use inside a relatively-positioned section.
 */
export function SectionNumber({
  index,
  label,
  className,
}: {
  index: number;
  label: string;
  className?: string;
}) {
  const padded = String(index).padStart(2, "0");
  return (
    <Eyebrow
      className={cn(
        "absolute left-6 top-12 z-10 hidden md:block",
        "before:mr-3 before:inline-block before:h-px before:w-8 before:translate-y-[-3px] before:bg-[color:var(--ink-faint)] before:content-['']",
        className,
      )}
    >
      {padded} <span className="text-[color:var(--ink-faint)]">/</span> {label}
    </Eyebrow>
  );
}
