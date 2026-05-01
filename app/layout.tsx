import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LenisProvider } from "@/components/providers/LenisProvider";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <NuqsAdapter>
          <LenisProvider>{children}</LenisProvider>
        </NuqsAdapter>
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
