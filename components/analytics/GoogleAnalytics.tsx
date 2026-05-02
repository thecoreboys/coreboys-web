"use client";

import Script from "next/script";
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

  useEffect(() => {
    setEnabled(hasAnalyticsConsent());
    return onConsentChange((accepted) => {
      setEnabled(accepted);
      if (!accepted && typeof window !== "undefined") {
        // Disables further hits without forcing a reload.
        (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = true;
      }
    });
  }, []);

  if (!enabled) return null;

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
