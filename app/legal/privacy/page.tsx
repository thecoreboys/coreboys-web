import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What corecrew.org collects, why, and what you can do about it.",
  alternates: { canonical: "/legal/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy" effectiveDate="2026-01-01">
      <p>
        <strong>corecrew.org</strong> is an{" "}
        <strong>unofficial site</strong> about CORE. It is not
        operated by, endorsed by, or affiliated with CORE or any
        of its members. &quot;<strong>We</strong>&quot; / &quot;<strong>us</strong>&quot;
        in this policy refers to the maintainers of this site. This
        policy explains what data the site collects, why we collect it,
        and what you can do about it.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>We don&apos;t require an account to view the site.</li>
        <li>We use Google Analytics — only after you accept the cookie banner.</li>
        <li>We embed third-party content (Twitch, YouTube, etc.) which sets its own cookies on its own surfaces.</li>
        <li>We don&apos;t sell personal data.</li>
        <li>We respond to deletion / access requests at <a href="mailto:privacy@corecrew.org">privacy@corecrew.org</a>.</li>
      </ul>

      <h2>What we collect</h2>

      <h3>Server logs</h3>
      <p>
        Our hosting provider (Vercel) records standard request logs: IP
        address, user-agent, request path, timestamp, response status,
        and a Vercel-issued request ID. These logs are retained for up to
        30 days for security and operations.
      </p>

      <h3>Analytics</h3>
      <p>
        After you accept analytics cookies, we load Google Analytics 4
        (property <code>G-BG4VPN3LGG</code>). GA4 stores anonymous usage
        signals (page views, navigation paths, approximate region from
        IP, device family) and sets first-party cookies (<code>_ga</code>,{" "}
        <code>_ga_*</code>). We use this data only to understand which
        pages people read and where the site&apos;s rough edges are.
      </p>
      <p>
        Until you accept the banner, no GA scripts load. If you previously
        accepted and want to opt out, clear our cookies for this site or
        use the &quot;Cookie settings&quot; link in the footer.
      </p>

      <h3>Embedded third-party services</h3>
      <p>
        corecrew.org embeds content from third-party services. Each
        service may set its own cookies and collect its own data:
      </p>
      <ul>
        <li><a href="https://www.twitch.tv/p/legal/privacy-notice/">Twitch</a> — live status + clip embeds</li>
        <li><a href="https://policies.google.com/privacy">YouTube / Google</a> — video embeds + analytics</li>
        <li><a href="https://www.tiktok.com/legal/privacy-policy">TikTok</a> — embedded posts</li>
        <li><a href="https://twitter.com/en/privacy">X / Twitter</a> — embedded posts</li>
      </ul>
      <p>
        We have no control over these services&apos; data practices. Their
        privacy policies govern the data they collect from you.
      </p>

      <h3>Forms</h3>
      <p>
        We don&apos;t maintain user-account forms on the public site. If you
        email us (e.g. press, booking, legal), we keep that correspondence
        for as long as needed to respond to it and for a reasonable record-
        keeping period afterward.
      </p>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t sell or rent personal data.</li>
        <li>We don&apos;t profile visitors for advertising.</li>
        <li>We don&apos;t track you across sites we don&apos;t own.</li>
        <li>We don&apos;t use dark-pattern consent flows. The banner has &quot;Accept&quot; and &quot;Decline&quot; buttons of equal weight.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access,
        correct, or delete personal data we hold about you, and to object
        to certain processing. Email{" "}
        <a href="mailto:privacy@corecrew.org">privacy@corecrew.org</a>{" "}
        with your request and we&apos;ll respond within 30 days.
      </p>

      <h2>International transfers</h2>
      <p>
        Our hosting (Vercel) and analytics (Google) operate
        infrastructure globally. By using the site, you consent to data
        being processed in jurisdictions that may have different privacy
        laws than your own.
      </p>

      <h2>Children</h2>
      <p>
        corecrew.org is not directed at children under 13. We don&apos;t
        knowingly collect personal information from children. If you
        believe a child has provided us with information, email{" "}
        <a href="mailto:privacy@corecrew.org">privacy@corecrew.org</a>{" "}
        and we&apos;ll delete it.
      </p>

      <h2>Changes</h2>
      <p>
        We&apos;ll update this policy when our data practices change. The
        effective date above is always current. Material changes will be
        announced on the home page.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:privacy@corecrew.org">privacy@corecrew.org</a>
      </p>
    </LegalLayout>
  );
}
