"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { hasAnalyticsConsent, onConsentChange } from "@/lib/consent";

const GA_ID = "G-BG4VPN3LGG";

/**
 * Google Analytics loader — only mounts the gtag script after the visitor
 * has accepted analytics in the cookie banner. Toggling consent off later
 * sets `window['ga-disable-G-...']=true` so subsequent events drop, even
 * before the page reloads.
 */
export function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false);
  const recoveryPage = usePathname() === "/reset-password";

  useEffect(() => {
    const updateConsent = (accepted: boolean) => {
      // Recovery URLs carry a secret fragment until the form mounts. Never
      // initialize analytics or record navigation on this page.
      const canTrack = accepted && !recoveryPage;
      // Restore tracking if a visitor opts back in during the same session.
      (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !canTrack;
      setEnabled(canTrack);
    };
    updateConsent(hasAnalyticsConsent());
    return onConsentChange(updateConsent);
  }, [recoveryPage]);

  if (!enabled || recoveryPage) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
        async
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
