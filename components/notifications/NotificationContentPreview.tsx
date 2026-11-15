"use client";

import Link from "next/link";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { useState, type ReactNode } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  notificationProviderLabel,
  type NotificationPreviewData,
} from "@/lib/notification-target";
import type { NotificationLinkPreview, NotificationXPost } from "@/lib/inbox-notification";

function PreviewImage({ src, alt = "", className, fallback = null }: { src: string; alt?: string; className?: string; fallback?: ReactNode }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (failedSource === src) return fallback;
  // Provider previews have unknown intrinsic proportions and share this renderer
  // across avatars, landscape cards and full photos; preserve their native ratio.
  // eslint-disable-next-line @next/next/no-img-element -- Remote provider previews retain intrinsic sizing and the no-referrer/error fallback contract.
  return <img key={src} src={src} alt={alt} className={className} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSource(src)} />;
}

function sourceHost(value: string): string {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return "the source"; }
}

function ProviderMark({ provider }: { provider: NotificationPreviewData["provider"] }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-black text-primary ring-1 ring-secondary"
    >
      {provider === "web" ? <Link2 className="size-4" /> : <SocialIcon platform={provider} size={18} />}
    </span>
  );
}

function XText({ text, links }: { text: string; links: NotificationLinkPreview[] }) {
  let linkIndex = 0;
  const parts = text.split(/(https?:\/\/t\.co\/[^\s]+)/gi);
  return (
    <p className="whitespace-pre-wrap break-words text-[0.98rem] leading-7 text-primary">
      {parts.map((part, index) => {
        if (/^https?:\/\/t\.co\//i.test(part)) {
          const link = links[linkIndex++];
          if (!link) return <span key={`${part}-${index}`}> shared link</span>;
          return <a key={`${part}-${index}`} href={link.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-secondary underline decoration-sky-300/40 underline-offset-4 hover:text-brand-secondary_hover"> {link.label ?? sourceHost(link.href)}</a>;
        }
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
        <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-secondary bg-secondary p-2.5 transition hover:border-primary hover:bg-secondary_hover">
          {link.imageUrl ? <PreviewImage src={link.imageUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover"  /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary_hover text-tertiary"><Link2 className="size-4" aria-hidden /></span>}
          <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold uppercase tracking-[.12em] text-tertiary">{link.label ?? sourceHost(link.href)}</span><strong className="mt-1 block truncate text-sm text-primary">{link.title ?? sourceHost(link.href)}</strong>{link.description ? <span className="mt-0.5 block truncate text-xs text-tertiary">{link.description}</span> : null}</span>
          <ExternalLink className="size-4 shrink-0 text-tertiary" aria-hidden />
        </a>
      ))}
    </div>
  );
}

function XPostPreview({ post }: { post: NotificationXPost }) {
  return (
    <div className="rounded-2xl border border-secondary bg-secondary p-4 sm:p-5">
      <header className="flex items-center gap-3">
        {post.authorAvatarUrl ? <PreviewImage src={post.authorAvatarUrl} alt="" className="size-11 rounded-full object-cover ring-1 ring-secondary"  /> : <ProviderMark provider="x" />}
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-primary">{post.authorName}{post.verified ? <span className="ml-1 text-sky-400" aria-label="Verified account">✓</span> : null}</strong><span className="block truncate text-xs text-tertiary">{post.authorHandle}</span></span>
        <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Open post on X" className="grid size-8 place-items-center rounded-full text-tertiary transition hover:bg-secondary_hover hover:text-primary"><ExternalLink className="size-4" aria-hidden /></a>
      </header>
      <div className="mt-4"><XText text={post.text} links={post.links} /><XLinks links={post.links} /></div>
      {post.media.length ? <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block overflow-hidden rounded-xl border border-secondary"><PreviewImage src={post.media[0]!.thumbnailUrl} alt="" className="max-h-80 w-full object-cover"  /></a> : null}
      {post.quote ? <div className="mt-4 rounded-xl border border-secondary bg-secondary p-3"><div className="flex items-center gap-2">{post.quote.authorAvatarUrl ? <PreviewImage src={post.quote.authorAvatarUrl} alt="" className="size-7 rounded-full object-cover"  /> : <ProviderMark provider="x" />}<span className="min-w-0 flex-1"><strong className="block truncate text-xs text-primary">{post.quote.authorName ?? post.quote.authorHandle}</strong><span className="block truncate text-[11px] text-tertiary">{post.quote.authorHandle}</span></span></div><div className="mt-3"><XText text={post.quote.text} links={post.quote.links} /><XLinks links={post.quote.links} /></div>{post.quote.media.length ? <a href={post.quote.statusUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block overflow-hidden rounded-lg"><PreviewImage src={post.quote.media[0]!.thumbnailUrl} alt="" className="max-h-64 w-full object-cover"  /></a> : null}</div> : null}
    </div>
  );
}

export function NotificationPreviewSurface({
  preview,
  fullPage = false,
  dialogTitle = false,
}: {
  preview: NotificationPreviewData;
  fullPage?: boolean;
  dialogTitle?: boolean;
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
        ? "w-full max-w-3xl overflow-hidden rounded-3xl border border-secondary bg-primary text-primary shadow-lg"
        : "overflow-hidden rounded-2xl bg-primary text-primary"}
    >
      <div className="relative overflow-hidden border-b border-secondary bg-secondary px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
        <div className="relative flex items-center gap-3">
          <ProviderMark provider={preview.provider} />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-tertiary">Preview on CORE</p>
            <p className="mt-0.5 text-sm font-semibold text-primary">{provider} post</p>
          </div>
        </div>
        {!preview.xPost ? (dialogTitle ? <DialogTitle className="relative mt-5 max-w-2xl text-2xl leading-[1.05] text-primary sm:text-3xl">{preview.title}</DialogTitle> : <h3 className="relative mt-5 max-w-2xl text-2xl leading-[1.05] text-primary sm:text-3xl">{preview.title}</h3>) : <p className="relative mt-5 text-sm font-semibold text-secondary">X post</p>}
        {dialogTitle && (preview.xPost || !preview.body) ? <DialogDescription className="sr-only">Read the post, open the original, or copy its link.</DialogDescription> : null}
        {dialogTitle && preview.xPost ? <DialogTitle className="sr-only">{preview.title}</DialogTitle> : null}
        {!preview.xPost && preview.body ? (
          dialogTitle ? <DialogDescription className="relative mt-3 max-w-2xl text-sm leading-6 text-secondary">{preview.body}</DialogDescription> : <p className="relative mt-3 max-w-2xl text-sm leading-6 text-secondary">{preview.body}</p>
        ) : null}
      </div>

      <div className="p-4 sm:p-5">
        {preview.xPost ? <XPostPreview post={preview.xPost} /> : null}
        {!preview.xPost ? <div className="overflow-hidden rounded-2xl border border-secondary bg-secondary">
          {image ? (
            // External artwork is optional decoration. The actual source remains
            // a clearly labelled, explicit action below.
            // eslint-disable-next-line @next/next/no-img-element
            <PreviewImage src={image} alt="" className="max-h-[28rem] w-full object-contain"  />
          ) : null}
          <div className="flex items-center gap-3 border-t border-secondary px-4 py-3">
            <ProviderMark provider={preview.provider} />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm text-primary">{provider}</strong>
              <span className="block truncate text-xs text-tertiary">{sourceHost(preview.sourceHref)}</span>
            </span>
          </div>
        </div> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={preview.sourceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-solid px-4 text-sm font-semibold text-white transition hover:bg-brand-solid_hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            Open on {provider} <ExternalLink className="size-4" aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => void copySource()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-secondary ring-1 ring-secondary transition hover:bg-secondary_hover hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Copy className="size-4" aria-hidden />{copied ? "Copied" : "Copy link"}
          </button>
          {fullPage ? (
            <Link href="/account/notifications" className="ml-auto inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-tertiary transition hover:bg-secondary_hover hover:text-primary">
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
        <DialogContent className="w-[min(42rem,calc(100vw-1.5rem))] max-h-[min(48rem,calc(100dvh-1.5rem))] overscroll-y-contain overflow-y-auto rounded-3xl border-secondary bg-primary p-0 text-primary shadow-xl">
          <NotificationPreviewSurface preview={preview} dialogTitle />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
