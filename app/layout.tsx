import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Special_Elite, Fraunces } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Grain, Scanlines } from "@/components/editorial/Grain";
import { TopNav } from "@/components/chrome/TopNav";
import { Cursor } from "@/components/editorial/Cursor";
import { GridOverlay } from "@/components/editorial/GridOverlay";
import { ConsoleEgg } from "@/components/editorial/ConsoleEgg";
import { OrganizationJsonLd } from "@/components/editorial/JsonLd";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { CookieBanner } from "@/components/legal/CookieBanner";
import { UnreleasedBanner } from "@/components/chrome/UnreleasedBanner";
import "./globals.css";

// Inter does the heavy lifting: tight in display sizes, calm at body.
// Variable font, all weights covered.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Inter({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Postal-editorial faces — only used on /fan-mail and /send-to-* pages.
const typewriter = Special_Elite({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-typewriter",
  display: "swap",
});

const editorialSerif = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK"],
  variable: "--font-editorial-serif",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#06070a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "The Core Boys — Create. Own. Run. Everything.",
    template: "%s — The Core Boys",
  },
  description:
    "Six creators. One core. Everything we make, we own. The Core Boys: Marlon, StableRonaldo, Adapt, Jason TheWeen, Lacy, and Silky.",
  alternates: { canonical: siteUrl },
  openGraph: {
    title: "The Core Boys",
    description: "Six creators. One core. Everything we make, we own.",
    url: siteUrl,
    siteName: "The Core Boys",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Core Boys",
    description: "Six creators. One core. Everything we make, we own.",
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
  const avatars = await getMemberAvatars();
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable} ${typewriter.variable} ${editorialSerif.variable}`}
    >
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <NuqsAdapter>
          <ThemeProvider>
            <LenisProvider>
              <div className="fixed inset-x-0 top-0 z-50">
                <UnreleasedBanner />
                <TopNav initialAvatars={avatars} />
              </div>
              <main id="main">{children}</main>
            </LenisProvider>
          </ThemeProvider>
        </NuqsAdapter>

        <Cursor />
        <Suspense fallback={null}>
          <GridOverlay />
        </Suspense>
        <Grain />
        <Scanlines />
        <ConsoleEgg />
        <OrganizationJsonLd />
        <CookieBanner />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
