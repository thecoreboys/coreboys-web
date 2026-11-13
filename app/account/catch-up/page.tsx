"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CatchUpPage } from "@/components/account/CatchUpPage";
import { useAuth } from "@/components/providers/AuthProvider";

export default function AccountCatchUpPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/catch-up");
  }, [loading, router, user]);

  if (loading || !user) {
    return <div className="mx-auto min-h-[70vh] max-w-6xl px-5 py-10 sm:px-6 lg:px-8 lg:py-16"><div className="h-10 w-52 animate-pulse rounded-lg bg-secondary" /><div className="mt-8 h-[34rem] animate-pulse rounded-2xl bg-secondary" /></div>;
  }
  return <CatchUpPage />;
}
