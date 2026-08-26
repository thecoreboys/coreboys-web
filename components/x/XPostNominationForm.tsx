"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { X_COMMUNITY_KEYS, type XCommunityKey, type XNominationPublic } from "@/lib/x/types";
import styles from "./XCommunityShelf.module.css";

const LABEL: Record<XCommunityKey, string> = {
  core: "CORE",
  flock: "Flock",
  stable: "Stable",
  thugs: "Thugs",
  m3: "M3",
  nms: "NMS",
  slg: "SLG",
};

export function XPostNominationForm({
  defaultCommunityKey = "core",
  onSubmitted,
  compact = false,
}: {
  defaultCommunityKey?: XCommunityKey;
  onSubmitted?: (nomination: XNominationPublic) => void;
  compact?: boolean;
}) {
  const [communityKey, setCommunityKey] = useState<XCommunityKey>(defaultCommunityKey);
  const [postUrl, setPostUrl] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; signIn?: boolean } | null>(null);

  useEffect(() => setCommunityKey(defaultCommunityKey), [defaultCommunityKey]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!consent || !postUrl.trim()) return;
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/x/nominations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postUrl: postUrl.trim(), communityKey, note: note.trim() || undefined, consent: true }),
      });
      const body = (await response.json()) as { nomination?: XNominationPublic; error?: string; created?: boolean };
      if (!response.ok) {
        setMessage({ ok: false, text: body.error ?? "Could not submit that post.", signIn: response.status === 401 });
        return;
      }
      if (body.nomination) onSubmitted?.(body.nomination);
      setPostUrl("");
      setNote("");
      setConsent(false);
      setMessage({ ok: true, text: body.created === false ? "That post is already in your nominations." : "Sent to the community moderation queue." });
    } catch {
      setMessage({ ok: false, text: "Nominations are temporarily unavailable." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={`${styles.nominationForm} ${compact ? styles.compactForm : ""}`} onSubmit={submit}>
      <div className={styles.formHeading}>
        <div><strong>Nominate an X post</strong><p>Submissions appear only after a CORE moderator approves them.</p></div>
        <Send aria-hidden="true" />
      </div>
      <div className={styles.formGrid}>
        <label>
          <span>Direct post URL</span>
          <input type="url" value={postUrl} onChange={(event) => setPostUrl(event.target.value)} placeholder="https://x.com/name/status/…" maxLength={300} required />
        </label>
        <label>
          <span>Community</span>
          <select value={communityKey} onChange={(event) => setCommunityKey(event.target.value as XCommunityKey)}>
            {X_COMMUNITY_KEYS.map((key) => <option key={key} value={key}>{LABEL[key]}</option>)}
          </select>
        </label>
      </div>
      {!compact ? (
        <label>
          <span>Why should it be featured? <small>Optional</small></span>
          <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 280))} maxLength={280} placeholder="Add context for the moderators" />
        </label>
      ) : null}
      <label className={styles.consent}>
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
        <span>I confirm this is a public X post and agree to submit its link for moderation.</span>
      </label>
      <div className={styles.formFooter}>
        <button type="submit" disabled={sending || !consent || !postUrl.trim()}>{sending ? "Sending…" : "Submit post"}</button>
        {message ? <p data-ok={message.ok} role="status">{message.text} {message.signIn ? <Link href="/login?next=/fanzone">Sign in</Link> : null}</p> : null}
      </div>
    </form>
  );
}
