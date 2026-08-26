"use client";

import { Heart, MessageCircle, Repeat2, UserPlus, X as Close } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { xWebIntentUrl } from "@/lib/x/intents";
import type { XActionAvailability } from "@/lib/x/types";
import styles from "./XPostEmbed.module.css";

type CapabilityResponse = { availability: XActionAvailability; csrfToken: string | null };

const LABEL: Record<"like" | "repost" | "reply" | "follow", string> = {
  like: "Like",
  repost: "Repost",
  reply: "Reply",
  follow: "Follow",
};

export function XActionControls({
  postId,
  authorHandle,
  postUrl,
}: {
  postId: string;
  authorHandle?: string;
  postUrl: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [capability, setCapability] = useState<CapabilityResponse | null>(null);
  const [pending, setPending] = useState<"like" | "repost" | "reply" | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const intents = useMemo(() => ({
    like: xWebIntentUrl({ action: "like", postId }),
    repost: xWebIntentUrl({ action: "repost", postId }),
    reply: xWebIntentUrl({ action: "reply", postId }),
    follow: authorHandle ? xWebIntentUrl({ action: "follow", handle: authorHandle }) : null,
  }), [authorHandle, postId]);

  useEffect(() => {
    if (!expanded || capability) return;
    fetch("/api/x/capabilities", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((value: CapabilityResponse) => setCapability(value))
      .catch(() => setCapability(null));
  }, [capability, expanded]);

  async function confirmNative() {
    if (!pending || !capability?.availability.enabled || !capability.csrfToken) return;
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/x/actions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": capability.csrfToken,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          action: pending,
          postId,
          ...(pending === "reply" ? { text: reply.trim() } : {}),
          confirmation: true,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      setMessage(result.ok ? `${LABEL[pending]} sent through your X account.` : result.error ?? "X did not confirm that action.");
      if (result.ok) {
        setPending(null);
        setReply("");
      }
    } catch {
      setMessage("X actions are temporarily unavailable. Check the post before retrying.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.actions}>
      <button type="button" className={styles.actionsToggle} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        Interact
      </button>
      {expanded ? (
        <div className={styles.actionPopover}>
          <div className={styles.intentRow} aria-label="Open official X actions">
            {(["reply", "repost", "like", "follow"] as const).map((action) => {
              const href = intents[action];
              if (!href) return null;
              const Icon = action === "reply" ? MessageCircle : action === "repost" ? Repeat2 : action === "follow" ? UserPlus : Heart;
              return (
                <a key={action} href={href} target="_blank" rel="noopener noreferrer" title={`${LABEL[action]} on X`}>
                  <Icon aria-hidden="true" /> <span>{LABEL[action]}</span>
                </a>
              );
            })}
          </div>
          {authorHandle ? <span className={styles.intentHint}>Official X Web Intents · @{authorHandle}</span> : null}
          {capability?.availability.enabled ? (
            <div className={styles.nativeRow}>
              <span>One-tap (confirmation required)</span>
              <div>
                {(["like", "repost", "reply"] as const).map((action) => (
                  <button key={action} type="button" onClick={() => { setPending(action); setMessage(null); }}>
                    {LABEL[action]}
                  </button>
                ))}
              </div>
            </div>
          ) : capability?.availability.reason === "reconnect" ? (
            <a className={styles.stepUp} href={capability.availability.connectHref}>Approve one-tap X actions</a>
          ) : null}

          {pending ? (
            <div className={styles.confirmation} role="dialog" aria-label={`Confirm ${LABEL[pending]}`}>
              <button type="button" className={styles.confirmClose} onClick={() => setPending(null)} aria-label="Cancel"><Close /></button>
              <strong>Confirm {LABEL[pending].toLowerCase()}</strong>
              <p>This will act publicly as your connected X account on <a href={postUrl} target="_blank" rel="noopener noreferrer">this exact post</a>.</p>
              {pending === "reply" ? (
                <textarea value={reply} onChange={(event) => setReply(event.target.value.slice(0, 280))} maxLength={280} placeholder="Write your reply" />
              ) : null}
              <button type="button" className={styles.confirmButton} disabled={sending || (pending === "reply" && !reply.trim())} onClick={() => void confirmNative()}>
                {sending ? "Sending…" : `Confirm ${LABEL[pending]}`}
              </button>
            </div>
          ) : null}
          {message ? <p className={styles.actionMessage} role="status">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
