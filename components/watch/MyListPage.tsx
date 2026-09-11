"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers3, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { useMyList } from "@/hooks/useMyList";
import { useSubscription } from "@/hooks/useSubscription";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { useWatchDiscovery, type WatchFeedbackValue } from "@/lib/watch/discovery-state";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import type { WatchItem } from "@/lib/watch/types";
import { dvrItemReferences } from "@/lib/watch/dvr-item-references";
import { homeItemReferences, mergeHomeItems } from "@/lib/watch/home-catalog";
import { MyListShelf, PosterCard } from "./PosterCard";
import { DragScrollRail } from "./DragScrollRail";
import { toggleMyList } from "@/lib/watch/mylist";

type MyListView = "all" | "unwatched" | "progress" | "watched";
type MyListSort = "recent" | "title" | "progress";

function references(item: WatchItem) {
  return [item.id, youtubeIdFromHref(item.href)].filter((reference): reference is string => Boolean(reference));
}

export function MyListPage({ initialItems }: { initialItems: WatchItem[] }) {
  const { ids, loading, signedIn, error, refresh } = useMyList();
  const { map } = useWatchProgress();
  const discovery = useWatchDiscovery();
  const subscription = useSubscription();
  const [view, setView] = useState<MyListView>("all");
  const [sort, setSort] = useState<MyListSort>("recent");
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [newQueueName, setNewQueueName] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [search, setSearch] = useState("");
  const queueTemplatesAllowed = subscription.hasFeature("queue.templates");
  const [resolved, setResolved] = useState<{ items: WatchItem[]; checked: string[]; error: boolean }>({ items: [], checked: [], error: false });
  const items = useMemo(() => mergeHomeItems(initialItems, resolved.items), [initialItems, resolved.items]);
  const known = new Set([...items.flatMap(homeItemReferences), ...resolved.checked]);
  const wanted = dvrItemReferences(ids, queueTemplatesAllowed ? discovery.state.queues : []).filter((ref) => !known.has(ref));
  const lookupKey = wanted.slice(0, 100).join("\n");
  const metadataLoading = Boolean(lookupKey) && !resolved.error;
  useEffect(() => {
    setResolved((previous) => previous.checked.length ? { ...previous, checked: [] } : previous);
  }, [initialItems]);

  // Local saves and cross-device list updates may arrive after the server
  // render. Resolve every missing reference in batches instead of truncating
  // the library or classifying an item as unavailable before checking it.
  useEffect(() => {
    if (loading || !discovery.ready || !lookupKey || resolved.error) return;
    const refs = lookupKey.split("\n");
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    fetch("/api/watch/items", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ refs }), signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("dvr_items_unavailable");
      const data = await response.json() as { items?: WatchItem[] };
      if (!Array.isArray(data.items)) throw new Error("invalid_dvr_items");
      if (!cancelled) setResolved((previous) => ({ items: mergeHomeItems(previous.items, data.items!),
        checked: [...previous.checked, ...refs], error: false }));
    }).catch(() => {
      if (!cancelled) setResolved((previous) => ({ ...previous, error: true }));
    }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [discovery.ready, loading, lookupKey, resolved.error]);

  const savedItems = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is WatchItem => Boolean(item));
  }, [items, ids]);
  const unavailableIds = useMemo(() => {
    const available = new Set(items.map((item) => item.id));
    const checked = new Set(resolved.checked);
    return ids.filter((id) => !available.has(id) && checked.has(id));
  }, [items, ids, resolved.checked]);

  const marks = useMemo(() => {
    const output = new Map<string, { completed: boolean; progress: number }>();
    for (const item of savedItems) {
      const itemMarks = references(item).flatMap((reference) => {
        const mark = map[reference];
        return mark ? [mark] : [];
      });
      output.set(item.id, {
        completed: itemMarks.some((mark) => mark.completed),
        progress: Math.max(0, ...itemMarks.map((mark) => mark.progress)),
      });
    }
    return output;
  }, [map, savedItems]);

  const displayedItems = useMemo(() => {
    const filtered = savedItems.filter((item) => {
      if (search.trim() && !`${item.title} ${item.memberLabel} ${item.platform}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
      const mark = marks.get(item.id) ?? { completed: false, progress: 0 };
      if (view === "unwatched") return !mark.completed && mark.progress <= 0;
      if (view === "progress") return !mark.completed && mark.progress > 0;
      if (view === "watched") return mark.completed;
      return true;
    });
    if (sort === "title") filtered.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "progress") {
      filtered.sort((a, b) => (marks.get(b.id)?.progress ?? 0) - (marks.get(a.id)?.progress ?? 0));
    }
    return filtered;
  }, [marks, savedItems, search, sort, view]);

  const handleFeedback = (item: WatchItem, value: WatchFeedbackValue | null) => {
    discovery.setFeedback(item.id, value);
  };

  const activeQueue = discovery.state.queues.find((queue) => queue.id === activeQueueId)
    ?? discovery.state.queues[0]
    ?? null;
  const queueItems = useMemo(() => {
    if (!activeQueue) return [];
    const byId = new Map(items.map((item) => [item.id, item]));
    return activeQueue.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is WatchItem => Boolean(item));
  }, [activeQueue, items]);

  useEffect(() => {
    if (!queueTemplatesAllowed || !discovery.ready) return;
    if (!activeQueueId || !discovery.state.queues.some((queue) => queue.id === activeQueueId)) {
      setActiveQueueId(discovery.state.queues[0]?.id ?? null);
    }
  }, [activeQueueId, discovery.ready, discovery.state.queues, queueTemplatesAllowed]);

  useEffect(() => {
    setRenameDraft(activeQueue?.name ?? "");
  }, [activeQueue?.id, activeQueue?.name]);

  function createQueue() {
    if (!queueTemplatesAllowed) return;
    const id = discovery.createQueue(newQueueName);
    setActiveQueueId(id);
    setNewQueueName("");
  }

  function commitRename() {
    if (!activeQueue || !renameDraft.trim() || renameDraft.trim() === activeQueue.name) return;
    discovery.renameQueue(activeQueue.id, renameDraft);
  }

  function toggleActiveQueueItem(item: WatchItem) {
    if (!activeQueue || !queueTemplatesAllowed) return;
    discovery.toggleQueueItem(activeQueue.id, item.id);
  }

  return (
    <div className="watch-my-list-page">
      {resolved.error ? <div role="alert" className="mx-auto mb-5 flex max-w-[1520px] items-center justify-between gap-3 rounded-lg border border-white/15 px-4 py-3 text-sm text-white/75">
        <p>Some saved titles could not load.</p>
        <button type="button" onClick={() => setResolved((previous) => ({ ...previous, error: false }))} className="rounded-md border border-white/20 px-3 py-2">Retry loading</button>
      </div> : null}
      {error ? <div role="alert" className="mx-auto mb-5 flex max-w-[1520px] flex-wrap items-center justify-between gap-3 rounded-lg border border-white/15 px-4 py-3 text-sm text-white/75">
        <p>{error}</p>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-md border border-white/20 px-3 py-2 text-white disabled:opacity-50">Retry sync</button>
      </div> : null}
      {ids.length ? <div className="mx-auto mb-4 flex max-w-[1520px] flex-wrap items-center justify-between gap-3 px-5 md:px-10">
        <label className="flex min-w-0 items-center gap-3 text-sm text-white/60">
          <span>Search DVR</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title or creator" className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-transparent px-3 text-white outline-none focus:border-white/50" />
        </label>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="min-h-11 rounded-lg border border-white/15 px-3 text-sm text-white/70 disabled:opacity-50">{loading ? "Syncing…" : "Refresh DVR"}</button>
      </div> : null}
      <MyListShelf
        items={displayedItems}
        totalCount={ids.length}
        signedIn={signedIn}
        loading={loading || metadataLoading}
        view={view}
        onViewChange={(next) => { setView(next); if (next === "all") setSearch(""); }}
        sort={sort}
        onSortChange={setSort}
        feedback={discovery.state.feedback}
        onFeedback={handleFeedback}
        activeQueueName={queueTemplatesAllowed ? activeQueue?.name : undefined}
        activeQueueItemIds={queueTemplatesAllowed ? activeQueue?.itemIds : undefined}
        onToggleQueue={queueTemplatesAllowed && activeQueue ? toggleActiveQueueItem : undefined}
        page
      />

      {unavailableIds.length ? <section className="mx-auto mt-8 max-w-[1520px] border-t border-white/10 px-5 pt-6 md:px-10" aria-labelledby="dvr-unavailable-title">
        <h2 id="dvr-unavailable-title" className="text-base font-semibold">Unavailable titles <span className="text-white/45">{unavailableIds.length}</span></h2>
        <p className="mt-2 text-sm text-white/55">These saved titles are no longer in the current catalog. They stay saved unless you remove them.</p>
        <ul className="mt-4 divide-y divide-white/10">
          {unavailableIds.map((id, index) => <li key={id} className="flex min-w-0 items-center justify-between gap-4 py-3">
            <span className="min-w-0 truncate text-sm text-white/60">Unavailable title {index + 1}</span>
            <button type="button" onClick={() => toggleMyList(id)} className="shrink-0 rounded-md border border-white/15 px-3 py-2 text-sm text-white/70" aria-label={`Remove unavailable title ${index + 1}`}>Remove</button>
          </li>)}
        </ul>
      </section> : null}

      {!subscription.loading && !queueTemplatesAllowed ? (
        <section className="watch-premium-queue-callout" aria-labelledby="custom-lists-title">
          <span className="watch-premium-queue-icon" aria-hidden><LockKeyhole /></span>
          <div>
            <h2 id="custom-lists-title">Custom lists</h2>
            <p>
              Organize saved titles into lists with {subscription.requiredPlanName("queue.templates")}.
            </p>
          </div>
          <Link href={subscription.featureHref("queue.templates") as never}>
            <LockKeyhole aria-hidden />
            Unlock custom lists
          </Link>
        </section>
      ) : null}

      {queueTemplatesAllowed ? (
        <section className="watch-named-queues" aria-labelledby="named-queues-title">
          <div className="watch-named-queues-head">
            <div>
              <h2 id="named-queues-title">Custom lists</h2>
              <p>Group titles by creator, series, or anything you want to watch together.</p>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); createQueue(); }}>
              <input
                value={newQueueName}
                onChange={(event) => setNewQueueName(event.target.value)}
                placeholder="New list name"
                maxLength={50}
                aria-label="New custom list name"
              />
              <button type="submit" disabled={!newQueueName.trim()}>
                <Plus aria-hidden />
                Create
              </button>
            </form>
          </div>

          {discovery.state.queues.length ? (
            <>
              <div className="watch-named-queue-tabs" role="tablist" aria-label="Custom lists">
                {discovery.state.queues.map((queue) => (
                  <button
                    key={queue.id}
                    type="button"
                    role="tab"
                    aria-selected={activeQueue?.id === queue.id}
                    onClick={() => setActiveQueueId(queue.id)}
                  >
                    {queue.name}
                    <span>{queue.itemIds.length}</span>
                  </button>
                ))}
              </div>

              {activeQueue ? (
                <div className="watch-named-queue-active" role="tabpanel">
                  <div className="watch-named-queue-tools">
                    <Layers3 aria-hidden />
                    <input
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                          event.currentTarget.blur();
                        }
                      }}
                      maxLength={50}
                      aria-label={`Rename ${activeQueue.name}`}
                    />
                    <span>{activeQueue.itemIds.length} title{activeQueue.itemIds.length === 1 ? "" : "s"}</span>
                    <Tooltip
                      title="Delete custom list"
                      description="Delete this list. Titles stay in your DVR."
                      placement="top"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          discovery.deleteQueue(activeQueue.id);
                          setActiveQueueId(null);
                        }}
                        aria-label={`Delete ${activeQueue.name}`}
                      >
                        <Trash2 aria-hidden />
                      </button>
                    </Tooltip>
                  </div>

                  {queueItems.length ? (
                    <DragScrollRail className="watch-shelf watch-named-queue-shelf" tabIndex={0} aria-label={`${activeQueue.name} titles`}>
                      {queueItems.map((item) => (
                        <PosterCard
                          key={item.id}
                          item={item}
                          context={queueItems}
                          feedback={discovery.state.feedback[item.id]?.value}
                          onFeedback={handleFeedback}
                          activeQueueName={activeQueue.name}
                          inActiveQueue
                          onToggleQueue={toggleActiveQueueItem}
                        />
                      ))}
                    </DragScrollRail>
                  ) : (
                    <div className="watch-named-queue-empty">
                      <Plus aria-hidden />
                      <div>
                        <h3>{metadataLoading ? "Loading this list" : activeQueue.itemIds.length ? "No available titles" : "No titles in this list"}</h3>
                        <p>{activeQueue.itemIds.length
                          ? metadataLoading ? "Retrieving your saved titles." : resolved.error ? "Retry loading your saved titles above." : "These titles are currently unavailable. They remain in your list."
                          : <>Use the more-actions menu on a DVR card above, then choose “Add to {activeQueue.name}.”</>}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="watch-named-queue-empty">
              <Layers3 aria-hidden />
              <div>
                <h3>Create your first custom list</h3>
                <p>Choose a name, then add titles from your DVR.</p>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
