import type { Metadata } from "next";
import { XEmbedSettings } from "@/components/legal/XEmbedSettings";
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
    <LegalLayout title="Cookie policy" effectiveDate="2026-01-01" kind="cookies">
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
        or TikTok post, the embedded content may set its own cookies on its
        own subdomain. X is different here: an X post stays a local link-only
        placeholder until you select <strong>Load X post</strong> or explicitly
        choose <strong>Always load X posts</strong>. Loading then contacts X and
        may let X set cookies. Their cookie policies apply.
      </p>

      <h3>X embed storage (not a cookie)</h3>
      <p>
        <strong>coreboys-x-embeds</strong> is a first-party localStorage setting
        with either &quot;ask&quot; or &quot;always&quot;. Official X embeds request Do Not Track.
        Global Privacy Control or Data Saver keeps posts click-to-load even after
        an &quot;always&quot; choice. Reset the choice below or clear this site&apos;s storage.
      </p>
      <XEmbedSettings />

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
