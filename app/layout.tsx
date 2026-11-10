import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Barlow_Condensed, Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { PlayerProvider } from "@/components/providers/PlayerProvider";
import { WatchContextMenuProvider } from "@/components/watch/WatchContextMenu";
import { GlobalWatchEnhancements } from "@/components/watch/GlobalWatchEnhancements";
import { TopNav } from "@/components/chrome/TopNav";
import { LiveRibbon } from "@/components/live/LiveRibbon";
import { GlobalSiteFooter } from "@/components/chrome/GlobalSiteFooter";
import { MobileBottomNav } from "@/components/chrome/MobileBottomNav";

import { ConsoleEgg } from "@/components/editorial/ConsoleEgg";
import { CursorLoader } from "@/components/editorial/CursorLoader";
import { OrganizationJsonLd } from "@/components/editorial/JsonLd";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { UnreleasedBanner } from "@/components/chrome/UnreleasedBanner";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { CookieBanner } from "@/components/legal/CookieBanner";
import { AuthModal } from "@/components/auth/AuthModal";
import "./globals.css";
import "./watch/watch.css";
import "./ui-refinements.css";
import "./responsive.css";
import "./home-polish.css";
import "./navigation-polish.css";
import "./page-polish.css";
import "./cta-polish.css";
import "./site-polish.css";
import "./text-polish.css";
import "./watch-search.css";
import "./mobile-bottom-nav.css";

// One typeface across the entire product. Inter's variable font covers every
// weight used by the streaming UI without introducing mismatched display,
// mono, or editorial faces.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
  viewportFit: "cover",
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
    "An independent fan site for The Core Boys: discover live streams, videos, Shorts, and shows from Marlon, StableRonaldo, Adapt, JasonTheWeen, Lacy, and Silky.",
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
  publisher: "CORE TV — independent fan site",
  referrer: "origin-when-cross-origin",
  alternates: { canonical: siteUrl },
  // Favicon comes from the file convention at `app/icon.png` — Next.js
  // emits the <link rel="icon"> automatically.
  openGraph: {
    title: "The Core Boys | CORE TV",
    description: "An independent fan site for The Core Boys: live streams, videos, Shorts, and shows.",
    url: siteUrl,
    siteName: "CORE",
    type: "website",
    images: [embedImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Core Boys | CORE TV",
    description: "An independent fan site for The Core Boys: live streams, videos, Shorts, and shows.",
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
      suppressHydrationWarning
      data-theme="dark"
      className={`dark-mode ${inter.variable} ${coreWordmark.variable} ${inter.className}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
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
              <div className="site-shell">
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
              <Suspense fallback={null}><MobileBottomNav /></Suspense>
              </div>
               <GlobalWatchEnhancements />
              <Suspense fallback={null}>
                <AuthModal />
              </Suspense>
            </LenisProvider>
            </WatchContextMenuProvider>
            </PlayerProvider>
            </AuthProvider>
          </ThemeProvider>
        </NuqsAdapter>

        <ConsoleEgg />
        <CursorLoader />
        <OrganizationJsonLd />
        <CookieBanner />
        <GoogleAnalytics />
        </>
        )}
      </body>
    </html>
  );
}
