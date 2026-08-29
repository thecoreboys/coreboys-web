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
    <LegalLayout title="Terms of service" effectiveDate="2026-08-28" kind="terms">
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
        Terms. To purchase recurring site support, you must be legally able to
        make the purchase or have authorization from the payment-method owner
        and any parent or guardian whose consent is required by law.
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

      <h2>Optional recurring site support</h2>
      <p>
        CORE site support is an optional monthly contribution for the independent website. It is not a subscription to any creator, does not grant access to third-party creator content, and does not create an affiliation with CORE or its members. The exact recurring amount and billing interval are shown before you complete Stripe Checkout.
      </p>
      <p>
        As of the effective date above, the site-wide safety range is $3 to $500 USD per month and a new checkout starts at a suggested $10 USD. The active minimum, maximum, or suggested amount may be narrowed within that range when shown in the billing interface. Site support is not a charitable donation and should not be treated as tax-deductible unless we expressly provide a legally valid receipt saying otherwise.
      </p>
      <p>
        By completing Checkout, you authorize the amount displayed there to be charged every month until cancellation. Stripe Checkout separately requires acceptance of these Terms. You may cancel recurring billing at any time in the Stripe billing portal. Unless Stripe states otherwise, cancellation ends future renewal and takes effect after the already-paid billing period; it does not erase charges that were properly incurred before cancellation.
      </p>
      <p>
        We may change the permitted contribution range, suggested amount, or price for a future billing period. If your chosen amount no longer meets the active range, we may post a notice in your billing area and, where required, send notice using the contact information associated with your billing profile. Our automated threshold-cancellation workflow provides at least 30 days between publishing that notice and its stated deadline, or longer where applicable law requires it. You may affirmatively choose a qualifying amount or cancel. If you do neither by the stated deadline, we may decline renewal or schedule the recurring subscription to end after the current paid period. A new minimum does not by itself authorize us to silently increase your chosen recurring amount; any higher charge remains subject to the notice and authorization required by applicable law.
      </p>
      <p>
        We may lower an existing renewal amount without an immediate charge or proration. We may also decline a renewal, stop accepting support, or cancel recurring billing for operational, fraud, security, legal, payment, or business reasons. We will not make a retroactive charge for a price change. Payments, authentication, receipts, invoices, payment-method updates, and any permitted refunds are handled through Stripe. Refunds are not guaranteed, except where a refund, cancellation right, or other remedy cannot legally be waived.
      </p>

      <h2>Final sale and refunds</h2>
      <p>
        Unless applicable law requires otherwise, all site-support payments and other purchases
        made through the site are final and non-refundable. Canceling a recurring payment stops
        future renewals; it does not create a refund or credit for the current billing period, a
        partially used period, or an amount you chose to contribute. We may choose to issue a
        courtesy refund, but we are not required to do so and a past courtesy does not create a
        continuing obligation.
      </p>
      <p>
        If you believe a payment was unauthorized, duplicated, incorrectly processed, or charged
        after a timely cancellation, contact us through the address below so we can investigate
        with Stripe. Nothing in this section waives rights that cannot legally be waived, including
        rights relating to unauthorized transactions, consumer protection laws, or a payment
        processor&apos;s dispute process.
      </p>

      <h2>User submissions and AI features</h2>
      <p>
        You are responsible for anything you submit, upload, or connect to the site. You must have
        the rights and permissions needed for that material and must not submit confidential,
        unlawful, infringing, abusive, or malicious content. You grant us a limited, non-exclusive
        permission to host, reproduce, display, and process submissions only as needed to operate,
        secure, moderate, and improve the site. We may remove or decline any submission at any time.
      </p>
      <p>
        Some site features may use automated or AI-assisted systems, including DJ Cora. Outputs
        may be inaccurate, incomplete, offensive, or unavailable; they are provided for
        entertainment and convenience, not as professional advice or a guarantee of any result.
        We may limit, review, change, or disable automated features and their usage limits at any
        time.
      </p>

      <h2>Indemnification</h2>
      <p>
        To the fullest extent permitted by law, you agree to defend, indemnify, and hold harmless
        the site maintainers, contractors, and licensors from claims, losses, liabilities, costs,
        and reasonable expenses arising from your violation of these Terms, your submissions, your
        misuse of the site, or your violation of another person&apos;s rights. We may take over the
        defense of a claim covered by this section, and you agree to cooperate with that defense.
      </p>

      <h2>Accounts, moderation, and suspension</h2>
      <p>
        We may restrict, suspend, or terminate an account or remove submitted content if we reasonably believe it violates these Terms, creates a security or legal risk, infringes another person&apos;s rights, abuses the service, or threatens the site or its users. When practical, we may provide notice or an opportunity to correct the issue, but we are not required to do so where immediate action is reasonably necessary.
      </p>

      <h2>Changes to or discontinuation of the site</h2>
      <p>
        We may add, remove, modify, restrict, suspend, or permanently discontinue any feature or the entire site at any time for operational, security, legal, financial, or business reasons. We do not promise that any feature, account tool, archive, or integration will remain available. When practical, we may give advance notice, but emergencies or third-party platform changes may require immediate action.
      </p>
      <p>
        If we discontinue the recurring paid service, we will stop future renewals and handle amounts already paid as required by applicable law. A site shutdown does not authorize continued charges for a service that is no longer being provided, and provisions that by their nature should survive—such as ownership, disclaimers, limitations of liability, and payment obligations already incurred—will survive.
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
      <p>
        To the fullest extent permitted by law, our total liability for all claims relating to the site or recurring support will not exceed the greater of $100 USD or the amount you paid us during the 12 months before the event giving rise to the claim. Some jurisdictions do not allow particular warranty exclusions or liability limits, so those limits apply only to the extent legally permitted and do not reduce rights that cannot be waived.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may revise these Terms from time to time. The most recent
        version is always at this URL with the effective date above. We may
        provide additional notice of material changes. Continued use may
        constitute acceptance only where permitted by law; material recurring-
        billing changes remain subject to any separate notice or affirmative
        consent the law requires.
      </p>

      <h2>General terms</h2>
      <p>
        If a court finds part of these Terms unenforceable, the remaining parts remain in effect to the fullest extent permitted by law. A delay in enforcing a provision is not a waiver. These Terms and the Privacy Policy are the entire agreement about use of the site, except for terms presented for a specific feature or transaction.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Write to <a href="mailto:legal@thecoreboys.com">legal@thecoreboys.com</a>.
      </p>
    </LegalLayout>
  );
}
