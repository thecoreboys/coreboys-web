import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Barlow_Condensed, Inter, Inter_Tight } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { PlayerProvider } from "@/components/providers/PlayerProvider";
import { WatchContextMenuProvider } from "@/components/watch/WatchContextMenu";
import { GlobalWatchEnhancements } from "@/components/watch/GlobalWatchEnhancements";
import { Grain, Scanlines } from "@/components/editorial/Grain";
import { Cursor } from "@/components/editorial/Cursor";
import { TopNav } from "@/components/chrome/TopNav";
import { LiveRibbon } from "@/components/live/LiveRibbon";
import { GlobalSiteFooter } from "@/components/chrome/GlobalSiteFooter";

import { GridOverlay } from "@/components/editorial/GridOverlay";
import { ConsoleEgg } from "@/components/editorial/ConsoleEgg";
import { OrganizationJsonLd } from "@/components/editorial/JsonLd";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { ContactInquiryWidget } from "@/components/site/ContactInquiryWidget";
import { UnreleasedBanner } from "@/components/chrome/UnreleasedBanner";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { CookieBanner } from "@/components/legal/CookieBanner";
import { AuthModal } from "@/components/auth/AuthModal";
import "./globals.css";
import "./watch/watch.css";

// One typeface across the entire product. Inter's variable font covers every
// weight used by the streaming UI without introducing mismatched display,
// mono, or editorial faces.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// A more editorial, compact cut reserved for dense product labels such as the
// floating membership benefits. Body copy remains Inter for consistency.
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

// The type-led CORE station wordmark is intentionally separate from the
// product UI font so labels retain their existing visual rhythm.
const coreWordmark = Barlow_Condensed({
  subsets: ["latin"],
  weight: "700",
  style: "italic",
  variable: "--font-core-wordmark",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#08080a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

// Resolved against `metadataBase` below so Twitter / Discord / Slack
// always see a fully-qualified URL. Dimensions match the file under
// public/embed-preview.png (1615 × 907) — Twitter and Discord both
// honor declared dimensions and clip otherwise, so keep these accurate.
const embedImage = {
  url: "/embed-preview.png",
  width: 1615,
  height: 907,
  alt: "CORE — Six creators. One core.",
  type: "image/png",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CORE | The Core Boys — Live creators, shows, and videos",
    template: "%s — CORE",
  },
  description:
    "CORE, also known as The Core Boys and CORE Crew: live streams, videos, Shorts, Reels, news, and shows from Marlon, StableRonaldo, Adapt, Jason TheWeen, Lacy, and Silky.",
  keywords: [
    "CORE",
    "The Core Boys",
    "CORE Crew",
    "CoreCrew",
    "creator network",
    "livestreams",
    "Twitch creators",
    "FaZe creators",
    "Shorts",
    "Reels",
  ],
  applicationName: "CORE",
  category: "entertainment",
  creator: "CORE",
  publisher: "CORE",
  referrer: "origin-when-cross-origin",
  alternates: { canonical: siteUrl },
  // Favicon comes from the file convention at `app/icon.png` — Next.js
  // emits the <link rel="icon"> automatically.
  openGraph: {
    title: "CORE",
    description: "Six creators. One core. Everything we make, we own.",
    url: siteUrl,
    siteName: "CORE",
    type: "website",
    images: [embedImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "CORE",
    description: "Six creators. One core. Everything we make, we own.",
    images: [{ url: embedImage.url, alt: embedImage.alt }],
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const accessPage = requestHeaders.get("x-coreboys-access-page") === "1";
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`dark-mode ${inter.variable} ${interTight.variable} ${coreWordmark.variable} ${inter.className}`}
    >
      <head>
        <link rel="preconnect" href="https://i.ytimg.com" />
        <link rel="preconnect" href="https://static-cdn.jtvnw.net" />
        <link rel="dns-prefetch" href="https://player.twitch.tv" />
      </head>
      <body>
        {accessPage ? children : (
        <>
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <NuqsAdapter>
          <ThemeProvider>
            <AuthProvider>
            <PlayerProvider>
            <WatchContextMenuProvider>
            <LenisProvider>
              <SiteHeader>
                <UnreleasedBanner />
                <Suspense fallback={null}>
                  <TopNav />
                </Suspense>
                <LiveRibbon />
              </SiteHeader>
              {/* SiteHeader measures the complete banner, navigation and live ribbon. */}
              <main
                id="main"
                className="pt-[var(--site-header-h,8rem)] pb-[var(--now-playing-h,0px)]"
              >
                {children}
              </main>
              <GlobalSiteFooter />
               <GlobalWatchEnhancements />
              <Suspense fallback={null}>
                <AuthModal />
              </Suspense>
              <ContactInquiryWidget />
            </LenisProvider>
            </WatchContextMenuProvider>
            </PlayerProvider>
            </AuthProvider>
          </ThemeProvider>
        </NuqsAdapter>

        <Suspense fallback={null}>
          <GridOverlay />
        </Suspense>
        <Grain />
        <Scanlines />
        <Cursor />
        <ConsoleEgg />
        <OrganizationJsonLd />
        <CookieBanner />
        <GoogleAnalytics />
        </>
        )}
      </body>
    </html>
  );
}
