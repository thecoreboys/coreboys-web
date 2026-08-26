"use client";

import type { WatchMood, WatchSessionLength } from "@/lib/watch/discovery";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { Tooltip } from "@/components/base/tooltip/tooltip";

const MOODS: Array<{ id: WatchMood; label: string; icon: string }> = [
  { id: "all", label: "Any mood", icon: "✦" },
  { id: "hype", label: "Hype", icon: "⚡" },
  { id: "funny", label: "Funny", icon: "☺" },
  { id: "chill", label: "Chill", icon: "☁" },
  { id: "live", label: "Live now", icon: "●" },
  { id: "deep-dive", label: "Deep dive", icon: "◷" },
];

const LENGTHS: Array<{ id: WatchSessionLength; label: string }> = [
  { id: "all", label: "Any length" },
  { id: "quick", label: "Under 5 min" },
  { id: "half-hour", label: "5–30 min" },
  { id: "episode", label: "30–75 min" },
  { id: "marathon", label: "75+ min" },
];

export function WatchDiscoveryFilters({
  mood,
  onMoodChange,
  sessionLength,
  onSessionLengthChange,
  resultCount,
}: {
  mood: WatchMood;
  onMoodChange: (value: WatchMood) => void;
  sessionLength: WatchSessionLength;
  onSessionLengthChange: (value: WatchSessionLength) => void;
  resultCount: number;
}) {
  return (
    <div className="watch-discovery-filters">
      <div className="watch-filter-group watch-filter-group-mood">
        <span className="watch-filter-group-label">Mood</span>
        <div className="watch-mood-pills" role="group" aria-label="Mood">
          {MOODS.map((option) => (
            <button
              key={option.id}
              data-mood={option.id}
              type="button"
              aria-pressed={mood === option.id}
              onClick={() => onMoodChange(option.id)}
            >
              <span aria-hidden>{option.icon}</span>{option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="watch-length-select">
        <span className="watch-filter-group-label">Length</span>
        <WatchSelect
          ariaLabel="Session length"
          value={sessionLength}
          onChange={(value) => onSessionLengthChange(value as WatchSessionLength)}
          options={LENGTHS}
        />
      </div>
      <p className="watch-discovery-count" aria-live="polite">{resultCount} titles</p>
    </div>
  );
}

export function WatchRowOrder({
  order,
  labels,
  onChange,
}: {
  order: string[];
  labels: Record<string, string>;
  onChange: (value: string[]) => void;
}) {
  return (
    <details className="watch-row-order">
      <summary>Personalize home rows</summary>
      <div>
        <p>Put the shelves you use most closer to the top.</p>
        <ol>
          {order.map((id, index) => (
            <li key={id} data-row-order={id}>
              <span>{labels[id] ?? id}</span>
              <Tooltip
                title="Move shelf up"
                description={`Place ${labels[id] ?? id} closer to the top of your Watch page.`}
                placement="top"
                isDisabled={index === 0}
              >
                <button type="button" aria-label={`Move ${labels[id] ?? id} up`} disabled={index === 0} onClick={() => {
                  const next = [...order];
                  [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                  onChange(next);
                }}>↑</button>
              </Tooltip>
              <Tooltip
                title="Move shelf down"
                description={`Place ${labels[id] ?? id} farther down your Watch page.`}
                placement="top"
                isDisabled={index === order.length - 1}
              >
                <button type="button" aria-label={`Move ${labels[id] ?? id} down`} disabled={index === order.length - 1} onClick={() => {
                  const next = [...order];
                  [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                  onChange(next);
                }}>↓</button>
              </Tooltip>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
