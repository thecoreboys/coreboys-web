"use client";

import Link from "next/link";
import type { PassportDashboard } from "@/lib/passport/types";

/** Keep seconds visible: small real sessions should never round down to zero hours. */
export function formatPassportWatchTime(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours ? `${hours}h ${minutes}m ${remainder}s` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

const PLATFORM_NAMES: Record<string, string> = { twitch: "Twitch", youtube: "YouTube", kick: "Kick", tiktok: "TikTok", instagram: "Instagram", x: "X", core: "CORE" };

export function PassportWatchActivity({ passport }: { passport: PassportDashboard }) {
  const activity = passport.watchAnalytics;
  return <section className="passport-watch-activity" aria-labelledby="passport-watch-heading">
    <header><div><h2 id="passport-watch-heading">Your watch time</h2><p>Playback measured while you watch on CORE.</p></div><Link href="/dvr" className="passport-text-button">Watch history →</Link></header>
    {activity ? <>
      <dl className="passport-watch-totals"><div><dt>Total time</dt><dd>{formatPassportWatchTime(activity.totalSeconds)}</dd></div><div><dt>Last 7 days</dt><dd>{formatPassportWatchTime(activity.seconds7d)}</dd></div><div><dt>Last watched</dt><dd className="passport-watch-date">{activity.lastWatchedAt ? <time dateTime={activity.lastWatchedAt}>{new Date(activity.lastWatchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time> : "No playback yet"}</dd></div></dl>
      {activity.byPlatform.length ? <div className="passport-watch-platforms"><table><caption className="sr-only">Playback on CORE by platform</caption><thead><tr><th scope="col">Platform</th><th scope="col">Last 7 days</th><th scope="col">Total</th></tr></thead><tbody>{activity.byPlatform.map((row) => <tr key={row.platform}><th scope="row">{PLATFORM_NAMES[row.platform] ?? row.platform}</th><td>{formatPassportWatchTime(row.seconds7d)}</td><td>{formatPassportWatchTime(row.totalSeconds)}</td></tr>)}</tbody></table></div> : <p className="passport-watch-empty">Start a video or live stream on CORE to begin tracking. Your time appears here as playback is recorded.</p>}
    </> : <p className="passport-watch-empty">Watch-time details are temporarily unavailable. Your collected moments and achievements are still available below.</p>}
    <footer><p>Connected platforms do not share watch history from their own apps. Twitch and YouTube watched here count toward your CORE total.</p><Link href="/account/settings#connections" className="passport-text-button">Manage connections →</Link></footer>
  </section>;
}
