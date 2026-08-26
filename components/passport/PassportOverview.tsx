"use client";

import Link from "next/link";
import { useState } from "react";
import { Award, BookOpen, CalendarDays, Check, ChevronRight, Clock3, Flame, Radio, Sparkles, Target, Trophy, Users, Zap } from "lucide-react";
import type { PassportActiveEvent, PassportCard, PassportDashboard } from "@/lib/passport/types";
import { MomentCardBack, MomentCardTile } from "./MomentCard";
import { PassportDialog } from "./PassportDialog";
import { boundedPercent, channelAccent, channelLabel, formatCompact, formatPassportDate, passportChannelLevelPercent, passportLiveScore, passportQuestProgress, passportScoreStatus, safePassportInternalHref } from "./passport-utils";

function LiveScore({ event }: { event: PassportActiveEvent }) {
  if (!event.scoreboard) return null;
  const score = passportLiveScore(event.scoreboard.state);
  if (!score) return null;
  const status = passportScoreStatus(event.scoreboard.status);
  const [home, away] = score.teams;
  return (
    <div className="passport-live-score" aria-label={`${score.title ? `${score.title}: ` : ""}${home.name} ${home.score}, ${away.name} ${away.score}, ${status}`}>
      <span>{home.name}<strong>{home.score}</strong></span>
      <i>–</i>
      <span><strong>{away.score}</strong>{away.name}</span>
      <small className={`is-${status}`}>{status}</small>
    </div>
  );
}

export function PassportOverview({
  passport,
  onNavigate,
  onClaimPresence,
  onClaimQuest,
  onClaimCommunityGoal,
  claiming,
}: {
  passport: PassportDashboard;
  onNavigate: (tab: "memories" | "achievements" | "identity" | "exchange") => void;
  onClaimPresence: (eventId: string) => Promise<unknown>;
  onClaimQuest: (questCode: string) => Promise<unknown>;
  onClaimCommunityGoal: (goalCode: string) => Promise<unknown>;
  claiming: boolean;
}) {
  const [selectedCard, setSelectedCard] = useState<PassportCard | null>(null);
  const featured = passport.showcase.cardIds
    .map((id) => passport.cards.find((card) => card.id === id))
    .filter((card): card is PassportCard => Boolean(card));
  const recentCards = featured.length ? featured : passport.cards.slice(0, 4);
  const earnedAchievements = passport.achievements.filter((achievement) => achievement.earned);
  const activeQuests = passport.quests.filter((quest) => quest.state === "active" || quest.state === "completed").slice(0, 3);

  return (
    <div className="passport-section-stack">
      {passport.activeEvents.length ? (
        <section className="passport-live-events">
          {passport.activeEvents.map((event) => {
            const watchable = event.state === "live" || event.state === "scheduled";
            const statusLabel = event.state === "live"
              ? "Live Passport event"
              : event.state === "scheduled"
                ? "Starts soon"
                : event.claimState === "ready"
                  ? "Reward ready"
                  : event.claimState === "claimed"
                    ? "Memory claimed"
                    : "Awaiting certification";
            const statusCopy = event.claimState === "ready"
              ? "Your verified presence is ready. Add the Attendance Card and eligible Moment Cards to your Passport."
              : event.claimState === "claimed"
                ? "Your attendance and eligible Moment Cards are safely recorded in your Memory Book."
                : event.claimState === "pending_certification"
                  ? `${Math.floor(event.watchSeconds / 60)} minutes recorded. Permanent rewards unlock only after an independent operator certifies the event.`
                  : "Watch meaningfully to qualify for this event's Attendance Card and marked Moment Cards.";
            return <article key={event.id}>
              <span className="passport-live-dot" aria-hidden="true" />
              <div><span>{statusLabel} · {channelLabel(event.channelSlug)}</span><h2>{event.title}</h2><p>{statusCopy}</p><LiveScore event={event} /></div>
              {event.canClaim ? <button type="button" className="passport-button passport-button--primary" disabled={claiming} onClick={() => void onClaimPresence(event.id).catch(() => {})}><Sparkles aria-hidden="true" /> {claiming ? "Claiming…" : "Claim memory"}</button> : watchable ? <Link href={(safePassportInternalHref(event.externalRef) ?? "/guide") as never} className="passport-button passport-button--primary"><Radio aria-hidden="true" /> Watch live</Link> : event.claimState === "claimed" ? <span className="passport-claimed"><Check aria-hidden="true" /> Claimed</span> : <span className="passport-inline-note">Certification pending</span>}
            </article>;
          })}
        </section>
      ) : null}

      <section className="passport-stats" aria-label="Passport stats">
        <article><span><Trophy aria-hidden="true" /></span><div><strong>Level {passport.globalProgress.level}</strong><small>{formatCompact(passport.globalProgress.xp)} global XP</small></div></article>
        <article><span><BookOpen aria-hidden="true" /></span><div><strong>{passport.recap.cardsCollected}</strong><small>Moment Cards</small></div></article>
        <article><span><Award aria-hidden="true" /></span><div><strong>{earnedAchievements.length}</strong><small>Achievements</small></div></article>
        <article><span><Sparkles aria-hidden="true" /></span><div><strong>{formatCompact(passport.profile.sparks)}</strong><small>Cosmetic Sparks</small></div></article>
      </section>

      <section className="passport-global-progress">
        <div className="passport-level-orbit"><span>LEVEL</span><strong>{passport.globalProgress.level}</strong></div>
        <div><span className="passport-kicker"><Zap aria-hidden="true" /> CORE Passport</span><h2>{passport.profile.displayTitle ?? "Your story is in motion."}</h2><p>Global XP grows through meaningful watching, community participation, collections, and channel stories.</p><div className="passport-progress passport-progress--large"><span style={{ width: `${passport.globalProgress.percent}%` }} /></div><footer><span>{passport.globalProgress.xp.toLocaleString("en-US")} XP</span><span>{Math.max(0, passport.globalProgress.nextLevelXp - passport.globalProgress.xp).toLocaleString("en-US")} to Level {passport.globalProgress.level + 1}</span></footer></div>
      </section>

      <div className="passport-goals-recap">
        <section className="passport-community-goals">
          <header><div><span className="passport-kicker"><Users aria-hidden="true" /> Community goals</span><h2>Everyone moves the meter.</h2></div></header>
          {passport.communityGoals.filter((goal) => goal.state !== "retired").length ? (
            <div>{passport.communityGoals.filter((goal) => goal.state !== "retired").slice(0, 3).map((goal) => {
              const percent = boundedPercent(goal.total, goal.target);
              return <article key={goal.code}><div><span>{goal.channelSlug ? channelLabel(goal.channelSlug) : "All of CORE"}</span><strong>{goal.name}</strong><p>{goal.description}</p></div><div className="passport-progress"><span style={{ width: `${percent}%` }} /></div><footer><small>{formatCompact(goal.total)} / {formatCompact(goal.target)}</small>{goal.claimed ? <small><Check aria-hidden="true" /> Reward claimed</small> : goal.state === "completed" && goal.eligible ? <button type="button" className="passport-button passport-button--primary passport-button--small" disabled={claiming} onClick={() => void onClaimCommunityGoal(goal.code).catch(() => {})}>Claim shared reward</button> : goal.state === "completed" ? <small>Complete · Contributors qualify</small> : <small>{percent}%</small>}</footer></article>;
            })}</div>
          ) : <p className="passport-inline-note">The next shared community goal will appear here.</p>}
        </section>
        <section className="passport-recap-card">
          <span className="passport-kicker"><CalendarDays aria-hidden="true" /> Your recent recap</span>
          <h2>A season only you lived.</h2>
          <div><span><BookOpen aria-hidden="true" /><strong>{passport.recap.cardsCollected}</strong><small>cards</small></span><span><Radio aria-hidden="true" /><strong>{passport.recap.eventsAttended}</strong><small>events</small></span><span><Award aria-hidden="true" /><strong>{passport.recap.achievementsEarned}</strong><small>badges</small></span><span><Clock3 aria-hidden="true" /><strong>{Math.round(passport.recap.watchSeconds / 3_600)}</strong><small>hours</small></span></div>
          <p>{passport.recap.channelsExplored} communities explored. Every completed memory stays in your Passport.</p>
        </section>
      </div>

      <section className="passport-overview-section">
        <header><div><span className="passport-kicker"><Flame aria-hidden="true" /> Channel loyalty</span><h2>Every community has its own story.</h2></div></header>
        <div className="passport-channel-grid">
          {passport.channels.map((channel) => (
            <article key={channel.channelSlug} style={{ "--channel-accent": channelAccent(channel.channelSlug) } as React.CSSProperties}>
              <span className="passport-channel-level">{channel.level}</span>
              <div><span>{channelLabel(channel.channelSlug)}</span><h3>Level {channel.level}</h3><div className="passport-progress"><span style={{ width: `${passportChannelLevelPercent(channel.xp, channel.level, channel.nextLevelXp)}%` }} /></div><footer><small>{formatCompact(channel.xp)} XP</small><small>{channel.eventsAttended} events</small></footer></div>
            </article>
          ))}
        </div>
      </section>

      <section className="passport-overview-section">
        <header><div><span className="passport-kicker"><BookOpen aria-hidden="true" /> Memory Wall</span><h2>The moments you can prove you lived.</h2></div><button type="button" className="passport-text-button" onClick={() => onNavigate("memories")}>Open Memory Book <ChevronRight aria-hidden="true" /></button></header>
        {recentCards.length ? <div className="memory-book-grid memory-book-grid--featured">{recentCards.slice(0, 4).map((card) => <MomentCardTile key={card.id} card={card} onOpen={() => setSelectedCard(card)} />)}</div> : <div className="passport-empty passport-empty--small"><BookOpen aria-hidden="true" /><h3>Your first card is waiting.</h3><p>Join a qualifying CORE event to begin your Memory Book.</p></div>}
      </section>

      <div className="passport-overview-split">
        <section className="passport-overview-section">
          <header><div><span className="passport-kicker"><Target aria-hidden="true" /> Next moves</span><h2>Active quests</h2></div><button type="button" className="passport-text-button" onClick={() => onNavigate("achievements")}>View all <ChevronRight aria-hidden="true" /></button></header>
          <div className="passport-overview-quests">
            {activeQuests.map((quest) => {
              const { current, target } = passportQuestProgress(quest);
              return <article key={quest.code}><span>{quest.state === "completed" ? <Check aria-hidden="true" /> : <Target aria-hidden="true" />}</span><div><h3>{quest.name}</h3><p>{quest.description}</p><div className="passport-progress"><span style={{ width: `${boundedPercent(current, target)}%` }} /></div><small>{current}/{target}</small>{quest.state === "completed" ? <button type="button" className="passport-button passport-button--small" disabled={claiming} onClick={() => void onClaimQuest(quest.code).catch(() => {})}>Claim reward</button> : null}</div></article>;
            })}
            {!activeQuests.length ? <p className="passport-inline-note">No active quests right now. Your progress is safe between campaigns.</p> : null}
          </div>
        </section>

        <section className="passport-overview-section">
          <header><div><span className="passport-kicker"><CalendarDays aria-hidden="true" /> Recent achievements</span><h2>Milestones</h2></div><button type="button" className="passport-text-button" onClick={() => onNavigate("achievements")}>Badge library <ChevronRight aria-hidden="true" /></button></header>
          <div className="passport-recent-achievements">{earnedAchievements.slice(0, 5).map((achievement) => <article key={achievement.code}><span><Award aria-hidden="true" /></span><div><strong>{achievement.name}</strong><small>{achievement.tier} · {formatPassportDate(achievement.earnedAt)}</small></div></article>)}</div>
        </section>
      </div>

      <PassportDialog open={Boolean(selectedCard)} title={selectedCard?.name ?? "Moment Card"} description="The verified story behind this card." onClose={() => setSelectedCard(null)} wide>
        {selectedCard ? <MomentCardBack card={selectedCard} /> : null}
      </PassportDialog>
    </div>
  );
}
