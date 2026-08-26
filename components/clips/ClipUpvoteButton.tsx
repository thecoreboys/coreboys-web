"use client";

import { useState } from "react";
import { ArrowUp } from "@untitledui/icons";
import { useAuth } from "@/components/providers/AuthProvider";
import { openAuthModal } from "@/lib/auth/modal";
import { cx } from "@/utils/cx";

/**
 * Optimistic upvote toggle for a single clip. POST /api/community/clips/[id]/vote
 * toggles the vote (insert -> remove). Logged-out fans get a sign-in nudge
 * instead of an action. The count + filled state animate immediately and roll
 * back if the request fails.
 */
export function ClipUpvoteButton({
  clipId,
  initialVoted,
  initialCount,
}: {
  clipId: string;
  initialVoted: boolean;
  initialCount: number;
}) {
  const { user } = useAuth();
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [nudge, setNudge] = useState(false);

  async function toggle() {
    if (!user) {
      setNudge(true);
      window.setTimeout(() => setNudge(false), 2600);
      return;
    }
    if (pending) return;

    // Optimistic flip.
    const prevVoted = voted;
    const prevCount = count;
    const nextVoted = !voted;
    setVoted(nextVoted);
    setCount((c) => c + (nextVoted ? 1 : -1));
    setPending(true);

    try {
      const res = await fetch(`/api/community/clips/${clipId}/vote`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { voted: boolean; count: number };
      setVoted(data.voted);
      setCount(data.count);
    } catch {
      // Roll back on failure.
      setVoted(prevVoted);
      setCount(prevCount);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={voted}
        aria-label={voted ? "Remove upvote" : "Upvote this clip"}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums shadow-xs-skeuomorphic transition-all duration-150 cursor-pointer motion-safe:hover:-translate-y-0.5",
          voted
            ? "border-transparent bg-brand-solid text-white"
            : "border-secondary bg-primary text-secondary hover:text-primary",
          pending && "opacity-80",
        )}
      >
        <ArrowUp
          className={cx(
            "size-4 transition-transform duration-150",
            voted && "motion-safe:scale-110",
          )}
        />
        {count}
      </button>
      {nudge ? (
        <button
          type="button"
          onClick={() => openAuthModal({ next: `${window.location.pathname}${window.location.search}` })}
          className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-secondary bg-primary px-3 py-1.5 text-xs font-semibold text-primary shadow-lg cursor-pointer"
        >
          Sign in to upvote →
        </button>
      ) : null}
    </div>
  );
}
