import { AuthGate } from "@/components/admin/AuthGate";
import { AccountDeletionRequests } from "@/components/admin/AccountDeletionRequests";

export default function AccountDeletionsPage() { return <AuthGate><AccountDeletionRequests /></AuthGate>; }
