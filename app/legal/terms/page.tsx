import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms governing use of thecoreboys.com.",
  alternates: { canonical: "/legal/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of service" effectiveDate="2026-08-23" kind="terms">
      <p>
        <strong>thecoreboys.com</strong> is an{" "}
        <strong>unofficial site</strong> about CORE. It is not
        operated by, endorsed by, or affiliated with CORE or any
        of its members. These Terms of Service (&quot;<strong>Terms</strong>&quot;)
        govern your access to and use of this site. &quot;<strong>We</strong>&quot;
        / &quot;<strong>us</strong>&quot; refers to the maintainers of this
        site. By using the site, you agree to these Terms.
      </p>

      <h2>The site, in plain English</h2>
      <p>
        thecoreboys.com is an unofficial site that links to publicly
        available channels, surfaces live status from public APIs, embeds
        publicly published content, and aggregates editorial coverage. It
        is not an official property of CORE.
      </p>
      <p>
        We host optional CORE fan accounts, on-site community features, and
        read-only connected-account preferences. Third-party streams, videos,
        and social posts remain hosted by their original platforms (Twitch,
        YouTube, TikTok, Instagram, X, etc.) under each platform&apos;s own terms.
      </p>

      <h2>Eligibility</h2>
      <p>
        You may use thecoreboys.com if you can form a binding contract under
        applicable law. If you&apos;re using the site on behalf of an entity,
        you represent that you have authority to bind that entity to these
        Terms.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not attempt to disrupt, deny service, or probe the site for vulnerabilities outside a coordinated disclosure.</li>
        <li>Do not scrape at a rate that materially burdens our infrastructure. The robots.txt and sitemap are the supported integration paths.</li>
        <li>Do not impersonate the maintainers of this site, CORE, or any of its members.</li>
        <li>Do not use the site to distribute malicious software, infringing content, or harassing material.</li>
      </ul>

      <h2>Intellectual property</h2>
      <p>
        The CORE wordmark, logo, and member portraits referenced on this
        site belong to CORE and their respective owners. We
        claim no ownership of those marks and reference them only as
        part of this unofficial site. The codebase that powers thecoreboys.com is owned by
        the site maintainers; use of it without written permission is not
        granted by these Terms.
      </p>
      <p>
        Editorial content (essays, photos, video clips) embedded on this
        site is owned by the third-party platform on which it was
        originally published, or by the original creator.
      </p>

      <h2>Third-party services</h2>
      <p>
        We embed live status from <a href="https://dev.twitch.tv">Twitch</a>,
        video from <a href="https://www.youtube.com">YouTube</a>, media from
        Instagram and TikTok, and analytics via <a href="https://policies.google.com/privacy">Google Analytics</a>.
        Each is governed by its own terms and privacy policy. See our{" "}
        <a href="/legal/privacy">Privacy Policy</a> for what we share with
        them.
      </p>

      <h2>Disclaimers</h2>
      <p>
        thecoreboys.com is provided &quot;as is&quot; and &quot;as available&quot;.
        We do not warrant that the site will be uninterrupted, error-free,
        or that the public numbers we surface (live status, follower
        counts) are perfectly current. Numbers are refreshed on a best-
        effort basis from third-party APIs.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the maintainers of this
        site, contractors, and licensors will not be liable for any
        indirect, incidental, consequential, special, or punitive damages
        arising from your use of the site.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may revise these Terms from time to time. The most recent
        version is always at this URL with the effective date above. Your
        continued use of the site after a change constitutes acceptance of
        the updated Terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Write to <a href="mailto:legal@thecoreboys.com">legal@thecoreboys.com</a>.
      </p>
    </LegalLayout>
  );
}
