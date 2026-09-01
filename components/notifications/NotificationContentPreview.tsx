"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  notificationProviderLabel,
  type NotificationPreviewData,
} from "@/lib/notification-target";
import type { NotificationLinkPreview, NotificationXPost } from "@/lib/inbox-notification";

function sourceHost(value: string): string {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return "the source"; }
}

function ProviderMark({ provider }: { provider: NotificationPreviewData["provider"] }) {
  const label = provider === "x" ? "𝕏" : notificationProviderLabel(provider).slice(0, 1);
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-sm font-black text-white ring-1 ring-white/15"
    >
      {label}
    </span>
  );
}

function XText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/t\.co\/[^\s]+)/gi);
  return (
    <p className="whitespace-pre-wrap break-words text-[0.98rem] leading-7 text-white/90">
      {parts.map((part, index) => {
        if (/^https?:\/\/t\.co\//i.test(part)) return null;
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </p>
  );
}

function XLinks({ links }: { links: NotificationLinkPreview[] }) {
  if (!links.length) return null;
  return (
    <div className="mt-4 grid gap-2">
      {links.map((link) => (
        <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[.04] p-2.5 transition hover:border-white/25 hover:bg-white/[.08]">
          {link.imageUrl ? <img src={link.imageUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" referrerPolicy="no-referrer" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/[.08] text-white/55"><Link2 className="size-4" aria-hidden /></span>}
          <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold uppercase tracking-[.12em] text-white/45">{link.label ?? sourceHost(link.href)}</span><strong className="mt-1 block truncate text-sm text-white/90">{link.title ?? sourceHost(link.href)}</strong>{link.description ? <span className="mt-0.5 block truncate text-xs text-white/50">{link.description}</span> : null}</span>
          <ExternalLink className="size-4 shrink-0 text-white/45" aria-hidden />
        </a>
      ))}
    </div>
  );
}

function XPostPreview({ post }: { post: NotificationXPost }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
      <header className="flex items-center gap-3">
        {post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt="" className="size-11 rounded-full object-cover ring-1 ring-white/15" referrerPolicy="no-referrer" /> : <ProviderMark provider="x" />}
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{post.authorName}{post.verified ? <span className="ml-1 text-sky-400" aria-label="Verified account">✓</span> : null}</strong><span className="block truncate text-xs text-white/50">{post.authorHandle}</span></span>
        <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Open post on X" className="grid size-8 place-items-center rounded-full text-white/55 transition hover:bg-white/[.08] hover:text-white"><ExternalLink className="size-4" aria-hidden /></a>
      </header>
      <div className="mt-4"><XText text={post.text} /><XLinks links={post.links} /></div>
      {post.media.length ? <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block overflow-hidden rounded-xl border border-white/10"><img src={post.media[0]!.thumbnailUrl} alt="" className="max-h-80 w-full object-cover" referrerPolicy="no-referrer" /></a> : null}
      {post.quote ? <div className="mt-4 rounded-xl border border-white/10 bg-white/[.03] p-3"><div className="flex items-center gap-2">{post.quote.authorAvatarUrl ? <img src={post.quote.authorAvatarUrl} alt="" className="size-7 rounded-full object-cover" referrerPolicy="no-referrer" /> : <ProviderMark provider="x" />}<span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white/85">{post.quote.authorName ?? post.quote.authorHandle}</strong><span className="block truncate text-[11px] text-white/45">{post.quote.authorHandle}</span></span></div><div className="mt-3"><XText text={post.quote.text} /><XLinks links={post.quote.links} /></div>{post.quote.media.length ? <a href={post.quote.statusUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block overflow-hidden rounded-lg"><img src={post.quote.media[0]!.thumbnailUrl} alt="" className="max-h-64 w-full object-cover" referrerPolicy="no-referrer" /></a> : null}</div> : null}
    </div>
  );
}

export function NotificationPreviewSurface({
  preview,
  fullPage = false,
}: {
  preview: NotificationPreviewData;
  fullPage?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const provider = notificationProviderLabel(preview.provider);
  const image = preview.imageUrl;

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(preview.sourceHref);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      window.prompt("Copy this link", preview.sourceHref);
    }
  };

  return (
    <article
      data-notification-content-preview
      data-provider={preview.provider}
      className={fullPage
        ? "w-full max-w-3xl overflow-hidden rounded-3xl border border-white/12 bg-[#111116] text-white shadow-[0_28px_96px_rgba(0,0,0,.48)]"
        : "overflow-hidden rounded-2xl bg-[#111116] text-white"}
    >
      <div className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_78%_0%,rgba(225,0,112,.24),transparent_42%),linear-gradient(135deg,#17121a_0%,#111116_64%)] px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
        <div className="absolute -right-20 -top-20 size-56 rounded-full bg-[#e50070]/15 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <ProviderMark provider={preview.provider} />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Preview on CORE</p>
            <p className="mt-0.5 text-sm font-semibold text-white/90">{provider} post</p>
          </div>
        </div>
        {!preview.xPost ? <DialogTitle className="relative mt-5 max-w-2xl text-2xl leading-[1.05] text-white sm:text-3xl">{preview.title}</DialogTitle> : <p className="relative mt-5 text-sm font-semibold text-white/75">X post</p>}
        {!preview.xPost && preview.body ? (
          <DialogDescription className="relative mt-3 max-w-2xl text-sm leading-6 text-white/65">
            {preview.body}
          </DialogDescription>
        ) : null}
      </div>

      <div className="p-4 sm:p-5">
        {preview.xPost ? <XPostPreview post={preview.xPost} /> : null}
        {!preview.xPost ? <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
          {image ? (
            // External artwork is optional decoration. The actual source remains
            // a clearly labelled, explicit action below.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="max-h-[28rem] w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="grid min-h-44 place-items-center bg-[linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.015))]">
              <span className="grid size-14 place-items-center rounded-2xl bg-white/[.07] text-white/65 ring-1 ring-white/10"><Link2 className="size-6" aria-hidden /></span>
            </div>
          )}
          <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
            <ProviderMark provider={preview.provider} />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm text-white">{provider}</strong>
              <span className="block truncate text-xs text-white/50">{sourceHost(preview.sourceHref)}</span>
            </span>
          </div>
        </div> : null}

        <p className="mt-4 text-xs leading-5 text-white/50">
          This stays on CORE until you choose to open the original post.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={preview.sourceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#111116]"
          >
            Open on {provider} <ExternalLink className="size-4" aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => void copySource()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white/75 ring-1 ring-white/15 transition hover:bg-white/[.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Copy className="size-4" aria-hidden />{copied ? "Copied" : "Copy link"}
          </button>
          {fullPage ? (
            <Link href="/account/notifications" className="ml-auto inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-white/60 transition hover:bg-white/[.08] hover:text-white">
              Back to notifications
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function NotificationContentPreview({
  preview,
  onClose,
}: {
  preview: NotificationPreviewData | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) onClose(); }}>
      {preview ? (
        <DialogContent className="w-[min(42rem,calc(100vw-1.5rem))] max-h-[min(48rem,calc(100dvh-1.5rem))] overscroll-y-contain overflow-y-auto rounded-3xl border-white/12 bg-[#111116] p-0 text-white shadow-[0_36px_130px_rgba(0,0,0,.72)]">
          <NotificationPreviewSurface preview={preview} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
