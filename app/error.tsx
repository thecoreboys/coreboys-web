"use client";

import Link from "next/link";

export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-xl px-6 py-20"><h1 className="text-3xl font-semibold">This page could not be loaded</h1><p className="mt-4 text-base text-secondary">Try again. If it still does not load, you can continue browsing from the home page.</p><div className="mt-6 flex gap-4"><button type="button" className="min-h-11 rounded-lg bg-[color:var(--core)] px-5 font-semibold text-white" onClick={reset}>Try again</button><Link href="/" className="min-h-11 px-3 py-3 underline">Back to home</Link></div></div>;
}
