import { ArrowUpRight } from "lucide-react";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { xPosterContent } from "@/lib/watch/x-poster";
import type { WatchItem } from "@/lib/watch/types";

/** A local, request-free post preview; never a simulated video thumbnail. */
export function XPostPoster({ item, portrait }: { item: WatchItem; portrait?: string }) {
  const post = xPosterContent(item);
  const avatar = post.avatar || portrait;
  return (
    <span className="watch-x-poster">
      <span className="watch-x-poster-header">
        <span className="watch-x-poster-avatar">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" loading="lazy" decoding="async" />
          ) : post.name.charAt(0)}
        </span>
        <span className="watch-x-poster-author"><strong>{post.name}</strong>{post.handle ? <span>@{post.handle}</span> : null}</span>
        <SocialIcon platform="x" size={18} />
      </span>
      <span className="watch-x-poster-body">{post.text}</span>
      <span className="watch-x-poster-footer">
        {post.date ? <time dateTime={item.publishedAt}>{post.date}</time> : <span>Post on X</span>}
        <span>Read post <ArrowUpRight size={16} aria-hidden /></span>
      </span>
    </span>
  );
}
