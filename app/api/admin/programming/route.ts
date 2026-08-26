import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  createProgrammingItem,
  createProgrammingSection,
  createProgrammingSource,
  deleteProgrammingEntity,
  getWatchProgrammingSnapshot,
  instagramPostIdFromUrl,
  tiktokVideoIdFromUrl,
  updateProgrammingItem,
  updateProgrammingSection,
  updateProgrammingSource,
  youtubeVideoIdFromUrl,
} from "@/lib/watch/programming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Slug = z.enum(["core", "adapt", "ron", "lacy", "marlon", "jason", "silky"]);
const Route = z.object({
  networkSlug: Slug,
  channelMode: z.enum(["videos", "shorts", "continuous"]),
});
const BaseSource = z.object({
  name: z.string().trim().min(1).max(100),
  platform: z.enum(["youtube", "tiktok", "instagram", "x"]),
  sourceRef: z.string().trim().min(1).max(500),
  sourceUrl: z.string().url().nullable().optional(),
  enabled: z.boolean().default(true),
  routes: z.array(Route).max(21).default([]),
  sectionIds: z.array(z.string().uuid()).max(100).default([]),
});
const BaseItem = z.object({
  sourceId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(240).optional(),
  subtitle: z.string().trim().max(160).nullable().optional(),
  posterUrl: z.string().url().nullable().optional(),
  format: z.enum(["auto", "long", "short"]).default("auto"),
  enabled: z.boolean().default(true),
  heroFeatured: z.boolean().default(false),
  heroPriority: z.coerce.number().int().min(0).max(10_000).default(100),
  sectionIds: z.array(z.string().uuid()).max(100).default([]),
});
const BaseSection = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
  title: z.string().trim().min(1).max(120),
  kicker: z.string().trim().max(160).nullable().optional(),
  layout: z.enum(["standard", "vertical", "auto"]).default("standard"),
  enabled: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(100),
});

const Create = z.discriminatedUnion("entity", [
  BaseSource.extend({ entity: z.literal("source") }),
  BaseItem.extend({ entity: z.literal("item"), url: z.string().url() }),
  BaseSection.extend({ entity: z.literal("section") }),
]);
const Update = z.discriminatedUnion("entity", [
  BaseSource.extend({ entity: z.literal("source"), id: z.string().uuid() }),
  BaseItem.required({ title: true }).extend({ entity: z.literal("item"), id: z.string().uuid() }),
  BaseSection.required({ slug: true }).extend({ entity: z.literal("section"), id: z.string().uuid() }),
]);

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function youtubeDetails(url: string, id: string) {
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error("oembed unavailable");
    const json = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      title: json.title?.trim() || `YouTube video ${id}`,
      subtitle: json.author_name?.trim() || null,
      posterUrl: json.thumbnail_url || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    };
  } catch {
    return {
      title: `YouTube video ${id}`,
      subtitle: null,
      posterUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    };
  }
}

async function tiktokDetails(url: string) {
  try {
    const endpoint = new URL("https://www.tiktok.com/oembed");
    endpoint.searchParams.set("url", url);
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("oembed unavailable");
    const json = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      title: json.title?.trim() || "TikTok video",
      subtitle: json.author_name?.trim() || null,
      posterUrl: json.thumbnail_url || null,
    };
  } catch {
    return { title: "TikTok video", subtitle: null, posterUrl: null };
  }
}

async function instagramDetails(url: string) {
  // Instagram's oEmbed endpoint requires an app token for some accounts. The
  // canonical URL is still safe to curate without one, so metadata failure
  // must never prevent an admin from adding a public post or Reel.
  try {
    const endpoint = new URL("https://www.instagram.com/oembed/");
    endpoint.searchParams.set("url", url);
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("oembed unavailable");
    const json = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      title: json.title?.trim() || "Instagram post",
      subtitle: json.author_name?.trim() || null,
      posterUrl: json.thumbnail_url || null,
    };
  } catch {
    return {
      title: /instagram\.com\/(?:[^/?#]+\/)?p\//i.test(url) ? "Instagram post" : "Instagram Reel",
      subtitle: null,
      posterUrl: null,
    };
  }
}

function jsonError(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "invalid payload", issues: error.issues }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "request failed";
  const conflict = /duplicate key|unique constraint/i.test(message);
  return NextResponse.json({ error: conflict ? "already exists" : "request failed" }, { status: conflict ? 409 : 500 });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getWatchProgrammingSnapshot({ ensure: true }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const body = Create.parse(await request.json());
    if (body.entity === "source") {
      await createProgrammingSource({ ...body, createdBy: auth.id });
    } else if (body.entity === "section") {
      await createProgrammingSection({ ...body, slug: body.slug || slugify(body.title), createdBy: auth.id });
    } else {
      const youtubeId = youtubeVideoIdFromUrl(body.url);
      const tiktokId = tiktokVideoIdFromUrl(body.url);
      const instagramId = instagramPostIdFromUrl(body.url);
      if (!youtubeId && !tiktokId && !instagramId) {
        return NextResponse.json({ error: "Enter a public YouTube video, Short, TikTok, Instagram Reel, or Instagram post URL." }, { status: 400 });
      }
      const platform = tiktokId ? "tiktok" as const : instagramId ? "instagram" as const : "youtube" as const;
      const externalId = tiktokId ?? instagramId ?? youtubeId!;
      const details = platform === "tiktok"
        ? await tiktokDetails(body.url)
        : platform === "instagram"
          ? await instagramDetails(body.url)
        : await youtubeDetails(body.url, externalId);
      await createProgrammingItem({
        ...body,
        platform,
        externalId,
        sourceUrl: platform === "youtube" ? `https://www.youtube.com/watch?v=${externalId}` : body.url,
        title: body.title || details.title,
        subtitle: body.subtitle ?? details.subtitle,
        posterUrl: body.posterUrl ?? details.posterUrl,
        createdBy: auth.id,
      });
    }
    return NextResponse.json(await getWatchProgrammingSnapshot({ ensure: true }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const body = Update.parse(await request.json());
    if (body.entity === "source") await updateProgrammingSource(body.id, body);
    else if (body.entity === "item") await updateProgrammingItem(body.id, body);
    else await updateProgrammingSection(body.id, body);
    return NextResponse.json(await getWatchProgrammingSnapshot({ ensure: true }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const entity = z.enum(["source", "item", "section"]).parse(url.searchParams.get("entity"));
    const id = z.string().uuid().parse(url.searchParams.get("id"));
    await deleteProgrammingEntity(entity, id);
    return NextResponse.json(await getWatchProgrammingSnapshot({ ensure: true }));
  } catch (error) {
    return jsonError(error);
  }
}
