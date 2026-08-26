"use client";

import { useMemo, useState } from "react";
import { Award, Check, Clock3, HelpCircle, LockKeyhole, Sparkles, Target, Trophy } from "lucide-react";
import type { PassportAchievement, PassportCampaign, PassportQuest } from "@/lib/passport/types";
import { boundedPercent, formatPassportDate, passportQuestProgress, sortAchievements } from "./passport-utils";

function recordNumber(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  }
  return 0;
}

function rewardLabel(reward: Record<string, unknown>) {
  if (typeof reward.label === "string") return reward.label;
  const xp = recordNumber(reward, "globalXp", "xp", "xpReward");
  const sparks = recordNumber(reward, "sparks", "sparksReward");
  return [xp ? `${xp} XP` : "", sparks ? `${sparks} Sparks` : ""].filter(Boolean).join(" + ") || "Mystery reward";
}

export function PassportAchievements({
  achievements,
  quests,
  campaigns,
  onClaimQuest,
  claiming,
}: {
  achievements: PassportAchievement[];
  quests: PassportQuest[];
  campaigns: PassportCampaign[];
  onClaimQuest: (questCode: string) => Promise<unknown>;
  claiming: boolean;
}) {
  const families = useMemo(
    () => Array.from(new Set(achievements.map((achievement) => achievement.family))).sort(),
    [achievements],
  );
  const [family, setFamily] = useState("all");
  const [showLocked, setShowLocked] = useState(true);
  const shown = useMemo(
    () => sortAchievements(achievements)
      .filter((achievement) => family === "all" || achievement.family === family)
      .filter((achievement) => showLocked || achievement.earned),
    [achievements, family, showLocked],
  );

  return (
    <div className="passport-section-stack">
      <section className="passport-section-heading">
        <div>
          <span className="passport-kicker"><Trophy aria-hidden="true" /> Achievements</span>
          <h2>Your history grows with you.</h2>
          <p>Attendance, knowledge, collection, and community badges evolve from Bronze to Icon without losing their original earned date.</p>
        </div>
      </section>

      <section className="passport-quests" aria-labelledby="quest-heading">
        <header><div><span className="passport-kicker"><Target aria-hidden="true" /> Live objectives</span><h3 id="quest-heading">Quests</h3></div><p>Cosmetic rewards only—never moderation power or vote weight.</p></header>
        {quests.length ? (
          <div className="passport-quest-grid">
            {quests.filter((quest) => quest.state !== "expired" && quest.state !== "revoked").map((quest) => {
              const { current: progress, target } = passportQuestProgress(quest);
              const completed = quest.state === "completed" || quest.state === "claimed";
              return (
                <article key={quest.code} className={`passport-quest ${completed ? "is-complete" : ""}`}>
                  <div className="passport-quest__icon">{completed ? <Check aria-hidden="true" /> : <Target aria-hidden="true" />}</div>
                  <div>
                    <span>{quest.channelSlug ? quest.channelSlug.replaceAll("-", " ") : "CORE Passport"}</span>
                    <h4>{quest.name}</h4>
                    <p>{quest.description}</p>
                    <div className="passport-progress"><span style={{ width: `${boundedPercent(progress, target)}%` }} /></div>
                    <footer>
                      <small>{Math.min(progress, target)} / {target}</small>
                      <strong>{rewardLabel(quest.reward)}</strong>
                    </footer>
                    {quest.endsAt ? <p className="passport-deadline"><Clock3 aria-hidden="true" /> Ends {formatPassportDate(quest.endsAt)}</p> : null}
                    {quest.state === "completed" ? <button type="button" className="passport-button passport-button--primary passport-button--small" disabled={claiming} onClick={() => void onClaimQuest(quest.code).catch(() => {})}>Claim reward</button> : null}
                    {quest.state === "claimed" ? <span className="passport-claimed"><Check aria-hidden="true" /> Claimed</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="passport-empty passport-empty--small"><Target aria-hidden="true" /><h3>No active quests.</h3><p>New channel stories will appear here when they begin.</p></div>}
      </section>

      {campaigns.length ? (
        <section className="passport-campaigns">
          <div className="passport-section-heading"><div><span className="passport-kicker"><Sparkles aria-hidden="true" /> Story campaigns</span><h2>Finish the chapter.</h2></div></div>
          <div className="passport-campaign-grid">
            {campaigns.map((campaign) => {
              const linked = quests.filter((quest) => quest.campaignCode === campaign.code);
              return (
                <article key={campaign.code} className="passport-campaign">
                  <div className="passport-campaign__art"><Sparkles aria-hidden="true" /><span>{campaign.completed}/{campaign.total}</span></div>
                  <div><h3>{campaign.name}</h3><div className="passport-progress"><span style={{ width: `${boundedPercent(campaign.completed, campaign.total)}%` }} /></div>
                    <ol>{linked.map((quest) => { const complete = quest.state === "completed" || quest.state === "claimed"; return <li key={quest.code} className={complete ? "is-complete" : ""}>{complete ? <Check aria-hidden="true" /> : <span />}{quest.name}</li>; })}</ol>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="passport-achievement-library">
        <header className="passport-filter-bar">
          <label><span className="sr-only">Achievement family</span><select value={family} onChange={(event) => setFamily(event.target.value)}><option value="all">All badge families</option>{families.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button type="button" className={`passport-filter-toggle ${showLocked ? "is-active" : ""}`} onClick={() => setShowLocked((value) => !value)} aria-pressed={showLocked}><LockKeyhole aria-hidden="true" /> Show locked</button>
        </header>
        <div className="passport-achievement-grid">
          {shown.map((achievement) => <AchievementTile key={`${achievement.code}:${achievement.channelSlug ?? "global"}`} achievement={achievement} />)}
        </div>
      </section>
    </div>
  );
}

function AchievementTile({ achievement }: { achievement: PassportAchievement }) {
  const hidden = achievement.secret && !achievement.earned;
  return (
    <article className={`passport-achievement passport-achievement--${achievement.tier} ${achievement.earned ? "is-earned" : "is-locked"}`}>
      <div className="passport-achievement__medal">{hidden ? <HelpCircle aria-hidden="true" /> : <Award aria-hidden="true" />}</div>
      <div>
        <span>{achievement.family} · {achievement.tier}</span>
        <h3>{hidden ? "Secret achievement" : achievement.name}</h3>
        <p>{hidden ? "Keep exploring CORE to reveal this achievement." : achievement.description}</p>
        {!achievement.earned && !hidden ? <><div className="passport-progress"><span style={{ width: `${boundedPercent(achievement.progress, achievement.threshold)}%` }} /></div><small>{achievement.progress} / {achievement.threshold}</small></> : null}
        {achievement.earnedAt ? <small className="passport-achievement__earned"><Check aria-hidden="true" /> Earned {formatPassportDate(achievement.earnedAt)}</small> : null}
      </div>
    </article>
  );
}
