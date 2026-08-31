import type { Metadata } from "next";
import { NotificationTestForm } from "@/components/admin/NotificationTestForm";
export const metadata: Metadata = { title: "Notification tests", robots: { index: false, follow: false } };
export default function AdminNotificationTestsPage() { return <main className="mx-auto w-full max-w-3xl px-6 py-10"><h1 className="text-2xl font-semibold text-primary">Notification tests</h1><p className="mt-2 text-sm text-tertiary">Send a private in-app alert to a fan account. This never broadcasts to the community.</p><div className="mt-6"><NotificationTestForm /></div></main>; }
