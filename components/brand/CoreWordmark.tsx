import { cn } from "@/lib/utils";

/** The CORE identity wordmark stays sharp and consistent as live text. */
export function CoreWordmark({ className }: { className?: string }) {
  return <span className={cn("core-wordmark", className)}>CORE</span>;
}
