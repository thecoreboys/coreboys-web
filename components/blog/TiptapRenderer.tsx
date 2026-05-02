"use client";

import { Fragment, type ReactNode } from "react";
import { Info, AlertTriangle, NotebookPen } from "lucide-react";
import { TaggedMedia } from "./TaggedMedia";
import { VideoTaggedMedia } from "./VideoTaggedMedia";
import { TalentTag } from "./TalentTag";
import { VideoEmbed } from "./VideoEmbed";
import type { FaceTagWithPerson, FaceTrack, ResolvedPerson } from "@/lib/blog";
import { slugifyHeading, collectText } from "@/lib/blog";

type Mark = { type: string; attrs?: Record<string, unknown> };

type Node = {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: Node[];
};

export type RenderContext = {
  /** Resolved person rows, keyed by id, for TalentMention rendering. */
  peopleById: Map<string, ResolvedPerson>;
  /** Image face tags resolved per media id, for image MediaEmbed rendering. */
  facesByMediaId: Record<string, FaceTagWithPerson[]>;
  /** Video face tracks resolved per media id, for video MediaEmbed rendering. */
  tracksByMediaId?: Record<string, FaceTrack[]>;
};

/**
 * Pure-React renderer for the editor's JSON output. Server-rendered to
 * keep the post page fast; the only interactivity is from <TaggedMedia>,
 * <TalentTag>, and <VideoEmbed> which are all marked "use client".
 *
 * h1 is intentionally suppressed in body — the post title is the only h1
 * on the page. h2 → SectionHeader, h3 → Subhead.
 */
export function TiptapRenderer({ doc, ctx }: { doc: unknown; ctx: RenderContext }) {
  return <>{renderChildren(doc, ctx)}</>;
}

function renderChildren(doc: unknown, ctx: RenderContext): ReactNode {
  if (!doc || typeof doc !== "object") return null;
  const n = doc as Node;
  if (Array.isArray(n.content)) {
    return n.content.map((c, i) => <Fragment key={i}>{renderNode(c, ctx)}</Fragment>);
  }
  return null;
}

function renderNode(node: Node, ctx: RenderContext): ReactNode {
  switch (node.type) {
    case "doc":
      return renderChildren(node, ctx);

    case "paragraph":
      return <p className="my-4 text-[17px] leading-[1.75] text-[color:var(--ink-dim)]">{renderInline(node, ctx)}</p>;

    case "heading": {
      const level = (node.attrs?.level as number) ?? 2;
      const text = collectText(node);
      const id = slugifyHeading(text);
      // h1 in body: render as h2 — title owns the page h1.
      if (level === 1 || level === 2) {
        return (
          <h2
            id={id}
            className="mt-10 mb-2 font-display text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]"
          >
            {renderInline(node, ctx)}
          </h2>
        );
      }
      if (level === 3) {
        return (
          <h3
            id={id}
            className="mt-6 mb-1.5 font-display text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-[color:var(--ink)]"
          >
            {renderInline(node, ctx)}
          </h3>
        );
      }
      return (
        <h4 id={id} className="mt-4 mb-1 font-semibold text-[18px] text-[color:var(--ink)]">
          {renderInline(node, ctx)}
        </h4>
      );
    }

    case "bulletList":
      return (
        <ul className="my-4 list-disc space-y-1 pl-6 text-[17px] text-[color:var(--ink-dim)]">
          {(node.content ?? []).map((c, i) => (
            <Fragment key={i}>{renderNode(c, ctx)}</Fragment>
          ))}
        </ul>
      );

    case "orderedList":
      return (
        <ol className="my-4 list-decimal space-y-1 pl-6 text-[17px] text-[color:var(--ink-dim)]">
          {(node.content ?? []).map((c, i) => (
            <Fragment key={i}>{renderNode(c, ctx)}</Fragment>
          ))}
        </ol>
      );

    case "listItem":
      return <li>{renderChildren(node, ctx)}</li>;

    case "taskList":
      return (
        <ul className="my-4 space-y-1 pl-1 text-[17px] text-[color:var(--ink-dim)]">
          {(node.content ?? []).map((c, i) => (
            <Fragment key={i}>{renderNode(c, ctx)}</Fragment>
          ))}
        </ul>
      );

    case "taskItem": {
      const checked = node.attrs?.checked === true;
      return (
        <li className="flex items-start gap-2">
          <span
            className={`mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
              checked
                ? "border-[color:var(--core)] bg-[color:var(--core)] text-black"
                : "border-[color:var(--rule)]"
            }`}
            aria-hidden="true"
          >
            {checked ? "✓" : ""}
          </span>
          <span className={checked ? "line-through opacity-70" : ""}>{renderChildren(node, ctx)}</span>
        </li>
      );
    }

    case "blockquote":
      return (
        <blockquote className="my-6 border-l-2 border-[color:var(--rule)] pl-4 text-[18px] italic text-[color:var(--ink-dim)]">
          {renderChildren(node, ctx)}
        </blockquote>
      );

    case "horizontalRule":
    case "divider":
      return <hr className="my-8 border-0 border-t border-[color:var(--rule)]" />;

    case "pullquote":
      return (
        <blockquote className="my-8 border-l-2 border-[color:var(--core)] pl-5 font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]">
          {renderChildren(node, ctx)}
        </blockquote>
      );

    case "callout": {
      const variant = (node.attrs?.variant as string) ?? "info";
      const tone = (CALLOUT_TONE[variant] ?? CALLOUT_TONE.info) as { classes: string; icon: typeof Info };
      const Icon = tone.icon;
      return (
        <aside
          className={`my-6 flex items-start gap-2.5 rounded-[8px] border-l-2 px-4 py-3 text-[15px] ${tone.classes}`}
          role="note"
        >
          <span className="mt-0.5 shrink-0">
            <Icon size={16} />
          </span>
          <div>{renderChildren(node, ctx)}</div>
        </aside>
      );
    }

    case "mediaEmbed": {
      const mediaId = node.attrs?.mediaId as string | undefined;
      const url = node.attrs?.url as string | undefined;
      const altText = (node.attrs?.altText as string | null | undefined) ?? "";
      const caption = (node.attrs?.caption as string | null | undefined) ?? null;
      const mimeType = (node.attrs?.mimeType as string | undefined) ?? "";
      if (!url) return null;
      const isVideo =
        mimeType.startsWith("video/") ||
        /\.(mp4|webm|mov)(\?|$)/i.test(url) ||
        Boolean(mediaId && ctx.tracksByMediaId?.[mediaId]?.length);
      if (isVideo) {
        const tracks = mediaId ? ctx.tracksByMediaId?.[mediaId] ?? [] : [];
        return (
          <div className="my-6">
            <VideoTaggedMedia src={url} caption={caption} tracks={tracks} />
          </div>
        );
      }
      const tags = mediaId ? ctx.facesByMediaId[mediaId] ?? [] : [];
      return (
        <div className="my-6">
          <TaggedMedia src={url} alt={altText} faceTags={tags} caption={caption} />
        </div>
      );
    }

    case "videoEmbed": {
      const platform = node.attrs?.platform as string | undefined;
      const embedUrl = node.attrs?.embedUrl as string | undefined;
      const url = node.attrs?.url as string | undefined;
      const thumbnailUrl = (node.attrs?.thumbnailUrl as string | null | undefined) ?? null;
      if (!embedUrl || !platform) return null;
      return (
        <div className="my-6">
          <VideoEmbed
            platform={platform}
            embedUrl={embedUrl}
            sourceUrl={url ?? embedUrl}
            thumbnailUrl={thumbnailUrl}
          />
        </div>
      );
    }

    case "talentMention": {
      const personId = node.attrs?.personId as string | undefined;
      const fallbackName = (node.attrs?.name as string | undefined) ?? "";
      if (!personId) {
        return <span className="font-semibold">@{fallbackName}</span>;
      }
      const person = ctx.peopleById.get(personId);
      if (!person) {
        return <span className="font-semibold">@{fallbackName}</span>;
      }
      return <TalentTag person={person} />;
    }

    case "coverImage":
      // Cover is rendered above the body by the post page; suppress in flow.
      return null;

    case "text":
      return renderTextNode(node);

    case "hardBreak":
      return <br />;

    default:
      return renderChildren(node, ctx);
  }
}

function renderInline(node: Node, ctx: RenderContext): ReactNode {
  return (node.content ?? []).map((c, i) => <Fragment key={i}>{renderNode(c, ctx)}</Fragment>);
}

function renderTextNode(node: Node): ReactNode {
  let el: ReactNode = node.text ?? "";
  for (const m of node.marks ?? []) {
    el = wrapMark(el, m);
  }
  return el;
}

function wrapMark(child: ReactNode, mark: Mark): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong className="text-[color:var(--ink)]">{child}</strong>;
    case "italic":
      return <em>{child}</em>;
    case "underline":
      return <u>{child}</u>;
    case "strike":
      return <s>{child}</s>;
    case "code":
      return (
        <code className="rounded-[3px] border border-[color:var(--rule)] bg-[color:var(--surface)] px-1 py-0.5 font-mono text-[13px]">
          {child}
        </code>
      );
    case "link": {
      const href = mark.attrs?.href as string | undefined;
      if (!href) return <>{child}</>;
      const external = /^https?:\/\//.test(href);
      return (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="text-[color:var(--core)] underline-offset-2 hover:underline"
        >
          {child}
        </a>
      );
    }
    default:
      return <>{child}</>;
  }
}

const CALLOUT_TONE: Record<
  string,
  { classes: string; icon: typeof Info }
> = {
  info: {
    classes: "border-[color:var(--core)] bg-[color:var(--core)]/10 text-[color:var(--ink-dim)]",
    icon: Info,
  },
  warn: {
    classes: "border-amber-400/60 bg-amber-400/5 text-amber-100/80",
    icon: AlertTriangle,
  },
  note: {
    classes: "border-[color:var(--rule)] bg-[color:var(--surface)] text-[color:var(--ink-dim)]",
    icon: NotebookPen,
  },
};
