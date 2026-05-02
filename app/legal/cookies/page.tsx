import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { CookieSettingsLink } from "@/components/legal/CookieSettingsLink";

export const metadata: Metadata = {
  title: "Cookie policy",
  description: "Which cookies thecoreboys.com sets and how to manage them.",
  alternates: { canonical: "/legal/cookies" },
  robots: { index: true, follow: true },
};

export default function CookiesPage() {
  return (
    <LegalLayout title="Cookie policy" effectiveDate="2026-01-01">
      <p>
        Cookies are small files that websites place on your device. This
        page lists every cookie thecoreboys.com may set and explains how
        to control them.
      </p>

      <h2>Cookies we set ourselves</h2>
      <ul>
        <li>
          <strong>coreboys-consent</strong> — first-party, stores your
          choice from the cookie banner. 12-month expiry. Without it, the
          banner would re-appear on every visit.
        </li>
        <li>
          <strong>coreboys-raw</strong> — first-party, stores whether
          you&apos;ve enabled the &quot;Raw&quot; editorial overlay. 12-month expiry.
        </li>
      </ul>

      <h2>Cookies set by third parties</h2>

      <h3>Google Analytics (loaded only after consent)</h3>
      <ul>
        <li><strong>_ga</strong> — Google Analytics. 13-month expiry.</li>
        <li><strong>_ga_BG4VPN3LGG</strong> — Property-specific GA4 cookie.</li>
      </ul>
      <p>
        You can opt out of GA across all sites at{" "}
        <a href="https://tools.google.com/dlpage/gaoptout">tools.google.com/dlpage/gaoptout</a>.
      </p>

      <h3>Embeds</h3>
      <p>
        When you load a page that embeds a Twitch player, YouTube video,
        TikTok post, or X post, the embedded content sets its own cookies
        on its own subdomain. We have no control over what those services
        store. Their cookie policies apply.
      </p>

      <h2>Managing cookies</h2>
      <p>
        Two ways to control cookies on thecoreboys.com:
      </p>
      <ul>
        <li>
          Use the <strong>Cookie settings</strong> link below or in the
          footer to re-open the consent banner.
        </li>
        <li>
          Clear cookies for thecoreboys.com via your browser&apos;s site-
          settings menu. The banner will reappear on your next visit.
        </li>
      </ul>

      <p>
        <CookieSettingsLink />
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Write to{" "}
        <a href="mailto:privacy@thecoreboys.com">privacy@thecoreboys.com</a>.
      </p>
    </LegalLayout>
  );
}
