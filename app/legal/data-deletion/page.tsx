import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Data deletion",
  description:
    "How to disconnect a platform or request deletion of data held by thecoreboys.com.",
  alternates: { canonical: "/legal/data-deletion" },
  robots: { index: true, follow: true },
};

type PageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function DataDeletionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const code = rawCode && /^[A-Za-z0-9]{8,64}$/.test(rawCode) ? rawCode : null;

  return (
    <LegalLayout
      title="Data deletion"
      effectiveDate="2026-08-21"
      kind="data-deletion"
    >
      {code ? (
        <div className="rounded-xl border border-success_subtle bg-success-primary p-5">
          <p className="font-semibold text-primary">Request processed</p>
          <p className="mt-1 text-sm text-tertiary">
            A valid Meta deletion request removes the matching Instagram
            connection, encrypted tokens, and Instagram-derived account data
            immediately. The connection may already have been absent.
          </p>
          <p className="mt-3 text-sm text-tertiary">
            Confirmation code: <code>{code}</code>
          </p>
        </div>
      ) : null}

      <p>
        You can remove a connected platform without deleting your entire CORE
        account, or ask us to delete all personal data associated with your
        account. Disconnecting or deleting data does not delete anything from
        Instagram, Facebook, YouTube, Twitch, TikTok, or X itself.
      </p>

      <h2>Disconnect Instagram or another platform</h2>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Sign in to your thecoreboys.com account.</li>
        <li>
          Open <Link href="/account">Account</Link> and find Connected accounts.
        </li>
        <li>Select Disconnect beside the platform you want to remove.</li>
      </ol>
      <p>
        Disconnecting immediately removes the encrypted access and refresh
        tokens, connected platform identifier, and platform-specific loyalty
        facts held by thecoreboys.com. Your CORE account and on-site watch
        history remain so you can keep using the site.
      </p>

      <h2>Delete all of your thecoreboys.com data</h2>
      <p>
        Email <a href="mailto:privacy@thecoreboys.com?subject=Data%20deletion%20request">privacy@thecoreboys.com</a>{" "}
        from the address on your CORE account with the subject &quot;Data deletion
        request.&quot; Tell us whether you want a particular platform connection
        removed or your entire CORE account deleted. We may ask you to verify
        ownership before acting, and we will respond within 30 days.
      </p>
      <p>
        Account deletion covers the account profile, encrypted connected-platform
        tokens, loyalty and personalization records, on-site watch progress,
        saved lists, and other account-linked activity, except records we must
        retain to meet a legal obligation or protect the service from abuse.
      </p>

      <h2>Revoke face-presence consent or delete biometric data</h2>
      <p>
        The consent-only face-presence pilot is separate from an ordinary CORE
        account. A participating person may revoke one or more purposes, correct
        a public tag, or request deletion by emailing{" "}
        <a href="mailto:privacy@thecoreboys.com?subject=Face%20presence%20revocation%20or%20deletion">
          privacy@thecoreboys.com
        </a>. Include the public/stage name and which purpose or source the
        request covers, but do not email identity documents or face photos.
      </p>
      <p>
        We will use a separate safe method to verify the subject before
        releasing information or deleting another person&apos;s record. Once
        verified, matching and new public tags for the revoked purpose are
        disabled promptly. Covered face templates, enrollment assets, review
        evidence, derived identity data, and caches enter the verified deletion
        process; bounded backups expire without restoring a revoked template.
      </p>

      <h2>Meta and Instagram requests</h2>
      <p>
        If you remove this app through Meta or Instagram account settings and
        request deletion, Meta sends a signed request to our automated callback.
        A valid callback removes the matching Instagram connection and returns
        a confirmation code plus this public status page. No login is required
        for Meta to call the endpoint.
      </p>
      <ul>
        <li>
          Data deletion instructions URL: <code>https://thecoreboys.com/legal/data-deletion</code>
        </li>
        <li>
          Data deletion callback URL: <code>https://thecoreboys.com/api/meta/data-deletion</code>
        </li>
      </ul>

      <h2>Questions or status help</h2>
      <p>
        Include your confirmation code, if you have one, and contact{" "}
        <a href="mailto:privacy@thecoreboys.com">privacy@thecoreboys.com</a>.
        For more information about what the site stores, read the{" "}
        <Link href="/legal/privacy">Privacy policy</Link>.
      </p>
    </LegalLayout>
  );
}
