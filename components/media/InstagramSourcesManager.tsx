"use client";

import { useEffect, useState } from "react";
import { Camera01, RefreshCw01, InfoCircle } from "@untitledui/icons";
import { Toggle } from "@/components/base/toggle/toggle";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

type Source = {
  id: number;
  ownerLabel: string;
  handle: string;
  kind: string;
  enabled: boolean;
  createdAt: string;
};

/**
 * Admin manager for Instagram sources. Lists every seeded source with a
 * UUI Toggle per row that flips `enabled` via PATCH /api/admin/instagram.
 * Optimistic update with rollback on failure.
 */
export function InstagramSourcesManager() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/instagram", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { sources: Source[] };
      setSources(json.sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onToggle(src: Source, next: boolean) {
    setPending((p) => new Set(p).add(src.id));
    // Optimistic.
    setSources((prev) =>
      prev.map((s) => (s.id === src.id ? { ...s, enabled: next } : s)),
    );
    try {
      const res = await fetch("/api/admin/instagram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: src.id, enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Roll back.
      setSources((prev) =>
        prev.map((s) => (s.id === src.id ? { ...s, enabled: !next } : s)),
      );
      alert(`Couldn't update @${src.handle}: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(src.id);
        return n;
      });
    }
  }

  const enabledCount = sources.filter((s) => s.enabled).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge type="pill-color" color="brand" size="lg">
          {enabledCount} of {sources.length} showing
        </Badge>
        <Button
          size="md"
          color="secondary"
          iconLeading={RefreshCw01}
          onClick={load}
          className="ml-auto"
        >
          Refresh
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm text-tertiary ring-1 ring-inset ring-secondary">
        <InfoCircle className="mt-0.5 size-4 shrink-0 text-fg-quaternary" />
        <p>
          Toggles control which handles appear in the &ldquo;From our
          Instagram&rdquo; row on the public Photos page. Live pulls require the
          server <code className="font-mono">INSTAGRAM_TOKEN</code> to be set;
          until then the row shows a connect prompt.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl bg-error-primary p-3 text-sm font-medium text-error-primary ring-1 ring-inset ring-error_subtle">
          Couldn&apos;t load sources — {error}
        </div>
      ) : null}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-secondary ring-1 ring-inset ring-secondary" />
      ) : sources.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl bg-secondary p-10 text-center shadow-xs-skeuomorphic ring-1 ring-inset ring-secondary">
          <FeaturedIcon icon={Camera01} size="xl" color="gray" theme="modern" />
          <p className="mt-4 text-md font-semibold text-primary">No sources yet</p>
          <p className="mt-1 text-sm text-tertiary">
            Sources seed from member &amp; group Instagram handles on first DB
            connection. Check your <code className="font-mono">DATABASE_URL</code>.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-4 rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary shadow-xs"
            >
              <FeaturedIcon icon={Camera01} size="md" color="brand" theme="modern" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-md font-semibold text-primary">
                    {s.ownerLabel || `@${s.handle}`}
                  </p>
                  <Badge type="pill-color" color={s.kind === "group" ? "brand" : "gray"} size="sm">
                    {s.kind || "source"}
                  </Badge>
                </div>
                <a
                  href={`https://instagram.com/${s.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-tertiary transition-colors hover:text-brand-secondary"
                >
                  @{s.handle}
                </a>
              </div>
              <Toggle
                size="md"
                aria-label={`Show ${s.ownerLabel || s.handle} on the Photos page`}
                isSelected={s.enabled}
                isDisabled={pending.has(s.id)}
                onChange={(next) => onToggle(s, next)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
