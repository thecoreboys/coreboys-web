import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AiUsageControlRoom } from "@/components/admin/AiUsageControlRoom";

export default function AiUsagePage() {
  return <AuthGate><main className="min-h-screen bg-secondary pt-20"><div className="mx-auto max-w-container px-6 py-10 md:px-8"><AdminPageHeader eyebrow="CORE · Security" title="AI usage controls" supporting="Hard limits, provider kill switches, and budget visibility." /><div className="mt-8"><AiUsageControlRoom /></div></div></main></AuthGate>;
}
