import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Barlow_Condensed, Inter, Inter_Tight } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { PlayerProvider } from "@/components/providers/PlayerProvider";
import { PersistentPlayer } from "@/components/watch/PersistentPlayer";
import { RadioAudioSystem } from "@/components/watch/RadioAudioSystem";
import { WatchPalette } from "@/components/watch/WatchPalette";
import { PlayerChatCompanion } from "@/components/watch/PlayerChatCompanion";
import { WatchAlertsBridge } from "@/components/watch/WatchAlertsBridge";
import { WatchTogetherBridge } from "@/components/watch/WatchTogetherBridge";
import { WatchContextMenuProvider } from "@/components/watch/WatchContextMenu";
import { PassportPresenceBridge } from "@/components/passport/PassportPresenceBridge";
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
import { CookieBanner } from "@/components/legal/CookieBanner";
import { AuthModal } from "@/components/auth/AuthModal";
import { CinematicRouteTransition } from "@/components/watch/CinematicRouteTransition";
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
    default: "CORE — Create. Own. Run. Everything.",
    template: "%s — CORE",
  },
  description:
    "Six creators. One core. Everything we make, we own. Marlon, StableRonaldo, Adapt, Jason TheWeen, Lacy, and Silky.",
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

// Pre-fetch Twitch profile pictures so the navbar dropdown renders them
// on first paint instead of waiting for the client SWR hook.
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";

async function getMemberAvatars(): Promise<Record<string, string>> {
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    const out: Record<string, string> = {};
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) out[login] = u.profile_image_url;
    }
    return out;
  } catch {
    return {};
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const accessPage = requestHeaders.get("x-coreboys-access-page") === "1";
  const avatars = accessPage ? {} : await getMemberAvatars();
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`dark-mode ${inter.variable} ${interTight.variable} ${coreWordmark.variable} ${inter.className}`}
    >
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
              <div className="fixed inset-x-0 top-0 z-50">
                <Suspense fallback={null}>
                  <TopNav initialAvatars={avatars} />
                </Suspense>
                <LiveRibbon />
              </div>
              {/* Nav is h-14 / md:h-16. --live-ribbon-h is set by LiveRibbon
                  when someone is on air (0px otherwise). */}
              <main
                id="main"
                className="pt-[calc(3.5rem+var(--live-ribbon-h,0px))] pb-[var(--now-playing-h,0px)] md:pt-[calc(4rem+var(--live-ribbon-h,0px))]"
              >
                {children}
              </main>
              <GlobalSiteFooter />
               <PersistentPlayer />
               <RadioAudioSystem />
               <WatchTogetherBridge />
               <CinematicRouteTransition />
              <Suspense fallback={null}>
                <AuthModal />
              </Suspense>
              <WatchPalette />
              <PassportPresenceBridge />
              <PlayerChatCompanion />
              <WatchAlertsBridge />
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
