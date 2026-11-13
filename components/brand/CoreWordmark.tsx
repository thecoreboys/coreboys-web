import { cn } from "@/lib/utils";
import { CoreSymbol } from "./CoreSymbol";

/** The CORE wordmark uses the six-spoke ring as its O. */
export function CoreWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("core-wordmark", className)} role="img" aria-label="CORE">
      <span aria-hidden="true">C<CoreSymbol className="core-wordmark__symbol" />RE</span>
    </span>
  );
}
