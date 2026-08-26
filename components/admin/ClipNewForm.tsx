"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Badge } from "@/components/base/badges/badges";

type MemberLite = { slug: string; stageName: string; accent: string };

/**
 * Direct-add clip form. Detects platform + ID from the URL, posts to
 * `POST /api/admin/clips` which inserts into the clips table and
 * mirrors the picked member slugs into clip_member_tags.
 *
 * UUI controls throughout: Input / TextArea / Button / Badge.
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
      <div>
        <Input
          isRequired
          type="url"
          label="Source URL"
          hint="Paste a Twitch clip / YouTube short / TikTok / Instagram reel URL."
          size="md"
          value={url}
          onChange={(v) => setUrl(v)}
          placeholder="https://clips.twitch.tv/..."
        />
        {url && detection.source ? (
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-tertiary">
            Detected:
            <Badge type="pill-color" color="brand" size="sm">
              {detection.source}
            </Badge>
            <span className="text-quaternary">· id</span>
            <code className="font-mono text-secondary">{detection.externalId}</code>
          </p>
        ) : url ? (
          <p className="mt-2 text-xs font-medium text-error-primary">
            Couldn&apos;t detect platform from URL — supported: clips.twitch.tv,
            youtube.com/shorts, youtu.be, tiktok.com, instagram.com/reel.
          </p>
        ) : null}
      </div>

      <Input
        isRequired
        label="Title"
        hint="Shown on the clip card."
        size="md"
        value={title}
        onChange={(v) => setTitle(v)}
        placeholder="Ron · 1v3 clutch · tournament finals"
      />

      <TextArea
        label="AI description"
        hint="One sentence describing the moment — used for AI search."
        rows={3}
        value={aiDesc}
        onChange={(v) => setAiDesc(v)}
        placeholder="Auto-filled by Claude Vision in Phase 4 — type for now."
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-secondary">Tagged members</span>
        <span className="-mt-1 text-xs text-tertiary">Pick everyone who appears in the clip.</span>
        <ul className="flex flex-wrap items-center gap-2">
          {members.map((m) => {
            const active = picked.includes(m.slug);
            return (
              <li key={m.slug}>
                <button
                  type="button"
                  onClick={() => togglePick(m.slug)}
                  aria-pressed={active}
                  className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                    active
                      ? "text-primary"
                      : "bg-secondary text-tertiary ring-secondary hover:text-primary"
                  }`}
                  style={
                    active
                      ? {
                          ["--tw-ring-color" as string]: m.accent,
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
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-secondary pt-5">
        <Button
          type="submit"
          size="md"
          color="primary"
          isDisabled={!detection.source || !title.trim() || saving}
          isLoading={saving}
          iconLeading={saved ? Check : Plus}
        >
          {saved ? "Saved" : "Save clip"}
        </Button>
        <Button href="/admin/clips" size="md" color="secondary">
          All clips
        </Button>
        <Button href="/admin" size="md" color="link-gray">
          Back to admin
        </Button>
        {error ? (
          <span className="ml-auto text-xs font-medium text-error-primary">{error}</span>
        ) : null}
      </div>
    </form>
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
