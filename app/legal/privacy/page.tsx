import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What thecoreboys.com collects, why, and what you can do about it.",
  alternates: { canonical: "/legal/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy" effectiveDate="2026-08-21" kind="privacy">
      <p>
        <strong>thecoreboys.com</strong> is an{" "}
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
        <li>We don&apos;t identify site visitors or audience members by face. Any face-presence pilot is limited to separately consenting adults in controlled, authorized footage.</li>
        <li>We respond to deletion / access requests at <a href="mailto:privacy@thecoreboys.com">privacy@thecoreboys.com</a>.</li>
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
        thecoreboys.com embeds content from third-party services. Each
        service may set its own cookies and collect its own data:
      </p>
      <ul>
        <li><a href="https://www.twitch.tv/p/legal/privacy-notice/">Twitch</a> — live status + clip embeds</li>
        <li><a href="https://policies.google.com/privacy">YouTube / Google</a> — video embeds + analytics</li>
        <li><a href="https://www.tiktok.com/legal/privacy-policy">TikTok</a> — embedded posts</li>
        <li><a href="https://privacycenter.instagram.com/policy/">Instagram / Meta</a> — photos, reels, and connected-account media</li>
        <li><a href="https://twitter.com/en/privacy">X / Twitter</a> — link-only by default; official DNT embeds load only after a per-post choice or the separate &quot;Always load X posts&quot; localStorage preference</li>
      </ul>
      <p>
        We have no control over these services&apos; data practices. Their
        privacy policies govern the data they collect from you.
      </p>
      <p>
        X is not contacted by our post component before that distinct embed choice.
        Global Privacy Control and Data Saver keep X posts click-to-load.
      </p>

      <h3>Fan accounts</h3>
      <p>
        If you create a CORE account we store your email, a bcrypt password
        hash, display name, and consent timestamp. Sessions live in an
        HttpOnly cookie.
      </p>
      <h3>Connected platforms (Twitch, YouTube, X, TikTok, Instagram)</h3>
      <p>
        Connecting a platform is optional. We store an encrypted access and
        refresh token, the handle you connected, the scopes you granted, and
        inferred loyalty facts (follows, subscriptions, likes we are allowed
        to read). We do <strong>not</strong> receive Twitch watch time, VOD
        history, or YouTube watch history — those APIs are closed to third
        parties, and we do not scrape them. Disconnecting a platform deletes
        its tokens and inferred stats. Your CORE account remains. You can
        export a JSON copy of your data from /account at any time. Tokens
        are never included in that export.
      </p>
      <p>
        Instagram connections are limited to the profile and media access you
        approve for an eligible professional account. TikTok connections are
        limited to approved profile and public-video scopes. We do not use
        either connection to post or comment as you. See our{" "}
        <a href="/legal/data-deletion">data deletion instructions</a> to
        disconnect a platform or request full account deletion.
      </p>
      <h3>On-site presence</h3>
      <p>
        If you are signed in we may record that you opened the chat hub or
        played a video on this site. That is site presence, not Twitch or
        YouTube hours watched, and we label it that way.
      </p>
      <h3>Consent-only face-presence pilot</h3>
      <p>
        If we activate face-presence tagging for participating creators, it is
        a closed-set pilot for specifically enrolled adults—not facial
        recognition of site visitors, fans, crowds, or the public. Before
        creating a numerical face template, we provide a separate notice,
        identify the specific purpose and retention period, confirm that the
        person is at least 18, and obtain that person&apos;s express written or
        electronic permission. Appearing in a stream, having a public profile,
        or posting a photograph is not consent.
      </p>
      <p>
        Purpose choices are recorded separately for template creation,
        controlled live matching, authorized archive matching, public name
        tags, and profile/social links. Automatic matching is limited to a
        controlled source or segment where every person who may be visible has
        consented. Uncontrolled or IRL footage uses staff-created manual labels
        instead of biometric matching. Suggested matches require staff review
        before publication, and an unknown face is not forced to the nearest
        enrolled identity.
      </p>
      <p>
        Protected pilot data may include subject-approved enrollment images,
        numerical face templates, consent records, authorized source and time
        ranges, review evidence, and an audit log. Public viewers receive only
        a reviewed name/profile/time-range tag—not templates, reference images,
        raw similarity scores, or private evidence. We do not sell, lease,
        trade, or use face templates for advertising, authentication,
        moderation punishment, law enforcement, eligibility, or sensitive
        trait inference.
      </p>
      <p>
        Our proposed operating defaults delete unknown face data immediately,
        enrollment uploads within 24 hours after quality review, review evidence
        within 7 days, and non-image diagnostic logs within 30 days. Active
        templates require renewal after no more than 12 months. A participating
        person may revoke a purpose or request correction/deletion at{" "}
        <a href="mailto:privacy@thecoreboys.com">privacy@thecoreboys.com</a>;
        matching and new public tags for that purpose are disabled promptly and
        covered biometric data enters the verified deletion process.
      </p>
      <h3>Forms</h3>
      <p>
        If you email us (e.g. press, booking, legal), we keep that
        correspondence for as long as needed to respond to it and for a
        reasonable record-keeping period afterward.
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
        <a href="mailto:privacy@thecoreboys.com">privacy@thecoreboys.com</a>{" "}
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
        thecoreboys.com is not directed at children under 13. We don&apos;t
        knowingly collect personal information from children. If you
        believe a child has provided us with information, email{" "}
        <a href="mailto:privacy@thecoreboys.com">privacy@thecoreboys.com</a>{" "}
        and we&apos;ll delete it.
      </p>
      <p>
        The face-presence pilot does not enroll or recognize anyone under 18.
        If a minor or an unconsented person may enter a source, automatic face
        matching must remain off for that source or segment.
      </p>

      <h2>Changes</h2>
      <p>
        We&apos;ll update this policy when our data practices change. The
        effective date above is always current. Material changes will be
        announced on the home page.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:privacy@thecoreboys.com">privacy@thecoreboys.com</a>
      </p>
    </LegalLayout>
  );
}
