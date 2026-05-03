"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";

type MemberLite = { slug: string; stageName: string; accent: string };

/**
 * Direct-add clip form. Detects platform + ID from the URL, posts to
 * `POST /api/admin/clips` which inserts into the clips table and
 * mirrors the picked member slugs into clip_member_tags.
 */
export function ClipNewForm({ members }: { members: MemberLite[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [aiDesc, setAiDesc] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detection = useMemo(() => detectPlatform(url), [url]);

  const togglePick = (slug: string) => {
    setPicked((prev) =>
      prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detection.source || !detection.externalId || !title.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: detection.source,
          externalId: detection.externalId,
          url,
          title: title.trim(),
          memberSlugs: picked,
          description: aiDesc.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j: { error?: string; detail?: string } = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      setUrl("");
      setTitle("");
      setAiDesc("");
      setPicked([]);
      window.setTimeout(() => {
        setSaved(false);
        router.push("/admin/clips");
        router.refresh();
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* URL */}
      <Field label="Source URL" hint="Paste a Twitch clip / YouTube short / TikTok / Instagram reel URL.">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="https://clips.twitch.tv/..."
          className="w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2.5 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--core)] focus:outline-none"
        />
        {url && detection.source ? (
          <p className="mt-2 inline-flex items-center gap-2 text-[12px] text-[color:var(--ink-dim)]">
            Detected: <strong className="text-[color:var(--ink)]">{detection.source}</strong>
            <span className="text-[color:var(--ink-faint)]">·</span> id{" "}
            <code className="font-mono">{detection.externalId}</code>
          </p>
        ) : url ? (
          <p className="mt-2 text-[12px] text-[color:var(--core)]">
            Couldn&apos;t detect platform from URL — supported: clips.twitch.tv,
            youtube.com/shorts, youtu.be, tiktok.com, instagram.com/reel.
          </p>
        ) : null}
      </Field>

      <Field label="Title" hint="Shown on the clip card.">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Ron · 1v3 clutch · tournament finals"
          className="w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2.5 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--core)] focus:outline-none"
        />
      </Field>

      <Field
        label="AI description"
        hint="One sentence describing the moment — used for AI search."
      >
        <textarea
          value={aiDesc}
          onChange={(e) => setAiDesc(e.target.value)}
          rows={3}
          placeholder="Auto-filled by Claude Vision in Phase 4 — type for now."
          className="w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2.5 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--core)] focus:outline-none"
        />
      </Field>

      <Field label="Tagged members" hint="Pick everyone who appears in the clip.">
        <ul className="flex flex-wrap items-center gap-2">
          {members.map((m) => {
            const active = picked.includes(m.slug);
            return (
              <li key={m.slug}>
                <button
                  type="button"
                  onClick={() => togglePick(m.slug)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "text-[color:var(--ink)]"
                      : "border-[color:var(--rule)] text-[color:var(--ink-dim)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]"
                  }`}
                  style={
                    active
                      ? {
                          borderColor: m.accent,
                          background: `color-mix(in oklab, ${m.accent} 16%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.accent }} />
                  {m.stageName}
                </button>
              </li>
            );
          })}
        </ul>
      </Field>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[color:var(--rule)] pt-5">
        <button
          type="submit"
          disabled={!detection.source || !title.trim() || saving}
          className="btn btn-primary disabled:opacity-50"
        >
          {saved ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : saving ? (
            <>Saving…</>
          ) : (
            <>
              <Plus size={14} /> Save clip
            </>
          )}
        </button>
        <Link href="/admin/clips" className="btn btn-secondary">
          All clips
        </Link>
        <Link href="/admin" className="text-[12px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]">
          Back to admin
        </Link>
        {error ? (
          <span className="ml-auto text-[12px] text-[color:var(--core)]">{error}</span>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-[color:var(--ink)]">{label}</span>
      {hint ? <span className="-mt-1 text-[11px] text-[color:var(--ink-dim)]">{hint}</span> : null}
      {children}
    </label>
  );
}

function detectPlatform(url: string): {
  source: "twitch" | "youtube" | "tiktok" | "instagram" | null;
  externalId: string | null;
} {
  if (!url) return { source: null, externalId: null };
  try {
    const u = new URL(url);
    if (u.hostname.includes("clips.twitch.tv")) {
      return { source: "twitch", externalId: u.pathname.slice(1) || null };
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.pathname.startsWith("/shorts/")
        ? u.pathname.split("/")[2]
        : u.searchParams.get("v");
      return { source: "youtube", externalId: id ?? null };
    }
    if (u.hostname.includes("youtu.be")) {
      return { source: "youtube", externalId: u.pathname.slice(1) || null };
    }
    if (u.hostname.includes("tiktok.com")) {
      const m = u.pathname.match(/\/video\/(\d+)/);
      return { source: "tiktok", externalId: m?.[1] ?? null };
    }
    if (u.hostname.includes("instagram.com")) {
      const m = u.pathname.match(/\/(?:reel|p)\/([^/]+)/);
      return { source: "instagram", externalId: m?.[1] ?? null };
    }
  } catch {
    /* ignore */
  }
  return { source: null, externalId: null };
}
