-- Bounded cursor paging for public per-channel X history. This index supports
-- the exact provider/member/order tuple used by the archive page without
-- expanding normal Watch catalog reads.

CREATE INDEX IF NOT EXISTS social_content_events_x_archive_page_idx
  ON social_content_events (provider, member_slug, published_at DESC, id DESC)
  WHERE provider = 'x';
