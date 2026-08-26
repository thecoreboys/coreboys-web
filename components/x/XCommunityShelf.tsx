"use client";

import { ExternalLink, LockKeyhole, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { XCommunityDirectoryEntry, XCommunityKey, XNominationPublic } from "@/lib/x/types";
import { XPostEmbed } from "./XPostEmbed";
import styles from "./XCommunityShelf.module.css";

export function XCommunityShelf({
  selectedKey = null,
  compact = false,
  className,
}: {
  selectedKey?: XCommunityKey | null;
  compact?: boolean;
  className?: string;
}) {
  const [communities, setCommunities] = useState<XCommunityDirectoryEntry[]>([]);
  const [nominations, setNominations] = useState<XNominationPublic[]>([]);
  const [activeKey, setActiveKey] = useState<XCommunityKey>(selectedKey ?? "core");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedKey) setActiveKey(selectedKey);
  }, [selectedKey]);

  useEffect(() => {
    const controller = new AbortController();
    const communityQuery = selectedKey ? `?key=${encodeURIComponent(selectedKey)}` : "";
    const nominationQuery = selectedKey
      ? `?community=${encodeURIComponent(selectedKey)}`
      : "";
    setLoading(true);
    Promise.all([
      fetch(`/api/x/communities${communityQuery}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch(`/api/x/nominations${nominationQuery}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : { nominations: [] }),
    ]).then(([directory, approved]: [{ communities?: XCommunityDirectoryEntry[] }, { nominations?: XNominationPublic[] }]) => {
      setCommunities(directory.communities ?? []);
      setNominations(approved.nominations ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedKey]);

  const shownCommunities = selectedKey
    ? communities.filter((entry) => entry.key === selectedKey)
    : communities;
  const active = communities.find((entry) => entry.key === activeKey) ?? shownCommunities[0] ?? null;
  const posts = useMemo(
    () => nominations.filter((nomination) => nomination.communityKey === active?.key),
    [active?.key, nominations],
  );

  return (
    <section className={[styles.shelf, compact ? styles.compact : "", className ?? ""].filter(Boolean).join(" ")}>
      {!selectedKey && shownCommunities.length ? (
        <div className={styles.communityTabs} role="tablist" aria-label="X Communities">
          {shownCommunities.map((entry) => (
            <button key={entry.key} type="button" role="tab" aria-selected={active?.key === entry.key} onClick={() => setActiveKey(entry.key)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={entry.logo} alt="" />
              <span>{entry.name}</span>
              {!entry.configured ? <LockKeyhole aria-label="Community link not configured" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {loading && !active ? <div className={styles.empty}>Loading X communities…</div> : null}
      {active ? (
        <div className={styles.activeCommunity}>
          <header className={styles.communityHeader}>
            <div className={styles.communityIdentity}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={active.logo} alt="" />
              <div><span>{active.ownerLabel} community</span><h3>{active.name}</h3><p>{active.description ?? `Public X posts selected for ${active.name}.`}</p></div>
            </div>
            <div className={styles.communityActions}>
              {active.memberCount != null ? <span><Users aria-hidden="true" /> {active.memberCount.toLocaleString()}</span> : null}
              {active.communityUrl ? (
                <a href={active.communityUrl} target="_blank" rel="noopener noreferrer">Open Community <ExternalLink aria-hidden="true" /></a>
              ) : active.ownerUrl ? (
                <a href={active.ownerUrl} target="_blank" rel="noopener noreferrer">Visit {active.ownerHandle ?? "X profile"} <ExternalLink aria-hidden="true" /></a>
              ) : null}
            </div>
          </header>

          {!active.configured ? (
            <div className={styles.notice}>
              <LockKeyhole aria-hidden="true" />
              <div><strong>Community link not configured yet</strong><p>CORE will show the real X Community here after its exact ID is added. We never substitute a profile or invent a feed.</p></div>
            </div>
          ) : null}

          {posts.length ? (
            <div className={styles.posts} role="list" aria-label={`Approved posts for ${active.name}`}>
              {posts.map((post) => (
                <div key={post.id} role="listitem" className={post.featured ? styles.featuredPost : undefined}>
                  <XPostEmbed
                    postId={post.postId}
                    postUrl={post.postUrl}
                    fallbackText={post.featured ? "Featured by the CORE moderation team." : "Approved by the CORE moderation team."}
                    featured={post.featured}
                    showActions={!compact}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <strong>No approved posts yet</strong>
              <p>Community timelines are not available through X’s documented Communities API. Approved fan nominations will appear here as privacy-gated official embeds.</p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
