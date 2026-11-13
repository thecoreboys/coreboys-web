import { withPageMetadata, SITE_URL, SITE_DESCRIPTION } from "@/lib/seo";
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
import { MultiviewRemoteBanner } from "@/components/watch/MultiviewRemoteLinks";
import { GlobalSiteFooter } from "@/components/chrome/GlobalSiteFooter";
import { MobileBottomNav } from "@/components/chrome/MobileBottomNav";
import { RouteEntrance } from "@/components/chrome/RouteEntrance";

import { ConsoleEgg } from "@/components/editorial/ConsoleEgg";
import { CursorLoader } from "@/components/editorial/CursorLoader";
import { OrganizationJsonLd } from "@/components/editorial/JsonLd";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { UnreleasedBanner } from "@/components/chrome/UnreleasedBanner";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { CookieBanner } from "@/components/legal/CookieBanner";
import { ExternalNavigation } from "@/components/chrome/ExternalNavigation";
import { AuthModal } from "@/components/auth/AuthModal";
import { ContributorWidget } from "@/components/contributors/ContributorWidget";
import { NavigationPrefetch } from "@/components/chrome/NavigationPrefetch";
import "./contributors.css";
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
import "./guide-polish.css";
import "./guide/guide.css";
import "./guide-readable.css";
import "./mobile-bottom-nav.css";
import "./motion.css";

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

export const metadata: Metadata = withPageMetadata("/", {
  metadataBase: new URL(SITE_URL),
  title: { default: "The Core Boys | Live Streams, Clips & Videos", template: "%s | CORE" },
  description: SITE_DESCRIPTION,
  applicationName: "CORE",
  category: "entertainment",
  publisher: "CORE TV — independent fan site",
  referrer: "origin-when-cross-origin",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
});

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
        {/* Hero thumbs load ytimg in CORS mode; match it or the browser opens a second connection. */}
        <link rel="preconnect" href="https://i.ytimg.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://static-cdn.jtvnw.net" />
        <link rel="dns-prefetch" href="https://player.twitch.tv" />
      </head>
      <body>
        <ExternalNavigation />
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
                <MultiviewRemoteBanner />
              </SiteHeader>
              {/* SiteHeader measures the complete banner, navigation and live ribbon. */}
              <main
                id="main"
                className="pt-[var(--site-header-h,8rem)] pb-[var(--now-playing-h,0px)]"
              >
                {children}
              </main>
              <RouteEntrance />
              <NavigationPrefetch />
              <GlobalSiteFooter />
              <Suspense fallback={null}><MobileBottomNav /></Suspense>
              </div>
               <GlobalWatchEnhancements />
              <ContributorWidget />
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
