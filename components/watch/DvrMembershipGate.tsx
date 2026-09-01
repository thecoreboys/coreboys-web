import Link from "next/link";
import { Archive, ArrowRight, Check, LockKeyhole } from "lucide-react";

const DVR_FEATURE = "dvr.extended_retention";

export function DvrMembershipGate({ planName }: { planName: string }) {
  const upgradeHref = `/upgrade?feature=${encodeURIComponent(DVR_FEATURE)}`;

  return (
    <main className="watch-dvr-gate" aria-labelledby="dvr-gate-title">
      <section className="watch-dvr-gate__shell">
        <div className="watch-dvr-gate__intro">
          <span className="watch-dvr-gate__icon" aria-hidden><Archive /></span>
          <p className="watch-dvr-gate__eyebrow"><LockKeyhole aria-hidden /> {planName}</p>
          <h1 id="dvr-gate-title">DVR is included with membership.</h1>
          <p className="watch-dvr-gate__copy">
            Save streams, videos, Shorts, and posts to a private list that stays with your CORE account.
          </p>
        </div>

        <div className="watch-dvr-gate__actions">
          <ul aria-label="DVR membership benefits">
            <li><Check aria-hidden /> Pick up where you left off</li>
            <li><Check aria-hidden /> Keep saved titles in one place</li>
            <li><Check aria-hidden /> Build custom watch queues</li>
          </ul>
          <div>
            <Link href={upgradeHref as never} className="watch-dvr-gate__primary">
              Explore membership <ArrowRight aria-hidden />
            </Link>
            <Link href="/#latest" className="watch-dvr-gate__secondary">Back to Watch</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
