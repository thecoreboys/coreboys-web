import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BillingControlRoom } from "@/components/admin/BillingControlRoom";

export default function AdminBillingPage() { return <AuthGate><main className="min-h-screen bg-secondary pt-20"><div className="mx-auto max-w-container px-6 py-10 md:px-8"><AdminPageHeader eyebrow="CORE · Finance" title="Supporter billing" supporting="Contribution guardrails, subscriber notices, 30-day Stripe analytics, renewal controls, receipts, and refunds." /><div className="mt-8"><BillingControlRoom /></div></div></main></AuthGate>; }
