import { readFile } from "node:fs/promises";
import pg from "pg";
import { GROUP_SOCIALS, MEMBERS } from "@coreboys/shared";

const { Client } = pg;
const strict = process.argv.includes("--strict");
const jsonOutput = process.argv.includes("--json");
const X_PUBLIC_MAX_AGE_HOURS = 24;
const X_LOCAL_QA_MAX_AGE_HOURS = 7 * 24;

function bareHandle(raw = "") {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(
    /(?:youtube\.com\/(?:@|c\/|user\/|channel\/)|instagram\.com\/|tiktok\.com\/@|(?:x|twitter)\.com\/)([^/?#]+)/i,
  )?.[1];
  return (fromUrl ?? trimmed).replace(/^@+/, "").replace(/[^a-z0-9._-]/gi, "").toLowerCase();
}

const X_COMMUNITY_KEYS = ["core", "flock", "stable", "thugs", "m3", "nms", "slg"];
const X_CREATOR_COMMUNITY_KEYS = ["flock", "stable", "thugs", "m3", "nms", "slg"];

function xCommunitySummary(valid, configured = []) {
  return {
    valid,
    configured: configured.length,
    missing: X_COMMUNITY_KEYS.filter((key) => !configured.includes(key)),
    requiredConfigured: X_CREATOR_COMMUNITY_KEYS.filter((key) => configured.includes(key)).length,
    requiredExpected: X_CREATOR_COMMUNITY_KEYS.length,
    missingRequired: X_CREATOR_COMMUNITY_KEYS.filter((key) => !configured.includes(key)),
  };
}

function xCommunityStatus() {
  const raw = process.env.X_COMMUNITIES_JSON;
  if (!raw?.trim()) return xCommunitySummary(true);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return xCommunitySummary(false);
    }
    const configured = X_COMMUNITY_KEYS.filter((key) => {
      const row = parsed[key];
      if (!row || typeof row !== "object" || Array.isArray(row)) return false;
      const candidate = String(row.id || row.url || "").trim();
      return /^\d{5,25}$/.test(candidate) || /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/communities\/\d{5,25}\/?$/i.test(candidate);
    });
    return xCommunitySummary(true, configured);
  } catch {
    return xCommunitySummary(false);
  }
}

function positiveNumber(name) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function publicWebhookOrigin() {
  const raw = process.env.SOCIAL_WEBHOOK_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const loopbackOrPrivate =
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      /^127(?:\.\d{1,3}){3}$/.test(host) ||
      /^10(?:\.\d{1,3}){3}$/.test(host) ||
      /^192\.168(?:\.\d{1,3}){2}$/.test(host) ||
      /^169\.254(?:\.\d{1,3}){2}$/.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host) ||
      /^(?:127(?:-\d{1,3}){3}|localhost)\.sslip\.io$/.test(host);
    if (
      url.protocol !== "https:" ||
      (url.port && url.port !== "443") ||
      url.username ||
      url.password ||
      loopbackOrPrivate
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function readXMonitoring() {
  if (!process.env.DATABASE_URL) return { state: "not_configured" };
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  });
  try {
    await client.connect();
    const relations = await client.query(
      `SELECT to_regclass('public.x_api_usage')::text AS usage,
              to_regclass('public.x_api_cache')::text AS cache,
              to_regclass('public.x_api_reservations')::text AS reservations,
              to_regclass('public.x_feed_snapshots')::text AS snapshot`,
    );
    const found = relations.rows[0] || {};
    const output = {
      state: "available",
      usageLedger: Boolean(found.usage),
      cacheTable: Boolean(found.cache),
      reservationTable: Boolean(found.reservations),
      feedSnapshotTable: Boolean(found.snapshot),
    };
    if (found.usage) {
      const usage = await client.query(
        `SELECT COUNT(*)::int AS requests,COALESCE(SUM(resource_count),0)::int AS resources,
                COALESCE(SUM(estimated_cost_microusd),0)::bigint::text AS microusd,
                COALESCE(SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END),0)::int AS cache_hits
           FROM x_api_usage WHERE created_at>=date_trunc('month',now())`,
      );
      output.month = usage.rows[0];
    }
    if (found.cache) {
      const cache = await client.query(
        `SELECT COUNT(*)::int AS entries,COUNT(*) FILTER(WHERE expires_at>now())::int AS fresh,
                COALESCE(SUM(hit_count),0)::bigint::text AS hits FROM x_api_cache`,
      );
      output.cache = cache.rows[0];
    }
    if (found.reservations) {
      const reservations = await client.query(
        `SELECT COUNT(*) FILTER(WHERE status='pending' AND expires_at>now())::int AS pending,
                COALESCE(SUM(reserved_microusd) FILTER(WHERE status='pending' AND expires_at>now()),0)::bigint::text AS pending_microusd
           FROM x_api_reservations`,
      );
      output.reservations = reservations.rows[0];
    }
    if (found.snapshot) {
      const snapshot = await client.query(
        `SELECT refreshed_at::text,attempted_at::text,(last_error IS NOT NULL) AS has_error,
                ARRAY(
                  SELECT DISTINCT COALESCE(NULLIF(item->>'authorSlug',''),'core')
                    FROM jsonb_array_elements(payload) AS item
                   ORDER BY 1
                ) AS owners
           FROM x_feed_snapshots WHERE cache_key='core-roster' LIMIT 1`,
      );
      output.feedSnapshot = snapshot.rows[0] ?? null;
    }
    return output;
  } catch (error) {
    return { state: "unavailable", reason: typeof error?.code === "string" ? error.code : "connection_error" };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function readWebhookMonitoring() {
  if (!process.env.DATABASE_URL) return { state: "not_configured", sources: [], receipts24h: [] };
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  });
  try {
    await client.connect();
    const relations = await client.query(
      `SELECT to_regclass('public.social_source_registry')::text AS sources,
              to_regclass('public.social_webhook_receipts')::text AS receipts`,
    );
    if (!relations.rows[0]?.sources || !relations.rows[0]?.receipts) {
      return { state: "schema_missing", sources: [], receipts24h: [] };
    }
    const [sources, receipts] = await Promise.all([
      client.query(
        `SELECT provider::text,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE webhook_state='verified')::int AS verified,
                COUNT(*) FILTER (WHERE credential_state='healthy')::int AS healthy,
                MAX(last_received_at)::text AS last_received_at
           FROM social_source_registry
          WHERE provider::text = ANY($1::text[])
          GROUP BY provider
          ORDER BY provider`,
        [["twitch", "youtube", "tiktok", "instagram"]],
      ),
      client.query(
        `SELECT provider::text, COUNT(*)::int AS receipts
           FROM social_webhook_receipts
          WHERE received_at >= now() - interval '24 hours'
          GROUP BY provider
          ORDER BY provider`,
      ),
    ]);
    return { state: "available", sources: sources.rows, receipts24h: receipts.rows };
  } catch (error) {
    return {
      state: "unavailable",
      sources: [],
      receipts24h: [],
      reason: typeof error?.code === "string" ? error.code : "connection_error",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function sourceHandles(platform) {
  const values = [];
  for (const social of GROUP_SOCIALS) {
    if (social.platform === platform) values.push(social.handle || social.url);
  }
  for (const member of MEMBERS) {
    for (const social of member.socials) {
      // Match the web roster's retired-source rule. The shared package may
      // retain historical socials, but a known-dead handle must not keep
      // failing production readiness checks.
      if (
        social.platform === "youtube" &&
        /(?:^@?lacyirls$|youtube\.com\/@lacyirls)/i.test(`${social.handle || ""} ${social.url || ""}`)
      ) continue;
      if (social.platform === platform) values.push(social.handle || social.url);
    }
  }
  return [...new Set(values.map(bareHandle).filter(Boolean))];
}

function xRosterOwnership() {
  const groupX = GROUP_SOCIALS.find((social) => social.platform === "x");
  const accounts = [
    { owner: "core", handle: bareHandle(groupX?.handle || groupX?.url) },
    ...MEMBERS.map((member) => {
      const social = member.socials.find((candidate) => candidate.platform === "x");
      return { owner: member.slug, handle: bareHandle(social?.handle || social?.url) };
    }),
  ];
  const configured = accounts.filter((account) => account.handle);
  return {
    expected: accounts.length,
    configured: configured.length,
    missing: accounts.filter((account) => !account.handle).map((account) => account.owner),
    accounts: configured.map((account) => ({
      owner: account.owner,
      handle: `@${account.handle}`,
    })),
  };
}

function parseAccountMap(name, validValue = (value) => Boolean(value.trim())) {
  const raw = process.env[name];
  if (!raw) return { handles: new Set(), valid: true };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { handles: new Set(), valid: false };
    }
    const handles = new Set();
    for (const [handle, entry] of Object.entries(parsed)) {
      const token = typeof entry === "string"
        ? entry
        : entry && typeof entry === "object"
          ? entry.accessToken || entry.token
          : null;
      if (typeof token === "string" && validValue(token)) handles.add(bareHandle(handle));
    }
    return { handles, valid: true };
  } catch {
    return { handles: new Set(), valid: false };
  }
}

function hasScope(raw, required) {
  const scopes = new Set(String(raw ?? "").split(/[\s,]+/).filter(Boolean));
  return required.some((scope) => scopes.has(scope));
}

async function readVaultGrants() {
  if (!process.env.DATABASE_URL) return { state: "not_configured", rows: [] };
  if (!process.env.FAN_OAUTH_KEY?.trim() && !process.env.FAN_SESSION_SECRET?.trim()) {
    return { state: "key_missing", rows: [] };
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  });
  try {
    await client.connect();
    const result = await client.query(
      `SELECT provider, provider_username, scopes
         FROM fan_oauth_connections
        WHERE provider::text = ANY($1::text[])
          AND status <> 'revoked'`,
      [["tiktok", "instagram", "x"]],
    );
    return { state: "available", rows: result.rows };
  } catch (error) {
    return {
      state: "unavailable",
      rows: [],
      reason: typeof error?.code === "string" ? error.code : "connection_error",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function envGrantHandles(provider) {
  const mapName = provider === "tiktok"
    ? "TIKTOK_ACCOUNT_TOKENS_JSON"
    : "INSTAGRAM_ACCOUNT_TOKENS_JSON";
  const legacyHandleName = provider === "tiktok"
    ? "TIKTOK_ACCOUNT_HANDLE"
    : "INSTAGRAM_ACCOUNT_HANDLE";
  const legacyTokenName = provider === "tiktok"
    ? "TIKTOK_ACCESS_TOKEN"
    : "INSTAGRAM_TOKEN";
  const parsed = parseAccountMap(mapName);
  if (process.env[legacyHandleName]?.trim() && process.env[legacyTokenName]?.trim()) {
    parsed.handles.add(bareHandle(process.env[legacyHandleName]));
  }
  return { ...parsed, mapName };
}

function providerGrantStatus(provider) {
  const expected = sourceHandles(provider);
  const env = envGrantHandles(provider);
  // Public creator media is deliberately configured from server-only account
  // maps. Fan OAuth connections are viewer data and must never be considered
  // a creator grant by this audit.
  const ready = env.handles;
  return {
    expected: expected.length,
    ready: expected.filter((handle) => ready.has(handle)).length,
    missing: expected.filter((handle) => !ready.has(handle)).map((handle) => `@${handle}`),
    environmentMapValid: env.valid,
    environmentMap: env.mapName,
  };
}

async function youtubeStatus() {
  const expected = sourceHandles("youtube");
  const [socialFeed, groupConfig] = await Promise.all([
    readFile(new URL("../lib/social-feed.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/group.ts", import.meta.url), "utf8"),
  ]);
  const mappingBlock = /const ROSTER_YOUTUBE_CHANNEL_IDS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(socialFeed)?.[1] ?? "";
  const checkedInKeys = new Set(
    [...mappingBlock.matchAll(/^\s*([a-z0-9_]+):\s*"UC[0-9A-Za-z_-]{22}"/gim)].map((match) => match[1]),
  );
  const groupYoutube = sourceHandles("youtube")[0];
  if (/channelId:\s*"UC[0-9A-Za-z_-]{22}"/.test(groupConfig) && groupYoutube) {
    checkedInKeys.add(groupYoutube);
  }
  const override = parseAccountMap(
    "YOUTUBE_CHANNEL_IDS_JSON",
    (value) => /^UC[0-9A-Za-z_-]{22}$/.test(value.trim()),
  );
  const direct = expected.filter((handle) => checkedInKeys.has(handle) || override.handles.has(handle));
  const missingDirect = expected.filter((handle) => !direct.includes(handle));
  return {
    expected: expected.length,
    directRssMappings: direct.length,
    missingDirect: missingDirect.map((handle) => `@${handle}`),
    dataApiEnrichment: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    overridesValid: override.valid,
    knownDead: [],
  };
}

const vault = await readVaultGrants();
const youtube = await youtubeStatus();
const tiktok = providerGrantStatus("tiktok");
const instagram = providerGrantStatus("instagram");
const xCommunities = xCommunityStatus();
const xMonitoring = await readXMonitoring();
const webhookMonitoring = await readWebhookMonitoring();
const xRoster = xRosterOwnership();
const cachedXOwners = new Set(xMonitoring.feedSnapshot?.owners ?? []);
const xSnapshotRefreshedMs = Date.parse(xMonitoring.feedSnapshot?.refreshed_at ?? "");
const xSnapshotAgeHours = Number.isFinite(xSnapshotRefreshedMs)
  ? Math.max(0, (Date.now() - xSnapshotRefreshedMs) / 3_600_000)
  : null;
const xSnapshotCoverage = {
  ownersWithPosts: xRoster.accounts.filter((account) => cachedXOwners.has(account.owner)).length,
  expectedOwners: xRoster.expected,
  missing: xRoster.accounts.filter((account) => !cachedXOwners.has(account.owner)).map((account) => account.owner),
  ageHours: xSnapshotAgeHours === null ? null : Math.round(xSnapshotAgeHours * 10) / 10,
  productionFresh: xSnapshotAgeHours !== null && xSnapshotAgeHours <= X_PUBLIC_MAX_AGE_HOURS,
  localQaUsable: xSnapshotAgeHours !== null && xSnapshotAgeHours <= X_LOCAL_QA_MAX_AGE_HOURS,
};
const xConnections = vault.rows.filter((row) => row.provider === "x");
const xWriteScopes = ["tweet.read", "users.read", "offline.access", "like.write", "tweet.write", "follows.write"];
const xWriteReadyAccounts = xConnections.filter((row) => {
  const scopes = new Set(String(row.scopes ?? "").split(/[\s,]+/).filter(Boolean));
  return xWriteScopes.every((scope) => scopes.has(scope));
}).length;
const xCredits = positiveNumber("X_API_CREDIT_BALANCE_USD");
const xCeiling = positiveNumber("X_API_MONTHLY_CEILING_USD");
const xWriteUnit = positiveNumber("X_API_WRITE_ACTION_UNIT_USD");
const webhookOrigin = publicWebhookOrigin();
const twitchEventSubSecret = process.env.TWITCH_EVENTSUB_SECRET?.trim() ?? "";
const youtubeWebhookSecret = process.env.YOUTUBE_WEBHOOK_SECRET?.trim() ?? "";
const youtubeVerifyToken = process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
const metaVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
const metaAppSecret = (
  process.env.META_APP_SECRET ||
  process.env.FACEBOOK_APP_SECRET ||
  process.env.INSTAGRAM_CLIENT_SECRET ||
  ""
).trim();
const provisionerSecret = (
  process.env.SOCIAL_SUBSCRIPTION_CRON_SECRET ||
  process.env.METRICS_CRON_SECRET ||
  ""
).trim();
const notificationDeliveryEnabled = process.env.SOCIAL_NOTIFICATIONS_DELIVERY_ENABLED === "true";
const pushConfigured = Boolean(
  process.env.VAPID_PUBLIC_KEY?.trim() &&
  process.env.VAPID_PRIVATE_KEY?.trim() &&
  /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(process.env.VAPID_SUBJECT?.trim() ?? "")
);
const emailFrom = (process.env.RESEND_FROM_EMAIL?.trim() || "notifications@thecoreboys.com").toLowerCase();
const emailConfigured = Boolean(
  process.env.RESEND_API_KEY?.trim() &&
  /^[^\s@]+@thecoreboys\.com$/i.test(emailFrom)
);
const emailEnabled = process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
const report = {
  twitch: {
    helixApp: Boolean(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim()),
    rosterChannels: MEMBERS.filter((member) => member.socials.some((social) => social.platform === "twitch")).length,
  },
  youtube,
  tiktok: {
    creatorTokenMapOnly: true,
    viewerOauthApp: Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim()),
    ...tiktok,
  },
  instagram: {
    creatorTokenMapOnly: true,
    viewerOauthApp: Boolean(
      (process.env.INSTAGRAM_CLIENT_ID?.trim() && process.env.INSTAGRAM_CLIENT_SECRET?.trim()) ||
      (process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim()),
    ),
    ...instagram,
  },
  x: {
    oauthApp: Boolean(process.env.X_CLIENT_ID?.trim() && process.env.X_CLIENT_SECRET?.trim()),
    appBearer: Boolean(process.env.X_BEARER_TOKEN?.trim()),
    rosterAccounts: xRoster.configured,
    rosterOwnership: xRoster,
    snapshotCoverage: xSnapshotCoverage,
    linkedFanAccounts: xConnections.length,
    writeScopeAccounts: xWriteReadyAccounts,
    feedRefreshMinutes: Math.max(5, Math.min(1440, Number(process.env.X_FEED_REFRESH_MINUTES) || 5)),
    communities: xCommunities,
    featuredPostsConfigured: Boolean(process.env.X_FEATURED_POST_IDS?.trim() && process.env.X_FEATURED_POST_IDS.trim() !== "[]"),
    nativeWrites: {
      explicitEnable: process.env.X_NATIVE_ACTIONS_ENABLED === "true",
      creditBalanceDeclared: xCredits > 0,
      monthlyCeilingUsd: xCeiling,
      writeUnitEstimateConfigured: xWriteUnit > 0,
      ready: process.env.X_NATIVE_ACTIONS_ENABLED === "true" && xCredits > 0 && xCeiling > 0 && xWriteUnit > 0,
    },
    readUnitEstimates: {
      post: positiveNumber("X_API_READ_POST_UNIT_USD") > 0,
      user: positiveNumber("X_API_READ_USER_UNIT_USD") > 0,
    },
    communityPublishing: {
      enabled: false,
      reason: "x_community_publish_api_undocumented",
    },
    monitoring: xMonitoring,
  },
  vault: {
    state: vault.state,
    ...(vault.reason ? { reason: vault.reason } : {}),
  },
  webhooks: {
    publicHttpsOrigin: Boolean(webhookOrigin),
    origin: webhookOrigin,
    provisionerAuth: Boolean(provisionerSecret),
    twitch: Boolean(
      webhookOrigin &&
      process.env.TWITCH_CLIENT_ID?.trim() &&
      process.env.TWITCH_CLIENT_SECRET?.trim() &&
      twitchEventSubSecret.length >= 10 &&
      twitchEventSubSecret.length <= 100
    ),
    youtube: Boolean(webhookOrigin && youtubeWebhookSecret && youtubeVerifyToken),
    tiktok: Boolean(
      webhookOrigin &&
      process.env.TIKTOK_CLIENT_KEY?.trim() &&
      process.env.TIKTOK_CLIENT_SECRET?.trim()
    ),
    meta: Boolean(
      webhookOrigin &&
      (
        (process.env.INSTAGRAM_CLIENT_ID?.trim() && process.env.INSTAGRAM_CLIENT_SECRET?.trim()) ||
        (process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim())
      ) &&
      metaAppSecret &&
      metaVerifyToken
    ),
    monitoring: webhookMonitoring,
  },
  notifications: {
    inApp: true,
    deliveryEnabled: notificationDeliveryEnabled,
    pushConfigured,
    pushReady: notificationDeliveryEnabled && pushConfigured,
    emailConfigured,
    emailEnabled,
    emailReady: notificationDeliveryEnabled && emailEnabled && emailConfigured,
  },
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const yesNo = (value) => value ? "configured" : "missing";
  console.log("CORE social media connectivity (no secrets shown)");
  console.log(`Twitch Helix credentials: ${yesNo(report.twitch.helixApp)}; roster channels: ${report.twitch.rosterChannels}/${MEMBERS.length}`);
  console.log(
    `YouTube RSS mappings: ${youtube.directRssMappings}/${youtube.expected}; Data API enrichment: ${yesNo(youtube.dataApiEnrichment)}`,
  );
  if (youtube.missingDirect.length) console.log(`  YouTube unresolved: ${youtube.missingDirect.join(", ")}`);
  for (const warning of youtube.knownDead) console.log(`  Known dead source: ${warning}`);
  console.log(`TikTok creator token map: ${tiktok.ready}/${tiktok.expected}; viewer OAuth app: ${yesNo(report.tiktok.viewerOauthApp)}`);
  if (tiktok.missing.length) console.log(`  TikTok missing: ${tiktok.missing.join(", ")}`);
  console.log(`Instagram creator token map: ${instagram.ready}/${instagram.expected}; viewer OAuth app: ${yesNo(report.instagram.viewerOauthApp)}`);
  if (instagram.missing.length) console.log(`  Instagram missing: ${instagram.missing.join(", ")}`);
  console.log(`X roster mapping: ${xRoster.configured}/${xRoster.expected} accounts; OAuth app: ${yesNo(report.x.oauthApp)}; bearer: ${yesNo(report.x.appBearer)}`);
  if (xRoster.missing.length) console.log(`  X profiles missing: ${xRoster.missing.join(", ")}`);
  const xSnapshotState = xSnapshotCoverage.productionFresh
    ? "production-fresh"
    : xSnapshotCoverage.localQaUsable
      ? "stale for production; available to local QA"
      : "stale";
  console.log(`  Cached X owner coverage: ${xSnapshotCoverage.ownersWithPosts}/${xSnapshotCoverage.expectedOwners} (${xSnapshotState})`);
  if (xSnapshotCoverage.missing.length) console.log(`  No recent cached post: ${xSnapshotCoverage.missing.join(", ")}`);
  console.log(`  X creator Communities configured: ${xCommunities.requiredConfigured}/${xCommunities.requiredExpected}; config: ${xCommunities.valid ? "valid" : "invalid"}`);
  if (xCommunities.missingRequired.length) console.log(`  X creator Communities missing: ${xCommunities.missingRequired.join(", ")}`);
  if (xCommunities.missing.includes("core")) console.log("  CORE network Community: not configured (no verified official Community)");
  console.log(`  X native writes: ${report.x.nativeWrites.ready ? "enabled + budget-gated" : "safely disabled"}; step-up accounts: ${xWriteReadyAccounts}`);
  console.log(`  X usage/cache monitoring: ${xMonitoring.state}`);
  console.log(`Encrypted OAuth vault: ${vault.state}${vault.reason ? ` (${vault.reason})` : ""}`);
  console.log(
    `Signed webhook readiness: public HTTPS origin ${yesNo(report.webhooks.publicHttpsOrigin)}; provisioner auth ${yesNo(report.webhooks.provisionerAuth)}`,
  );
  console.log(
    `  Twitch EventSub: ${report.webhooks.twitch ? "ready" : "missing"}; YouTube WebSub: ${report.webhooks.youtube ? "ready" : "missing"}; TikTok: ${report.webhooks.tiktok ? "ready" : "missing"}; Meta: ${report.webhooks.meta ? "ready" : "missing"}`,
  );
  console.log(`  Provider verification monitoring: ${webhookMonitoring.state}`);
  for (const source of webhookMonitoring.sources) {
    const receipts = webhookMonitoring.receipts24h.find((row) => row.provider === source.provider)?.receipts ?? 0;
    console.log(`    ${source.provider}: ${source.verified}/${source.total} sources verified; ${receipts} signed receipts in 24h`);
  }
  console.log(
    `Notification delivery: in-app ready; VAPID ${yesNo(report.notifications.pushConfigured)}; push ${report.notifications.pushReady ? "ready" : "disabled"}; Resend ${yesNo(report.notifications.emailConfigured)}; email ${report.notifications.emailReady ? "ready" : "disabled"}`,
  );
  if (!tiktok.environmentMapValid) console.log(`  Invalid JSON: ${tiktok.environmentMap}`);
  if (!instagram.environmentMapValid) console.log(`  Invalid JSON: ${instagram.environmentMap}`);
  if (!youtube.overridesValid) console.log("  Invalid JSON: YOUTUBE_CHANNEL_IDS_JSON");
}

const incomplete =
  !report.twitch.helixApp ||
  youtube.directRssMappings < youtube.expected ||
  !youtube.dataApiEnrichment ||
  tiktok.ready < tiktok.expected ||
  instagram.ready < instagram.expected ||
  !tiktok.environmentMapValid ||
  !instagram.environmentMapValid ||
  !report.x.appBearer ||
  xRoster.configured < xRoster.expected ||
  !xSnapshotCoverage.productionFresh ||
  !xCommunities.valid ||
  xCommunities.missingRequired.length > 0 ||
  !youtube.overridesValid ||
  !report.webhooks.publicHttpsOrigin ||
  !report.webhooks.provisionerAuth ||
  !report.webhooks.twitch ||
  !report.webhooks.youtube ||
  // TikTok and Instagram post refreshes have a scheduled polling fallback;
  // webhooks make them faster but are not required for fresh creator feeds.
  false;

if (strict && incomplete) process.exitCode = 1;
