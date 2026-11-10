"use client";

import { useMemo, useState } from "react";
import { Award, Check, Clock3, HelpCircle, LockKeyhole, Target } from "lucide-react";
import type { PassportAchievement, PassportCampaign, PassportQuest } from "@/lib/passport/types";
import { boundedPercent, formatPassportDate, passportQuestProgress, sortAchievements } from "./passport-utils";
import { NativeSelect } from "@/components/base/select/select-native";

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
  return [xp ? `${xp} XP` : "", sparks ? `${sparks} Sparks` : ""].filter(Boolean).join(" + ") || "Reward details unavailable";
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
  const visibleQuests = quests.filter((quest) => quest.state !== "expired" && quest.state !== "revoked");
  const shown = useMemo(
    () => sortAchievements(achievements)
      .filter((achievement) => family === "all" || achievement.family === family)
      .filter((achievement) => showLocked || achievement.earned),
    [achievements, family, showLocked],
  );

  return (
    <div className="passport-section-stack passport-achievements-page">
      <section className="passport-section-heading">
        <div>
          <h2>Achievements</h2>
          <p>Track your quests and earned milestones.</p>
        </div>
      </section>

      <section className="passport-quests" aria-labelledby="quest-heading">
        <header><div><h3 id="quest-heading">Quests</h3></div></header>
        {visibleQuests.length ? (
          <div className="passport-quest-grid">
            {visibleQuests.map((quest) => {
              const { current: progress, target } = passportQuestProgress(quest);
              const completed = quest.state === "completed" || quest.state === "claimed";
              return (
                <article key={quest.code} className={`passport-quest ${completed ? "is-complete" : ""}`}>
                  <div className="passport-quest__icon">{completed ? <Check aria-hidden="true" /> : <Target aria-hidden="true" />}</div>
                  <div>
                    {quest.channelSlug ? <span>{quest.channelSlug.replaceAll("-", " ")}</span> : null}
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
        ) : <div className="passport-empty passport-empty--small"><Target aria-hidden="true" /><h3>No quests available</h3><p>New quests will appear here.</p></div>}
      </section>

      {campaigns.length ? (
        <section className="passport-campaigns">
          <div className="passport-section-heading"><div><h2>Programs</h2><p>Related quests grouped together.</p></div></div>
          <div className="passport-campaign-grid">
            {campaigns.map((campaign) => {
              const linked = quests.filter((quest) => quest.campaignCode === campaign.code);
              return (
                <article key={campaign.code} className="passport-campaign">
                  <div><h3>{campaign.name}</h3><p className="passport-campaign-count">{campaign.completed} of {campaign.total} complete</p><div className="passport-progress"><span style={{ width: `${boundedPercent(campaign.completed, campaign.total)}%` }} /></div>
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
          <NativeSelect className="passport-achievement-select" aria-label="Achievement category" value={family} onChange={(event) => setFamily(event.target.value)} options={[{ value: "all", label: "All categories" }, ...families.map((value) => ({ value, label: value }))]} size="sm" />
          <button type="button" className={`passport-filter-toggle ${showLocked ? "is-active" : ""}`} onClick={() => setShowLocked((value) => !value)} aria-pressed={showLocked}><LockKeyhole aria-hidden="true" /> Show locked</button>
        </header>
        <div className="passport-achievement-grid">
          {shown.map((achievement) => <AchievementTile key={`${achievement.code}:${achievement.channelSlug ?? "global"}`} achievement={achievement} />)}
        </div>
        {!shown.length ? <p className="passport-achievement-empty" role="status">{achievements.length ? "No achievements match these filters." : "Achievements will appear here when available."}</p> : null}
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
