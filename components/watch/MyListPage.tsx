"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers3, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { useMyList } from "@/hooks/useMyList";
import { useSubscription } from "@/hooks/useSubscription";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { useWatchDiscovery, type WatchFeedbackValue } from "@/lib/watch/discovery-state";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import type { WatchCatalog, WatchItem } from "@/lib/watch/types";
import { MyListShelf, PosterCard } from "./PosterCard";
import { DragScrollRail } from "./DragScrollRail";

type MyListView = "all" | "unwatched" | "progress" | "watched";
type MyListSort = "recent" | "title" | "progress";

function references(item: WatchItem) {
  return [item.id, youtubeIdFromHref(item.href)].filter((reference): reference is string => Boolean(reference));
}

export function MyListPage({ catalog }: { catalog: WatchCatalog }) {
  const { ids, loading, signedIn } = useMyList();
  const { map } = useWatchProgress();
  const discovery = useWatchDiscovery();
  const subscription = useSubscription();
  const [view, setView] = useState<MyListView>("all");
  const [sort, setSort] = useState<MyListSort>("recent");
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [newQueueName, setNewQueueName] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const queueTemplatesAllowed = subscription.hasFeature("queue.templates");

  const savedItems = useMemo(() => {
    const byId = new Map(catalog.all.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is WatchItem => Boolean(item));
  }, [catalog.all, ids]);

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
  }, [marks, savedItems, sort, view]);

  const handleFeedback = (item: WatchItem, value: WatchFeedbackValue | null) => {
    discovery.setFeedback(item.id, value);
  };

  const activeQueue = discovery.state.queues.find((queue) => queue.id === activeQueueId)
    ?? discovery.state.queues[0]
    ?? null;
  const queueItems = useMemo(() => {
    if (!activeQueue) return [];
    const byId = new Map(catalog.all.map((item) => [item.id, item]));
    return activeQueue.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is WatchItem => Boolean(item));
  }, [activeQueue, catalog.all]);

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
      <MyListShelf
        items={displayedItems}
        totalCount={savedItems.length}
        signedIn={signedIn}
        loading={loading}
        view={view}
        onViewChange={setView}
        sort={sort}
        onSortChange={setSort}
        feedback={discovery.state.feedback}
        onFeedback={handleFeedback}
        activeQueueName={queueTemplatesAllowed ? activeQueue?.name : undefined}
        activeQueueItemIds={queueTemplatesAllowed ? activeQueue?.itemIds : undefined}
        onToggleQueue={queueTemplatesAllowed && activeQueue ? toggleActiveQueueItem : undefined}
        page
      />

      {!subscription.loading && !queueTemplatesAllowed ? (
        <section className="watch-premium-queue-callout" aria-labelledby="custom-lists-title">
          <span className="watch-premium-queue-icon" aria-hidden><LockKeyhole /></span>
          <div>
            <p className="watch-my-list-eyebrow">Optional organization upgrade</p>
            <h2 id="custom-lists-title">Turn DVR into named queues</h2>
            <p>
              {subscription.requiredPlanName("queue.templates")} includes reusable lineups like
              “Friday stream,” “Best e-dates,” or “Shorts to catch up on,” synced across devices.
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
              <p className="watch-my-list-eyebrow">Reusable lineups</p>
              <h2 id="named-queues-title">Custom lists</h2>
              <p>Group saved titles into focused queues without changing your main DVR.</p>
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
                      description="Remove this reusable lineup. Titles stay in your main DVR."
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
                        <h3>This list is ready</h3>
                        <p>Use the more-actions menu on a DVR card above, then choose “Add to {activeQueue.name}.”</p>
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
                <p>Name a reusable lineup, then add titles from DVR without duplicating or moving anything.</p>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
