import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { Grain, Scanlines } from "@/components/editorial/Grain";
import { TopChrome } from "@/components/editorial/TopChrome";
import { Cursor } from "@/components/editorial/Cursor";
import { IntroSequence } from "@/components/editorial/IntroSequence";
import { GridOverlay } from "@/components/editorial/GridOverlay";
import { ConsoleEgg } from "@/components/editorial/ConsoleEgg";
import { OrganizationJsonLd } from "@/components/editorial/JsonLd";
import { Concierge } from "@/components/concierge/Concierge";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Display face: Inter at black weight is the interim. When `coreboys-brand`
// confirms Migra / Editorial New, swap this to next/font/local pointing at
// the licensed file under `coreboys-brand/typography/`.
const display = Inter({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800", "900"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
    "Six creators. One core. Everything we make, we own. The Core Boys: Marlon, Stable Ronaldo, Adapt, Jason TheWeen, Lacy, and Silky.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <NuqsAdapter>
          <LenisProvider>
            <TopChrome />
            <main id="main">{children}</main>
            <Concierge />
          </LenisProvider>
        </NuqsAdapter>

        <Cursor />
        <IntroSequence />
        <Suspense fallback={null}>
          <GridOverlay />
        </Suspense>
        <Grain />
        <Scanlines />
        <ConsoleEgg />
        <OrganizationJsonLd />
      </body>
    </html>
  );
}
