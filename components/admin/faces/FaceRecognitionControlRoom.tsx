"use client";

import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Eye,
  FileCheck2,
  FileImage,
  History,
  Link2,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  EMPTY_FACE_OVERVIEW,
  parseFaceOverview,
  type FaceAdminOverview,
  type FaceCanonicalPerson,
  type FaceIdentity,
  type FaceReview,
  type FaceSource,
} from "./types";

type TabId = "people" | "enrollment" | "sources" | "review" | "published";
type ApiState = "loading" | "ready" | "unavailable" | "error";
type JsonMethod = "POST" | "PUT" | "PATCH" | "DELETE";

const TABS: Array<{ id: TabId; label: string; icon: typeof Users }> = [
  { id: "people", label: "People & consent", icon: UserCheck },
  { id: "enrollment", label: "Enrollment", icon: ScanFace },
  { id: "sources", label: "Sources & jobs", icon: Radio },
  { id: "review", label: "Review queue", icon: Eye },
  { id: "published", label: "Published & audit", icon: History },
];

const inputClass =
  "mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition placeholder:text-placeholder focus:border-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-55";
const textareaClass = `${inputClass} min-h-24 resize-y py-2.5`;
const buttonBase =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${buttonBase} bg-brand-solid text-white hover:bg-brand-solid_hover`;
const secondaryButton = `${buttonBase} border border-secondary bg-primary text-secondary shadow-xs hover:bg-secondary`;
const destructiveButton = `${buttonBase} bg-error-solid text-white hover:bg-error-solid_hover`;

function toLocalDateTimeInput(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type Mutate = (
  busyKey: string,
  path: string,
  method: JsonMethod,
  body: Record<string, unknown> | null,
  successMessage: string,
) => Promise<boolean>;

export function FaceRecognitionControlRoom({
  people,
  apiBase = "/api/admin/faces",
}: {
  people: FaceCanonicalPerson[];
  apiBase?: string;
}) {
  const [tab, setTab] = useState<TabId>("people");
  const [overview, setOverview] = useState<FaceAdminOverview>(EMPTY_FACE_OVERVIEW);
  const [apiState, setApiState] = useState<ApiState>("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setApiState("loading");
      setError(null);
      try {
        const response = await fetch(apiBase, {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (response.status === 404 || response.status === 501) {
          setOverview(EMPTY_FACE_OVERVIEW);
          setApiState("unavailable");
          return;
        }
        const json = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(readApiError(json) ?? "Unable to load face-tagging controls.");
        }
        const normalized = parseFaceOverview(json);
        if (!normalized.ok) {
          setOverview(EMPTY_FACE_OVERVIEW);
          setApiState("error");
          setError("The face-control API returned an invalid or incomplete response. Controls are read-only until it is repaired.");
          return;
        }
        setOverview(normalized.overview);
        setApiState("ready");
      } catch (loadError) {
        setOverview(EMPTY_FACE_OVERVIEW);
        setApiState("error");
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load face-tagging controls.",
        );
      }
    },
    [apiBase],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback<Mutate>(
    async (busyKey, path, method, body, successMessage) => {
      if (apiState !== "ready") return false;
      setBusy(busyKey);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method,
          headers: body ? { "content-type": "application/json", accept: "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) throw new Error(readApiError(json) ?? "The face-tagging action failed.");
        const pendingDeletion = Boolean(
          json && typeof json === "object"
          && ("deletionPending" in json && json.deletionPending === true
            || "localTemplatePurgePending" in json && json.localTemplatePurgePending === true),
        );
        setNotice(pendingDeletion
          ? "Deletion is queued: public presence is withdrawn, but protected file or local-template purge still awaits worker confirmation."
          : successMessage);
        await load(true);
        return true;
      } catch (mutationError) {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : "The face-tagging action failed.",
        );
        return false;
      } finally {
        setBusy(null);
      }
    },
    [apiBase, apiState, load],
  );

  const uploadReference = useCallback(
    async (identityId: string, formData: FormData) => {
      if (apiState !== "ready") return false;
      const busyKey = `reference-upload:${identityId}`;
      setBusy(busyKey);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch(
          `${apiBase}/identities/${encodeURIComponent(identityId)}/references`,
          { method: "POST", body: formData, headers: { accept: "application/json" } },
        );
        const json = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) throw new Error(readApiError(json) ?? "Reference upload failed.");
        setNotice("Reference submitted for quality review. It was not auto-enrolled.");
        await load(true);
        return true;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Reference upload failed.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [apiBase, apiState, load],
  );

  const apiAvailable = apiState === "ready";
  const metrics = [
    { label: "Consented adults", value: overview.counts.consentedAdults, icon: ShieldCheck },
    { label: "Enrolled", value: overview.counts.enrolled, icon: ScanFace },
    { label: "Needs review", value: overview.counts.pendingReview, icon: Eye },
    { label: "Active sources", value: overview.counts.activeSources, icon: Activity },
    { label: "Published now", value: overview.counts.published, icon: Link2 },
  ];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-secondary bg-primary shadow-sm">
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-brand-secondary">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-primary">Safety status</h2>
                {apiState === "loading" ? (
                  <StatusPill tone="neutral">Checking</StatusPill>
                ) : !apiAvailable ? (
                  <StatusPill tone="warning">API unavailable</StatusPill>
                ) : (
                  <StatusPill tone={overview.service.status === "ready" ? "success" : "warning"}>
                    {humanize(overview.service.status)}
                  </StatusPill>
                )}
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-tertiary">
                Recognition is closed-set and opt-in. Unknown faces stay unknown. Approval never publishes a tag automatically, and profile photos shown here are not enrollment assets.
              </p>
              {apiAvailable ? (
                <p className="mt-2 text-xs text-quaternary">
                  API {overview.apiVersion}
                  {overview.service.analyzerVersion ? ` · analyzer ${overview.service.analyzerVersion}` : ""}
                  {overview.service.lastHeartbeatAt
                    ? ` · heartbeat ${formatDateTime(overview.service.lastHeartbeatAt)}`
                    : " · no analyzer heartbeat reported"}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => void load()}
            disabled={apiState === "loading"}
          >
            <RefreshCw className={`size-4 ${apiState === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </section>

      {apiState === "unavailable" ? (
        <Message tone="warning" role="status">
          The local admin API has not been installed yet. Canonical people remain visible for planning, but enrollment states, counts, review items, and controls stay unavailable instead of being guessed.
        </Message>
      ) : null}
      {overview.service.message && apiAvailable ? (
        <Message tone="warning" role="status">{overview.service.message}</Message>
      ) : null}
      {error ? <Message tone="error" role="alert">{error}</Message> : null}
      {notice ? <Message tone="success" role="status">{notice}</Message> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Face-tagging status counts">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
              <div className="flex items-center gap-2 text-tertiary">
                <Icon className="size-4" aria-hidden="true" />
                <span className="text-xs font-medium">{metric.label}</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-primary">
                {apiAvailable ? metric.value.toLocaleString() : "—"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-secondary bg-primary p-1" role="tablist" aria-label="Face-tagging administration sections">
        <div className="flex min-w-max gap-1">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`face-tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`face-panel-${item.id}`}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  tab === item.id
                    ? "bg-brand-primary text-brand-secondary"
                    : "text-tertiary hover:bg-secondary hover:text-primary"
                }`}
                onClick={() => setTab(item.id)}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
                {item.id === "review" && apiAvailable && overview.counts.pendingReview > 0 ? (
                  <span className="rounded-full bg-brand-solid px-1.5 py-0.5 text-[10px] leading-none text-white">
                    {overview.counts.pendingReview}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {apiState === "loading" ? (
        <LoadingState />
      ) : tab === "people" ? (
        <PeopleConsentPanel
          panelId="face-panel-people"
          people={people}
          identities={overview.identities}
          apiAvailable={apiAvailable}
          busy={busy}
          mutate={mutate}
        />
      ) : tab === "enrollment" ? (
        <EnrollmentPanel
          panelId="face-panel-enrollment"
          identities={overview.identities}
          people={people}
          apiAvailable={apiAvailable}
          busy={busy}
          mutate={mutate}
          uploadReference={uploadReference}
        />
      ) : tab === "sources" ? (
        <SourcesPanel
          panelId="face-panel-sources"
          sources={overview.sources}
          jobs={overview.jobs}
          identities={overview.identities}
          people={people}
          apiAvailable={apiAvailable}
          busy={busy}
          mutate={mutate}
        />
      ) : tab === "review" ? (
        <ReviewPanel
          panelId="face-panel-review"
          reviews={overview.reviews}
          sources={overview.sources}
          identities={overview.identities}
          apiAvailable={apiAvailable}
          busy={busy}
          mutate={mutate}
        />
      ) : (
        <PublishedAuditPanel
          panelId="face-panel-published"
          published={overview.published}
          audit={overview.audit}
          people={people}
          apiAvailable={apiAvailable}
          busy={busy}
          mutate={mutate}
        />
      )}
    </div>
  );
}

function PeopleConsentPanel({
  panelId,
  people,
  identities,
  apiAvailable,
  busy,
  mutate,
}: {
  panelId: string;
  people: FaceCanonicalPerson[];
  identities: FaceIdentity[];
  apiAvailable: boolean;
  busy: string | null;
  mutate: Mutate;
}) {
  const [selectedKey, setSelectedKey] = useState(people[0]?.key ?? "");
  const records = useMemo(
    () => new Map(identities.map((identity) => [identity.canonicalKey, identity])),
    [identities],
  );
  const person = people.find((item) => item.key === selectedKey) ?? people[0] ?? null;
  const identity = person ? records.get(person.key) ?? null : null;

  if (!person) {
    return <EmptyPanel panelId={panelId} title="No canonical people" detail="Add a member or crew profile before creating a consent record." />;
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby="face-tab-people" className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
      <Panel
        icon={<Users className="size-5" />}
        title="Canonical people"
        description="These profiles provide names and approved social destinations only. Their portraits are never submitted to the analyzer."
      >
        <ul className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
          {people.map((item) => {
            const record = records.get(item.key);
            const selected = item.key === person.key;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    selected ? "border-brand bg-brand-primary" : "border-secondary bg-primary hover:bg-secondary"
                  }`}
                  aria-pressed={selected}
                  onClick={() => setSelectedKey(item.key)}
                >
                  <PersonAvatar person={item} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-primary">{item.displayName}</span>
                    <span className="block truncate text-xs capitalize text-tertiary">{item.kind} · {item.secondaryLabel}</span>
                  </span>
                  {!apiAvailable ? (
                    <StatusPill tone="neutral">Unknown</StatusPill>
                  ) : (
                    <ConsentStatus identity={record} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <ConsentEditor
        key={`${person.key}:${identity?.updatedAt ?? "new"}`}
        person={person}
        identity={identity}
        apiAvailable={apiAvailable}
        busy={busy}
        mutate={mutate}
      />
    </div>
  );
}

function ConsentEditor({
  person,
  identity,
  apiAvailable,
  busy,
  mutate,
}: {
  person: FaceCanonicalPerson;
  identity: FaceIdentity | null;
  apiAvailable: boolean;
  busy: string | null;
  mutate: Mutate;
}) {
  const consent = identity?.consent;
  const [adultConfirmed, setAdultConfirmed] = useState(consent?.adultConfirmed ?? false);
  const [templateCreation, setTemplateCreation] = useState(consent?.templateCreation ?? false);
  const liveMatching = false;
  const [archiveMatching, setArchiveMatching] = useState(consent?.archiveMatching ?? false);
  const [publicTagging, setPublicTagging] = useState(consent?.publicTagging ?? false);
  const [socialLinking, setSocialLinking] = useState(consent?.socialLinking ?? false);
  const [confirmationMethod, setConfirmationMethod] = useState(consent?.confirmationMethod ?? "");
  const [evidenceReference, setEvidenceReference] = useState(consent?.evidenceReference ?? "");
  const [subjectConfirmedAt, setSubjectConfirmedAt] = useState(
    consent?.subjectConfirmedAt ? toLocalDateTimeInput(consent.subjectConfirmedAt) : toLocalDateTimeInput(new Date()),
  );
  const [expiresAt, setExpiresAt] = useState(consent?.expiresAt ? toLocalDateTimeInput(consent.expiresAt) : "");
  const [approvedArchiveScopesText, setApprovedArchiveScopesText] = useState(
    (consent?.approvedArchiveScopes ?? [])
      .map((scope) => `${scope.contentId} | ${scope.startMs} | ${scope.endMs}`)
      .join("\n"),
  );
  const [subjectAttested, setSubjectAttested] = useState(false);
  const [replacementConfirmed, setReplacementConfirmed] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const target = identity?.id ?? person.key;
  const replacesActiveConsent = consent?.status === "active";
  const purposesSelected = templateCreation || liveMatching || archiveMatching || publicTagging || socialLinking;
  const scopeLines = approvedArchiveScopesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsedScopes = scopeLines.map((line) => {
    const [contentId = "", start = "", end = "", ...extra] = line.split("|").map((value) => value.trim());
    const startMs = Number(start);
    const endMs = Number(end);
    if (extra.length > 0 || !contentId || contentId.length > 300 || contentId === "*"
      || contentId.includes("://") || /[\u0000-\u0020\u007f]/.test(contentId)
      || !Number.isSafeInteger(startMs) || startMs < 0
      || !Number.isSafeInteger(endMs) || endMs <= startMs) return null;
    return { contentId, startMs, endMs };
  });
  const approvedArchiveScopes = parsedScopes.filter((scope): scope is NonNullable<typeof scope> => scope !== null);
  const approvedContentIds = [...new Set(approvedArchiveScopes.map((scope) => scope.contentId))];
  const scopeRequired = archiveMatching || publicTagging;
  const purposesCoherent = (!archiveMatching || templateCreation) && (!publicTagging || socialLinking);
  const now = Date.now();
  const confirmedMs = Date.parse(subjectConfirmedAt);
  const expiryMs = Date.parse(expiresAt);
  const confirmationTimeValid = Number.isFinite(confirmedMs)
    && confirmedMs <= now + 5 * 60_000
    && confirmedMs >= now - 30 * 24 * 60 * 60_000;
  const expiryValid = Number.isFinite(expiryMs)
    && expiryMs > now
    && expiryMs > confirmedMs
    && expiryMs <= now + 366 * 24 * 60 * 60_000;
  const contentScopeValid = !scopeRequired || (
    scopeLines.length > 0 && parsedScopes.every(Boolean)
    && approvedArchiveScopes.length <= 100
    && approvedContentIds.length > 0
    && approvedContentIds.length <= 100
    && approvedContentIds.every((value) => value.length <= 300 && value !== "*" && !value.includes("://"))
  );
  const canSave = apiAvailable && adultConfirmed && purposesSelected && purposesCoherent
    && Boolean(confirmationMethod) && evidenceReference.trim().length >= 3
    && subjectAttested && (!replacesActiveConsent || replacementConfirmed)
    && confirmationTimeValid && expiryValid && contentScopeValid;
  const saveBusy = busy === `consent:${target}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    const saved = await mutate(
      `consent:${target}`,
      `/identities/${encodeURIComponent(target)}/consent`,
      "PUT",
      {
        canonicalKey: person.key,
        adultConfirmed,
        subjectConfirmed: true,
        subjectConfirmedAt: new Date(subjectConfirmedAt).toISOString(),
        confirmationMethod,
        evidenceReference: evidenceReference.trim(),
        expiresAt: new Date(expiresAt).toISOString(),
        approvedContentIds,
        approvedArchiveScopes,
        purposes: {
          templateCreation,
          liveMatching,
          archiveMatching,
          publicTagging,
          socialLinking,
        },
        replaceActiveConsent: replacesActiveConsent && replacementConfirmed,
      },
      replacesActiveConsent
        ? `Consent grant replaced for ${person.displayName}. The previous enrollment was retired; fresh references and enrollment are required.`
        : `Consent record saved for ${person.displayName}. No reference was enrolled.`,
    );
    if (saved) setReplacementConfirmed(false);
  }

  return (
    <Panel
      icon={<ShieldCheck className="size-5" />}
      title={`${person.displayName} · consent`}
      description="An administrator records the subject's decision; an administrator cannot grant consent on the subject's behalf."
      actions={<ConsentStatus identity={identity ?? undefined} />}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-secondary p-3">
        <Link href={person.profileHref as never} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-secondary hover:underline">
          Canonical profile <ExternalLink className="size-3.5" />
        </Link>
        {person.socials.map((social) => (
          <a key={`${social.platform}:${social.url}`} href={social.url} target="_blank" rel="noreferrer" className="rounded-full border border-secondary bg-primary px-2.5 py-1 text-xs font-medium text-tertiary hover:text-primary">
            {social.handle ? `${social.platform} · ${social.handle}` : social.label ?? social.platform}
          </a>
        ))}
      </div>

      {!apiAvailable ? (
        <Empty title="Consent API unavailable" detail="This form is read-only until the server can return and persist an actual consent record." />
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-primary">Eligibility and direct confirmation</legend>
            <CheckRow
              checked={adultConfirmed}
              onChange={setAdultConfirmed}
              label="The subject confirmed they are 18 or older"
              detail="Do not enroll minors. If age cannot be confirmed, leave this off."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="How the subject confirmed">
                <select className={inputClass} value={confirmationMethod} onChange={(event) => setConfirmationMethod(event.target.value as typeof confirmationMethod)} required>
                  <option value="">Select a method</option>
                  <option value="signed_release">Signed release</option>
                  <option value="subject_portal">Subject portal confirmation</option>
                </select>
              </Field>
              <Field label="Subject confirmed at" hint="Required; record the subject's actual confirmation time (within the last 30 days).">
                <input className={inputClass} type="datetime-local" value={subjectConfirmedAt} onChange={(event) => setSubjectConfirmedAt(event.target.value)} required />
              </Field>
              <Field label="Consent expires" hint="Required; future and no more than 366 days from now.">
                <input className={inputClass} type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required />
              </Field>
            </div>
            <Field label="Evidence reference" hint="Store an internal release ID or recording timestamp, not a public URL containing private data.">
              <input className={inputClass} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="release-2026-0042" autoComplete="off" />
            </Field>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-primary">Allowed purposes</legend>
            <p className="text-xs leading-relaxed text-tertiary">Each purpose is independent. Turning off matching does not silently leave public tagging or social linking enabled.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckRow checked={templateCreation} onChange={setTemplateCreation} label="Create face template" detail="Generate a fixed local embedding from subject-approved references." />
              <CheckRow checked={false} onChange={() => undefined} disabled label="Match controlled live streams" detail="Not available in the archive/VOD-only v1 launch." />
              <CheckRow checked={archiveMatching} onChange={setArchiveMatching} label="Match approved archives" detail="Scan only authorized VODs or clips." />
              <CheckRow checked={publicTagging} onChange={setPublicTagging} label="Show public name tag" detail="A reviewed presence can appear to viewers; canonical profile linking must also be granted." />
              <CheckRow checked={socialLinking} onChange={setSocialLinking} label="Link profile and socials" detail="This independent choice may be granted without public tagging." />
            </div>
            <Field label="Approved archive intervals" hint="Required for archive matching or public tags. One line each: content ID | start ms | end ms. The full reviewed track must stay inside a range.">
              <textarea className={textareaClass} value={approvedArchiveScopesText} onChange={(event) => setApprovedArchiveScopesText(event.target.value)} placeholder={"vod-123456 | 120000 | 420000\nyt-dQw4w9WgXcQ | 0 | 90000"} />
            </Field>
            {!purposesCoherent ? <Message tone="warning" role="alert">Archive matching requires template creation. Public tags require canonical profile/social linking.</Message> : null}
            {!confirmationTimeValid || !expiryValid ? <Message tone="warning" role="alert">Enter the visible subject-confirmation time and a future expiry no more than 366 days away.</Message> : null}
            {!contentScopeValid ? <Message tone="warning" role="alert">Add valid bounded archive scopes as “content ID | start ms | end ms.” URLs, wildcards, open-ended ranges, and live IDs are not accepted.</Message> : null}
          </fieldset>

          <CheckRow
            checked={subjectAttested}
            onChange={setSubjectAttested}
            label="I am recording the subject's own, specific choice"
            detail="This is not permission to scrape photos, enroll from a profile portrait, or infer consent from appearing on stream."
          />

          {replacesActiveConsent ? (
            <div className="space-y-3 rounded-xl border border-warning_subtle bg-warning-primary p-4">
              <Message tone="warning" role="alert">
                Replacing an active consent grant immediately disables its source assignments, withdraws its published tags, queues its references for deletion, and retires its local templates. The subject must be enrolled again under the new grant.
              </Message>
              <CheckRow
                checked={replacementConfirmed}
                onChange={setReplacementConfirmed}
                label="Replace the active grant and require re-enrollment"
                detail="Use this only when the subject has signed or confirmed the new scope shown above."
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-secondary pt-4">
            <button type="submit" className={primaryButton} disabled={!canSave || saveBusy}>
              {saveBusy ? <LoaderCircle className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
              {replacesActiveConsent ? "Replace consent grant" : "Save consent only"}
            </button>
            {identity && consent?.status !== "revoked" ? (
              <button type="button" className={secondaryButton} onClick={() => setRevokeOpen(true)}>
                <Ban className="size-4" /> Revoke all purposes
              </button>
            ) : null}
            {identity ? (
              <button type="button" className={secondaryButton} onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" /> Delete biometric record
              </button>
            ) : null}
          </div>

          {revokeOpen ? (
            <ConfirmationBox title="Revoke consent and stop matching" detail="This immediately removes the person from every source allowlist and queues template/reference deletion according to policy.">
              <Field label="Reason">
                <textarea className={textareaClass} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="Subject requested revocation…" />
              </Field>
              <CheckRow checked={revokeConfirmed} onChange={setRevokeConfirmed} label="I understand this stops every matching and publishing purpose" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={destructiveButton}
                  disabled={!revokeConfirmed || revokeReason.trim().length < 10 || busy === `consent-revoke:${target}`}
                  onClick={() => void mutate(`consent-revoke:${target}`, `/identities/${encodeURIComponent(target)}/consent/revoke`, "POST", { reason: revokeReason.trim() }, `Consent revoked for ${person.displayName}.`)}
                >
                  Revoke consent
                </button>
                <button type="button" className={secondaryButton} onClick={() => setRevokeOpen(false)}>Cancel</button>
              </div>
            </ConfirmationBox>
          ) : null}

          {deleteOpen ? (
            <ConfirmationBox title="Permanently delete biometric data" detail={`Type “${person.displayName}” to confirm deletion of templates and reference assets. The canonical public profile is not deleted.`}>
              <Field label="Confirmation">
                <input className={inputClass} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={destructiveButton}
                  disabled={deleteConfirmation !== person.displayName || busy === `identity-delete:${target}`}
                  onClick={() => void mutate(`identity-delete:${target}`, `/identities/${encodeURIComponent(target)}`, "DELETE", { confirmation: deleteConfirmation }, `Biometric data purge confirmed for ${person.displayName}.`)}
                >
                  Delete templates and references
                </button>
                <button type="button" className={secondaryButton} onClick={() => setDeleteOpen(false)}>Cancel</button>
              </div>
            </ConfirmationBox>
          ) : null}
        </form>
      )}
    </Panel>
  );
}

function EnrollmentPanel({
  panelId,
  identities,
  people,
  apiAvailable,
  busy,
  mutate,
  uploadReference,
}: {
  panelId: string;
  identities: FaceIdentity[];
  people: FaceCanonicalPerson[];
  apiAvailable: boolean;
  busy: string | null;
  mutate: Mutate;
  uploadReference: (identityId: string, formData: FormData) => Promise<boolean>;
}) {
  const [identityId, setIdentityId] = useState(identities[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState("subject_provided");
  const [capturedAt, setCapturedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [subjectApproved, setSubjectApproved] = useState(false);
  const identity = identities.find((item) => item.id === identityId) ?? identities[0] ?? null;
  const canonical = identity ? people.find((item) => item.key === identity.canonicalKey) : null;
  const eligible = Boolean(
    identity?.consent.status === "active" &&
      identity.consent.adultConfirmed &&
      identity.consent.templateCreation,
  );

  useEffect(() => {
    if (!identityId && identities[0]?.id) setIdentityId(identities[0].id);
    if (identityId && identities.length > 0 && !identities.some((item) => item.id === identityId)) {
      setIdentityId(identities[0]?.id ?? "");
    }
  }, [identities, identityId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identity || !file || !eligible || !subjectApproved) return;
    const form = event.currentTarget;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("sourceKind", sourceKind);
    formData.set("capturedAt", capturedAt ? new Date(`${capturedAt}T12:00:00.000Z`).toISOString() : "");
    formData.set("notes", notes.trim());
    formData.set("subjectApproved", "true");
    const uploaded = await uploadReference(identity.id, formData);
    if (uploaded) {
      setFile(null);
      setCapturedAt("");
      setNotes("");
      setSubjectApproved(false);
      form.reset();
    }
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby="face-tab-enrollment" className="grid items-start gap-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
      <Panel icon={<Upload className="size-5" />} title="Submit a reference" description="Enrollment means reviewing subject-approved photos and creating fixed local templates. It is not model training and never starts from public profile photos.">
        {!apiAvailable ? (
          <Empty title="Enrollment API unavailable" detail="No local files will be selected or queued until the server can report consent state." />
        ) : identities.length === 0 ? (
          <Empty title="No consent records" detail="Record adult status, direct confirmation, and template-creation consent before submitting references." />
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Person">
              <select className={inputClass} value={identity?.id ?? ""} onChange={(event) => setIdentityId(event.target.value)}>
                {identities.map((item) => {
                  const person = people.find((candidate) => candidate.key === item.canonicalKey);
                  return <option key={item.id} value={item.id}>{person?.displayName ?? item.displayName} · {humanize(item.enrollmentStatus)}</option>;
                })}
              </select>
            </Field>

            {identity && !eligible ? (
              <Message tone="warning" role="status">Reference submission is locked. This person needs active adult confirmation and explicit template-creation consent.</Message>
            ) : null}

            <Field label="Reference image" hint="JPEG, PNG, or WebP supplied or approved by the subject. No screenshots scraped from social media.">
              <input
                className={`${inputClass} py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={!eligible}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reference source">
                <select className={inputClass} value={sourceKind} onChange={(event) => setSourceKind(event.target.value)} disabled={!eligible}>
                  <option value="subject_provided">Subject provided</option>
                  <option value="creator_session">Consented creator session</option>
                  <option value="licensed_archive">Authorized archive</option>
                </select>
              </Field>
              <Field label="Captured on" hint="Optional">
                <input className={inputClass} type="date" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} disabled={!eligible} />
              </Field>
            </div>
            <Field label="Review notes" hint="Do not include private identity documents.">
              <textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!eligible} placeholder="Lighting, angle, or approval context…" />
            </Field>
            <CheckRow checked={subjectApproved} onChange={setSubjectApproved} disabled={!eligible} label="The subject supplied or approved this exact image" detail="General consent does not approve every photo." />
            <button type="submit" className={primaryButton} disabled={!eligible || !file || !subjectApproved || busy === `reference-upload:${identity?.id ?? ""}`}>
              {busy === `reference-upload:${identity?.id ?? ""}` ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Submit for quality review
            </button>
          </form>
        )}
      </Panel>

      <Panel icon={<FileImage className="size-5" />} title={`${canonical?.displayName ?? identity?.displayName ?? "Reference"} · inventory`} description="Accepted references may produce templates only after quality review. Rejected and deleted items are never matchable." actions={identity ? <StatusPill tone={eligible ? "success" : "warning"}>{identity.templateCount} templates</StatusPill> : undefined}>
        {!apiAvailable ? (
          <Empty title="Inventory unavailable" detail="Reference counts and status come only from the admin API." />
        ) : !identity ? (
          <Empty title="Select a person" detail="Their subject-approved reference metadata will appear here." />
        ) : identity.references.length === 0 ? (
          <Empty title="No references" detail="Nothing has been submitted for this person." />
        ) : (
          <ul className="space-y-3">
            {identity.references.map((reference) => (
              <li key={reference.id} className="rounded-xl border border-secondary bg-secondary p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {reference.previewUrl ? (
                    // Private, admin-authenticated endpoint; never reuse this URL publicly.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={reference.previewUrl} alt={`Protected enrollment preview for ${reference.fileName}`} className="size-24 shrink-0 rounded-lg bg-black object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-primary">{reference.fileName}</p>
                    <p className="mt-1 text-xs text-tertiary">{humanize(reference.sourceKind)} · captured {reference.capturedAt ? formatDate(reference.capturedAt) : "not supplied"} · submitted {formatDateTime(reference.createdAt)}</p>
                    <p className="mt-1 text-xs text-tertiary">Uploader {reference.uploadedBy}{reference.reviewedBy ? ` · reviewer ${reference.reviewedBy}` : " · independent review pending"}</p>
                    {reference.reviewNote ? <p className="mt-1 text-xs text-tertiary">Reviewer note: {reference.reviewNote}</p> : null}
                    {reference.qualityIssues.length > 0 ? <p className="mt-2 text-xs text-warning-primary">Quality review: {reference.qualityIssues.join(", ")}</p> : null}
                  </div>
                  <StatusPill tone={reference.status === "accepted" ? "success" : reference.status === "rejected" ? "error" : reference.status === "deletion_pending" ? "warning" : "neutral"}>{humanize(reference.status)}</StatusPill>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {reference.status === "pending_review" ? (
                    <>
                      <button
                        type="button"
                        className={primaryButton}
                        disabled={busy === `reference-approve:${reference.id}`}
                        onClick={() => {
                          const note = window.prompt("Record a quality/identity review note. A different staff member from the uploader and consent recorder must approve.");
                          if (note === null) return;
                          if (note.trim().length < 3) return window.alert("Enter a short quality review note.");
                          void mutate(`reference-approve:${reference.id}`, `/identities/${encodeURIComponent(identity.id)}/references/${encodeURIComponent(reference.id)}`, "PATCH", { action: "approve", note: note.trim() }, "Independent reference approval recorded. The worker must still enroll and verify a local template set.");
                        }}
                      >
                        <CheckCircle2 className="size-4" /> Accept for enrollment
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={busy === `reference-reject:${reference.id}`}
                        onClick={() => {
                          const reason = window.prompt("Why is this reference unsuitable? It will be rejected and physically deleted.");
                          if (reason === null) return;
                          if (reason.trim().length < 3) return window.alert("Enter a rejection reason.");
                          void mutate(`reference-reject:${reference.id}`, `/identities/${encodeURIComponent(identity.id)}/references/${encodeURIComponent(reference.id)}`, "PATCH", { action: "reject", reason: reason.trim() }, "Reference rejected; physical deletion was requested.");
                        }}
                      >
                        <XCircle className="size-4" /> Reject reference
                      </button>
                    </>
                  ) : null}
                {reference.status !== "deleted" && reference.status !== "deletion_pending" ? (
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={busy === `reference-delete:${reference.id}`}
                    onClick={() => {
                      if (window.confirm(`Delete reference “${reference.fileName}”? Any derived template must also be removed by the server.`)) {
                        void mutate(`reference-delete:${reference.id}`, `/identities/${encodeURIComponent(identity.id)}/references/${encodeURIComponent(reference.id)}`, "DELETE", { confirmation: reference.fileName }, "Reference and its derived template were queued for deletion.");
                      }
                    }}
                  >
                    <Trash2 className="size-4" /> Delete reference
                  </button>
                ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function SourcesPanel({
  panelId,
  sources,
  jobs,
  identities,
  people,
  apiAvailable,
  busy,
  mutate,
}: {
  panelId: string;
  sources: FaceSource[];
  jobs: FaceAdminOverview["jobs"];
  identities: FaceIdentity[];
  people: FaceCanonicalPerson[];
  apiAvailable: boolean;
  busy: string | null;
  mutate: Mutate;
}) {
  return (
    <div id={panelId} role="tabpanel" aria-labelledby="face-tab-sources" className="space-y-4">
      <CreateSourceForm apiAvailable={apiAvailable} busy={busy} mutate={mutate} />
      <div className="grid gap-4 xl:grid-cols-2">
        {!apiAvailable ? (
          <div className="xl:col-span-2"><Empty title="Sources unavailable" detail="No source is assumed safe or active when the API cannot be reached." /></div>
        ) : sources.length === 0 ? (
          <div className="xl:col-span-2"><Empty title="No configured sources" detail="Add authorized OBS/live ingest or archive sources through the server configuration. Embedded Twitch and YouTube pixels are not scanned here." /></div>
        ) : sources.map((source) => (
          <SourceCard key={`${source.id}:${source.status}:${source.allowedIdentityIds.join(",")}`} source={source} identities={identities} people={people} busy={busy} mutate={mutate} />
        ))}
      </div>

      <Panel icon={<Clock3 className="size-5" />} title="Analyzer jobs" description="Progress and errors are reported by the worker; this page does not infer them from a source's presence.">
        <CreateJobForm sources={sources} apiAvailable={apiAvailable} busy={busy} mutate={mutate} />
        {!apiAvailable ? (
          <Empty title="Jobs unavailable" detail="Connect the API to see queued, running, and completed work." />
        ) : jobs.length === 0 ? (
          <Empty title="No analyzer jobs" detail="No live session, archive scan, or reference-processing job has been reported." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-secondary text-left text-sm">
              <thead><tr className="text-xs text-tertiary"><th className="px-3 py-2 font-medium">Job</th><th className="px-3 py-2 font-medium">Source</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Updated</th><th className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-secondary">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-3 py-3"><p className="font-medium text-primary">{humanize(job.kind)}</p>{job.progressPercent !== null ? <p className="mt-0.5 text-xs text-tertiary">{Math.max(0, Math.min(100, job.progressPercent))}% complete</p> : null}{job.errorMessage ? <p className="mt-1 text-xs text-error-primary">{job.errorMessage}</p> : null}</td>
                    <td className="px-3 py-3 text-secondary">{job.sourceName}</td>
                    <td className="px-3 py-3"><StatusPill tone={job.status === "failed" ? "error" : job.status === "completed" ? "success" : "neutral"}>{humanize(job.status)}</StatusPill></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-tertiary">{formatDateTime(job.updatedAt)}</td>
                    <td className="px-3 py-3 text-right">{job.status === "queued" || job.status === "running" ? <button type="button" className={secondaryButton} disabled={busy === `job-cancel:${job.id}`} onClick={() => void mutate(`job-cancel:${job.id}`, `/jobs/${encodeURIComponent(job.id)}/cancel`, "POST", { reason: "Cancelled by administrator" }, "Analyzer job cancelled.")}><XCircle className="size-4" /> Cancel</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function CreateJobForm({ sources, apiAvailable, busy, mutate }: { sources: FaceSource[]; apiAvailable: boolean; busy: string | null; mutate: Mutate }) {
  const firstArchiveSource = sources.find((item) => item.kind === "archive") ?? null;
  const [sourceId, setSourceId] = useState(firstArchiveSource?.id ?? "");
  const [kind, setKind] = useState<"manual_review" | "archive_scan">("manual_review");
  const [startMs, setStartMs] = useState("0");
  const [endMs, setEndMs] = useState("60000");
  const [samplingFps, setSamplingFps] = useState("1");
  const source = sources.find((item) => item.id === sourceId) ?? firstArchiveSource;
  const start = Number(startMs);
  const end = Number(endMs);
  const fps = Number(samplingFps);
  const valid = Boolean(source) && Number.isSafeInteger(start) && start >= 0
    && Number.isSafeInteger(end) && end > start
    && source?.kind === "archive"
    && (kind === "manual_review" || fps > 0 && fps <= 5);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source || !valid) return;
    await mutate("job-create", "/jobs", "POST", {
      sourceId: source.id,
      kind,
      idempotencyKey: `admin-${Date.now()}-${globalThis.crypto.randomUUID()}`,
      configuration: {
        startMs: start,
        endMs: end,
        samplingFps: kind === "archive_scan" ? fps : undefined,
      },
    }, kind === "manual_review" ? "Manual review job queued." : "Review-only archive scan queued behind deployment and worker safety gates.");
  }

  return (
    <form className="mb-4 space-y-3 rounded-xl border border-secondary bg-secondary p-3" onSubmit={submit}>
      <p className="text-xs leading-relaxed text-tertiary">Manual jobs organize human work. Archive scans remain closed until the analyzer gate, exact consent scope, all-visible assertion, source allowlist, and worker-verified local templates all pass.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Source">
          <select className={inputClass} value={source?.id ?? ""} onChange={(event) => setSourceId(event.target.value)}>
            {sources.map((item) => <option key={item.id} value={item.id} disabled={item.kind !== "archive"}>{item.name}{item.kind !== "archive" ? " (live — future)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Job kind">
          <select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="manual_review">Manual review</option>
            <option value="archive_scan" disabled={source?.kind !== "archive"}>Review-only archive scan</option>
          </select>
        </Field>
        <Field label="Start ms"><input className={inputClass} type="number" min="0" step="1" value={startMs} onChange={(event) => setStartMs(event.target.value)} /></Field>
        <Field label="End ms" hint="Required v1 bound"><input className={inputClass} type="number" min="1" step="1" value={endMs} onChange={(event) => setEndMs(event.target.value)} /></Field>
        <Field label="Samples/sec" hint="Archive only, max 5"><input className={inputClass} type="number" min="0.1" max="5" step="0.1" value={samplingFps} onChange={(event) => setSamplingFps(event.target.value)} disabled={kind === "manual_review"} /></Field>
      </div>
      <button type="submit" className={secondaryButton} disabled={!apiAvailable || !valid || busy === "job-create"}><Clock3 className="size-4" /> Queue job</button>
    </form>
  );
}

function CreateSourceForm({
  apiAvailable,
  busy,
  mutate,
}: {
  apiAvailable: boolean;
  busy: string | null;
  mutate: Mutate;
}) {
  const [contentId, setContentId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState("");
  const [sourceKind, setSourceKind] = useState<"live" | "archive">("archive");
  const [ingestLocatorRef, setIngestLocatorRef] = useState("");
  const safeLocatorPattern = /^(env|secret|mediamtx|file-ref):[A-Za-z0-9][A-Za-z0-9._/-]*$/;
  const normalizedProvider = provider.trim().toLowerCase();
  const providerValid = /^[a-z][a-z0-9_-]{0,39}$/.test(normalizedProvider);
  const locatorValid = !ingestLocatorRef.trim() || (
    ingestLocatorRef.trim().length <= 500
    && safeLocatorPattern.test(ingestLocatorRef.trim())
    && !/(^|[:/])\.{1,2}(\/|$)/.test(ingestLocatorRef.trim())
  );
  const normalizedContentId = contentId.trim();
  const contentIdValid = normalizedContentId.length > 0 && normalizedContentId.length <= 300
    && normalizedContentId !== "*" && !normalizedContentId.includes("://")
    && !/[\u0000-\u0020\u007f]/.test(normalizedContentId);
  const canSubmit = apiAvailable && contentIdValid && displayName.trim().length > 0 && displayName.trim().length <= 160 && providerValid && locatorValid;
  const isBusy = busy === "source-create";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const created = await mutate(
      "source-create",
      "/sources",
      "POST",
      {
        contentId: normalizedContentId,
        displayName: displayName.trim(),
        provider: normalizedProvider,
        sourceKind,
        ingestLocatorRef: ingestLocatorRef.trim() || null,
        state: "disabled",
        allVisiblePeopleConsented: false,
        automaticMatchingEnabled: false,
        allowedIdentityIds: [],
      },
      `${displayName.trim()} created in disabled, manual-only mode.`,
    );
    if (created) {
      setContentId("");
      setDisplayName("");
      setProvider("");
      setSourceKind("archive");
      setIngestLocatorRef("");
    }
  }

  return (
    <Panel
      icon={<Radio className="size-5" />}
      title="Create a safe source"
      description="Link an authorized ingest to one canonical Watch item. Creation never starts capture or recognition."
      actions={<StatusPill tone="neutral">Starts disabled</StatusPill>}
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Watch content ID" hint="Exact player item key">
            <input
              className={inputClass}
              value={contentId}
              onChange={(event) => setContentId(event.target.value)}
              maxLength={300}
              placeholder="live-marlon or vod-123456"
              required
              disabled={!apiAvailable || isBusy}
            />
          </Field>
          <Field label="Display name">
            <input
              className={inputClass}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={160}
              placeholder="Marlon controlled OBS"
              required
              disabled={!apiAvailable || isBusy}
            />
          </Field>
          <Field label="Provider" hint="Identifier, not a URL">
            <input
              className={inputClass}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              maxLength={40}
              pattern="[A-Za-z][A-Za-z0-9_-]{0,39}"
              placeholder="mediamtx"
              required
              disabled={!apiAvailable || isBusy}
            />
          </Field>
          <Field label="Source type">
            <select className={inputClass} value={sourceKind} onChange={(event) => setSourceKind(event.target.value as "live" | "archive")} disabled={!apiAvailable || isBusy}>
              <option value="archive">Authorized archive</option>
              <option value="live">Controlled live ingest (future/manual only)</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.6fr)] lg:items-end">
          <Field label="Safe ingest-locator reference" hint="Optional. Reference a server-side value; never paste a stream URL, key, or secret.">
            <input
              className={inputClass}
              value={ingestLocatorRef}
              onChange={(event) => setIngestLocatorRef(event.target.value)}
              maxLength={510}
              placeholder="mediamtx:core/marlon-safe-feed"
              aria-invalid={!locatorValid}
              aria-describedby="face-source-locator-help"
              disabled={!apiAvailable || isBusy}
            />
          </Field>
          <button type="submit" className={primaryButton} disabled={!canSubmit || isBusy}>
            {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Radio className="size-4" />}
            Create disabled source
          </button>
        </div>
        <div id="face-source-locator-help" className={`rounded-lg p-3 text-xs leading-relaxed ${locatorValid ? "bg-secondary text-tertiary" : "bg-error-primary text-error-primary"}`}>
          Allowed references begin with <code>env:</code>, <code>secret:</code>, <code>mediamtx:</code>, or <code>file-ref:</code>. Initial policy is locked to disabled, manual-only, all-visible-consent false, automatic matching false, and an empty identity allowlist.
        </div>
      </form>
    </Panel>
  );
}

function SourceCard({ source, identities, people, busy, mutate }: { source: FaceSource; identities: FaceIdentity[]; people: FaceCanonicalPerson[]; busy: string | null; mutate: Mutate }) {
  const eligible = identities.filter((identity) => {
    const consent = identity.consent;
    return identity.enrollmentStatus === "ready" && consent.status === "active" && consent.adultConfirmed
      && consent.templateCreation && consent.approvedContentIds.includes(source.contentId)
      && (source.kind === "live" ? consent.liveMatching : consent.archiveMatching);
  });
  const [mode, setMode] = useState<"manual_only" | "review_only">(
    source.mode === "manual_only" ? "manual_only" : "review_only",
  );
  const [recognitionEnabled, setRecognitionEnabled] = useState(source.recognitionEnabled);
  const [allVisiblePeopleConsented, setAllVisiblePeopleConsented] = useState(false);
  const [allowedIds, setAllowedIds] = useState<Set<string>>(
    () => new Set(source.allowedIdentityIds.filter((id) => eligible.some((identity) => identity.id === id))),
  );
  const [killReason, setKillReason] = useState("");
  const [killConfirmed, setKillConfirmed] = useState(false);
  const staleAllowedCount = source.allowedIdentityIds.filter((id) => !eligible.some((identity) => identity.id === id)).length;

  function toggleAllowed(id: string, checked: boolean) {
    setAllowedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  const sourceBusy = busy === `source-save:${source.id}` || busy === `source-kill:${source.id}`;
  return (
    <Panel
      icon={<Radio className="size-5" />}
      title={source.name}
      description={`${humanize(source.kind)} · ${source.provider}${source.activeSessionId ? ` · session ${source.activeSessionId}` : ""}`}
      actions={<StatusPill tone={source.killSwitchActive || source.status === "error" ? "error" : source.status === "running" ? "success" : "neutral"}>{source.killSwitchActive ? "Kill switch active" : humanize(source.status)}</StatusPill>}
    >
      {source.errorMessage ? <Message tone="error" role="alert">{source.errorMessage}</Message> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Operating mode">
          <select className={inputClass} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} disabled={source.killSwitchActive}>
            <option value="manual_only">Manual labeling only</option>
            <option value="review_only">Recognition · review only</option>
          </select>
        </Field>
        <div className="pt-2">
          <CheckRow checked={recognitionEnabled} onChange={setRecognitionEnabled} disabled={source.killSwitchActive || mode === "manual_only"} label="Recognition enabled" detail="This never enables automatic public publishing." />
        </div>
      </div>

      {mode !== "manual_only" && recognitionEnabled ? (
        <div className="mt-3">
          <CheckRow
            checked={allVisiblePeopleConsented}
            onChange={setAllVisiblePeopleConsented}
            disabled={source.killSwitchActive}
            label="Every person visible in this exact session/segment explicitly consented"
            detail="Required on every save that enables recognition. A previous session's assertion is never reused."
          />
        </div>
      ) : null}

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-primary">Session allowlist</legend>
        <p className="mt-1 text-xs leading-relaxed text-tertiary">Only adults whose consent covers this source type can be selected. Every visible participant must consent before automatic face matching is used.</p>
        {eligible.length === 0 ? (
          <div className="mt-3"><Empty title="No eligible identities" detail={`No enrolled person currently has active ${source.kind} matching consent.`} /></div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {eligible.map((identity) => {
              const person = people.find((item) => item.key === identity.canonicalKey);
              return <CheckRow key={identity.id} checked={allowedIds.has(identity.id)} onChange={(checked) => toggleAllowed(identity.id, checked)} disabled={source.killSwitchActive} label={person?.displayName ?? identity.displayName} detail={identity.canonicalKey} />;
            })}
          </div>
        )}
        {staleAllowedCount > 0 ? <div className="mt-3"><Message tone="warning" role="alert">{staleAllowedCount} saved allowlist {staleAllowedCount === 1 ? "entry is" : "entries are"} no longer consent-eligible and will be removed when this scope is saved.</Message></div> : null}
      </fieldset>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-secondary pt-4">
        <button type="button" className={primaryButton} disabled={sourceBusy || source.killSwitchActive || (mode !== "manual_only" && recognitionEnabled && !allVisiblePeopleConsented)} onClick={() => void mutate(`source-save:${source.id}`, `/sources/${encodeURIComponent(source.id)}`, "PATCH", { mode, recognitionEnabled: mode === "manual_only" ? false : recognitionEnabled, allVisiblePeopleConsented: mode !== "manual_only" && recognitionEnabled ? allVisiblePeopleConsented : false, allowedIdentityIds: [...allowedIds] }, `${source.name} safety scope saved.`)}>
          <FileCheck2 className="size-4" /> Save source scope
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-error_subtle bg-error-primary p-4">
        <div className="flex items-start gap-2"><PauseCircle className="mt-0.5 size-5 shrink-0 text-error-primary" /><div><p className="text-sm font-semibold text-error-primary">Source and session kill switch</p><p className="mt-1 text-xs leading-relaxed text-error-primary">Requests a stop and revokes the active session in the database. The local worker must recheck before each frame and can take up to its configured polling interval to stop. Resuming never restores a prior session.</p></div></div>
        <Field label={source.killSwitchActive ? "Reason to resume" : "Reason to stop"}>
          <input className={inputClass} value={killReason} onChange={(event) => setKillReason(event.target.value)} placeholder={source.killSwitchActive ? "Participants reconfirmed consent…" : "Unexpected person entered frame…"} />
        </Field>
        <div className="mt-3"><CheckRow checked={killConfirmed} onChange={setKillConfirmed} label={source.killSwitchActive ? "I reconfirmed every participant; a new live session must still be started" : "Stop this source and its active session now"} /></div>
        <button
          type="button"
          className={source.killSwitchActive ? `${secondaryButton} mt-3` : `${destructiveButton} mt-3`}
          disabled={sourceBusy || !killConfirmed || killReason.trim().length < 10}
          onClick={() => void mutate(`source-kill:${source.id}`, `/sources/${encodeURIComponent(source.id)}/kill-switch`, "POST", { active: !source.killSwitchActive, sessionId: source.activeSessionId, reason: killReason.trim(), allVisiblePeopleConsented: source.killSwitchActive && mode !== "manual_only" ? killConfirmed : false }, source.killSwitchActive ? `${source.name} kill switch cleared. Start an explicit new live session before scanning.` : `${source.name} and its active session were stopped.`)}
        >
          {source.killSwitchActive ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
          {source.killSwitchActive ? "Resume source" : "Stop source now"}
        </button>
      </div>
    </Panel>
  );
}

function ReviewPanel({
  panelId,
  reviews,
  sources,
  identities,
  apiAvailable,
  busy,
  mutate,
}: {
  panelId: string;
  reviews: FaceReview[];
  sources: FaceSource[];
  identities: FaceIdentity[];
  apiAvailable: boolean;
  busy: string | null;
  mutate: Mutate;
}) {
  const activeAdults = identities.filter((identity) => identity.consent.status === "active" && identity.consent.adultConfirmed);
  const [manualSourceId, setManualSourceId] = useState(sources[0]?.id ?? "");
  const [manualIdentityId, setManualIdentityId] = useState("");
  const [manualStartMs, setManualStartMs] = useState("0");
  const [manualEndMs, setManualEndMs] = useState("");
  const [manualBbox, setManualBbox] = useState({ x: "", y: "", width: "", height: "" });
  const manualSource = sources.find((source) => source.id === manualSourceId) ?? sources[0] ?? null;
  const manualEligible = manualSource
    ? activeAdults.filter((identity) => identity.consent.approvedContentIds.includes(manualSource.contentId))
    : [];
  const startMs = Number(manualStartMs);
  const endMs = manualEndMs.trim() ? Number(manualEndMs) : null;
  const bboxValues = Object.values(manualBbox);
  const hasAnyBbox = bboxValues.some((value) => value.trim() !== "");
  const bboxNumbers = {
    x: Number(manualBbox.x), y: Number(manualBbox.y),
    width: Number(manualBbox.width), height: Number(manualBbox.height),
  };
  const bboxValid = !hasAnyBbox || (
    bboxValues.every((value) => value.trim() !== "")
    && bboxNumbers.x >= 0 && bboxNumbers.y >= 0 && bboxNumbers.width > 0 && bboxNumbers.height > 0
    && bboxNumbers.x + bboxNumbers.width <= 1 && bboxNumbers.y + bboxNumbers.height <= 1
  );
  const manualValid = Boolean(manualSource) && Number.isSafeInteger(startMs) && startMs >= 0
    && (endMs === null ? manualSource?.kind === "live" : Number.isSafeInteger(endMs) && endMs > startMs)
    && bboxValid;

  async function submitManualTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualSource || !manualValid) return;
    await mutate("track-manual", "/tracks", "POST", {
      sourceId: manualSource.id,
      identityId: manualIdentityId || null,
      startMs,
      endMs,
      bbox: hasAnyBbox ? bboxNumbers : null,
    }, "Manual source interval added to the private review queue.");
  }
  return (
    <div id={panelId} role="tabpanel" aria-labelledby="face-tab-review" className="space-y-4">
      <Message tone="warning" role="status">
        Candidate scores are suggestions, not identity facts. Assign or mark unknown first, approve only after human verification, and publish as a separate action. There is no bulk approve or auto-publish control.
      </Message>
      <Panel icon={<FileCheck2 className="size-5" />} title="Add a manual review interval" description="Author a private source-time interval without running recognition. Assignment, approval, and publication remain separate actions.">
        <form className="space-y-3" onSubmit={submitManualTrack}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Authorized source">
              <select className={inputClass} value={manualSource?.id ?? ""} onChange={(event) => { setManualSourceId(event.target.value); setManualIdentityId(""); }}>
                {sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.contentId}</option>)}
              </select>
            </Field>
            <Field label="Person" hint="Optional; leave blank for unknown.">
              <select className={inputClass} value={manualIdentityId} onChange={(event) => setManualIdentityId(event.target.value)}>
                <option value="">Unknown / assign during review</option>
                {manualEligible.map((identity) => <option key={identity.id} value={identity.id}>{identity.displayName}</option>)}
              </select>
            </Field>
            <Field label="Start (milliseconds)">
              <input className={inputClass} type="number" min="0" step="1" value={manualStartMs} onChange={(event) => setManualStartMs(event.target.value)} required />
            </Field>
            <Field label="End (milliseconds)" hint={manualSource?.kind === "archive" ? "Required for archive/VOD." : "Optional only while a live interval is active."}>
              <input className={inputClass} type="number" min="1" step="1" value={manualEndMs} onChange={(event) => setManualEndMs(event.target.value)} required={manualSource?.kind === "archive"} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {(["x", "y", "width", "height"] as const).map((field) => (
              <Field key={field} label={`BBox ${field}`} hint="Normalized 0–1; supply all four or none.">
                <input className={inputClass} type="number" min="0" max="1" step="0.001" value={manualBbox[field]} onChange={(event) => setManualBbox((previous) => ({ ...previous, [field]: event.target.value }))} />
              </Field>
            ))}
          </div>
          {!bboxValid ? <Message tone="warning" role="alert">Bounding box values must all be present, normalized, and remain inside the frame.</Message> : null}
          <button type="submit" className={primaryButton} disabled={!apiAvailable || !manualValid || busy === "track-manual"}><FileCheck2 className="size-4" /> Add private review interval</button>
        </form>
      </Panel>
      {!apiAvailable ? (
        <Empty title="Review queue unavailable" detail="The page will not display fake empty-state confidence when the API cannot report detections." />
      ) : reviews.length === 0 ? (
        <Empty title="Nothing needs review" detail="No pending or recently decided face tracks were reported." />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {reviews.map((review) => <ReviewCard key={`${review.id}:${review.status}:${review.assignedIdentityId ?? "none"}`} review={review} identities={activeAdults.filter((identity) => identity.consent.approvedContentIds.includes(review.contentId) && (review.matchMethod === "manual" || review.sourceKind === "archive" && identity.consent.archiveMatching))} busy={busy} mutate={mutate} />)}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review, identities, busy, mutate }: { review: FaceReview; identities: FaceIdentity[]; busy: string | null; mutate: Mutate }) {
  const initialIdentityId = [review.assignedIdentityId, ...review.candidates.map((candidate) => candidate.identityId)]
    .find((candidateId) => candidateId && identities.some((identity) => identity.id === candidateId)) ?? "";
  const [identityId, setIdentityId] = useState(initialIdentityId);
  const [note, setNote] = useState(review.reviewerNote ?? "");
  const [sourceMomentVerified, setSourceMomentVerified] = useState(false);
  const anyBusy = busy?.endsWith(`:${review.id}`) ?? false;
  const assigned = review.assignedIdentityId !== null || review.status === "approved" || review.status === "published";
  const assignmentEligible = Boolean(identityId && identities.some((identity) => identity.id === identityId));
  const approvedIdentityEligible = Boolean(review.assignedIdentityId && identities.some((identity) => identity.id === review.assignedIdentityId));
  const published = review.status === "published" || Boolean(review.publishedPresenceId);

  async function action(name: "assign" | "unknown" | "approve" | "reject" | "publish" | "unpublish", message: string) {
    await mutate(`review-${name}:${review.id}`, `/reviews/${encodeURIComponent(review.id)}`, "PATCH", { action: name, identityId: name === "assign" ? identityId : undefined, note: note.trim() || null, sourceMomentVerified: name === "approve" ? sourceMomentVerified : undefined, publishedPresenceId: review.publishedPresenceId }, message);
  }

  return (
    <Panel
      icon={<Eye className="size-5" />}
      title={review.sourceName}
      description={`Observed ${formatDateTime(review.occurredAt)}`}
      actions={<StatusPill tone={published ? "success" : review.status === "rejected" ? "error" : review.status === "approved" ? "success" : "neutral"}>{humanize(review.status)}</StatusPill>}
    >
      <div className="mb-4 rounded-xl border border-secondary bg-secondary p-3 text-xs text-tertiary">
        <p><span className="font-semibold text-primary">Content:</span> {review.contentId}</p>
        <p className="mt-1"><span className="font-semibold text-primary">Source interval:</span> {formatMilliseconds(review.startMs)} – {review.endMs === null ? "active live interval" : formatMilliseconds(review.endMs)}</p>
        <p className="mt-1"><span className="font-semibold text-primary">Bounding box:</span> {review.bbox ? `${review.bbox.x.toFixed(3)}, ${review.bbox.y.toFixed(3)}, ${review.bbox.width.toFixed(3)} × ${review.bbox.height.toFixed(3)}` : "whole frame / not supplied"}</p>
        {review.reviewHref ? <a href={review.reviewHref} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-secondary hover:underline">Open the authorized source moment <ExternalLink className="size-3.5" /></a> : <p className="mt-2 text-warning-primary">No inspectable source link is available. Approval and publication are disabled until a protected review frame or canonical provider deep-link is available.</p>}
      </div>
      <div className="mb-4">
        <CheckRow checked={sourceMomentVerified} onChange={setSourceMomentVerified} disabled={published || !review.reviewHref} label="I opened the authorized source and verified this exact interval" detail="Candidate scores alone are never sufficient for approval." />
      </div>
      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-secondary bg-black">
          {review.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={review.thumbnailUrl} alt="Private review frame" className="h-full w-full object-contain" />
          ) : (
            <ScanFace className="size-9 text-white/50" aria-label="No review thumbnail supplied" />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Analyzer candidates</p>
          {review.candidates.length === 0 ? <p className="mt-2 text-sm text-tertiary">No candidate exceeded the private review floor.</p> : (
            <ol className="mt-2 space-y-1.5">
              {review.candidates.slice(0, 3).map((candidate, index) => (
                <li key={`${candidate.identityId}:${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2 text-sm">
                  <span className="truncate font-medium text-primary">{index + 1}. {candidate.displayName}</span>
                  <span className="shrink-0 tabular-nums text-tertiary">{formatScore(candidate.score)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Human assignment">
          <select className={inputClass} value={identityId} onChange={(event) => setIdentityId(event.target.value)} disabled={published}>
            <option value="">Select a consented person</option>
            {identities.map((identity) => <option key={identity.id} value={identity.id}>{identity.displayName}</option>)}
          </select>
        </Field>
        <button type="button" className={secondaryButton} disabled={!assignmentEligible || anyBusy || published} onClick={() => void action("assign", "Human assignment saved; it is still private and unapproved.")}><UserCheck className="size-4" /> Assign</button>
      </div>
      <Field label="Reviewer note" hint="Optional for assignment; recommended for reject or unknown.">
        <textarea className={textareaClass} value={note} onChange={(event) => setNote(event.target.value)} disabled={published} />
      </Field>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-secondary pt-4">
        <button type="button" className={secondaryButton} disabled={anyBusy || published} onClick={() => void action("unknown", "Track marked unknown; no identity or public tag was attached.")}><ScanFace className="size-4" /> Mark unknown</button>
        <button type="button" className={secondaryButton} disabled={anyBusy || published || !assigned || !approvedIdentityEligible || !review.reviewHref || !sourceMomentVerified} onClick={() => void action("approve", "Identity match approved privately. Publish is still required.")}><CheckCircle2 className="size-4" /> Approve match</button>
        <button type="button" className={secondaryButton} disabled={anyBusy || published} onClick={() => void action("reject", "Detection rejected and kept out of public presence data.")}><XCircle className="size-4" /> Reject</button>
        {!published ? (
          <button type="button" className={primaryButton} disabled={anyBusy || review.status !== "approved" || !approvedIdentityEligible || !review.reviewHref} onClick={() => void action("publish", "Reviewed presence published using its consented canonical identity.")}><Link2 className="size-4" /> Publish tag</button>
        ) : (
          <button type="button" className={destructiveButton} disabled={anyBusy} onClick={() => void action("unpublish", "Presence tag unpublished.")}><Ban className="size-4" /> Unpublish</button>
        )}
      </div>
    </Panel>
  );
}

function PublishedAuditPanel({
  panelId,
  published,
  audit,
  people,
  apiAvailable,
  busy,
  mutate,
}: {
  panelId: string;
  published: FaceAdminOverview["published"];
  audit: FaceAdminOverview["audit"];
  people: FaceCanonicalPerson[];
  apiAvailable: boolean;
  busy: string | null;
  mutate: Mutate;
}) {
  return (
    <div id={panelId} role="tabpanel" aria-labelledby="face-tab-published" className="grid items-start gap-4 xl:grid-cols-2">
      <Panel icon={<Link2 className="size-5" />} title="Published presence" description="Only reviewed, consented identities should reach the viewer-facing ‘On screen now’ surface.">
        {!apiAvailable ? (
          <Empty title="Published state unavailable" detail="No public tag is assumed active while the API is unreachable." />
        ) : published.length === 0 ? (
          <Empty title="No published presence" detail="No on-screen person tag is currently public." />
        ) : (
          <ul className="space-y-3">
            {published.map((presence) => {
              const canonical = people.find((person) => person.key === presence.canonicalKey);
              const displayName = canonical?.displayName ?? presence.displayName;
              return (
              <li key={presence.id} className="rounded-xl border border-secondary bg-secondary p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-primary">{displayName}</p><StatusPill tone={presence.public ? "success" : "neutral"}>{presence.public ? "Public" : "Hidden"}</StatusPill></div>
                    <p className="mt-1 text-xs text-tertiary">{presence.sourceName} · {formatDateTime(presence.startedAt)}{presence.endedAt ? ` – ${formatDateTime(presence.endedAt)}` : " – now"}</p>
                    {canonical ? <div className="mt-2 flex flex-wrap gap-2">
                      <Link href={canonical.profileHref as never} className="text-xs font-semibold text-brand-secondary hover:underline">Profile</Link>
                      {canonical.socials.map((social) => <a key={`${presence.id}:${social.platform}:${social.url}`} href={social.url} target="_blank" rel="noreferrer" className="text-xs text-tertiary hover:text-primary hover:underline">{social.handle ?? social.label ?? social.platform}</a>)}
                    </div> : <p className="mt-2 text-xs font-medium text-error-primary">Canonical profile link missing. Unpublish and repair the identity link.</p>}
                  </div>
                  {presence.public ? (
                    <button type="button" className={destructiveButton} disabled={busy === `published-unpublish:${presence.id}`} onClick={() => void mutate(`published-unpublish:${presence.id}`, `/published/${encodeURIComponent(presence.id)}`, "PATCH", { public: false, reason: "Unpublished by administrator" }, `${displayName} was removed from public presence.`)}><Ban className="size-4" /> Unpublish</button>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel icon={<History className="size-5" />} title="Audit trail" description="Consent, reference, source, review, publish, revocation, and deletion actions should all be immutable server-side events.">
        {!apiAvailable ? (
          <Empty title="Audit unavailable" detail="The UI does not synthesize history from its own button clicks." />
        ) : audit.length === 0 ? (
          <Empty title="No audit events" detail="The API returned no recorded face-tagging actions." />
        ) : (
          <ol className="space-y-3">
            {audit.map((entry) => (
              <li key={entry.id} className="border-l-2 border-brand pl-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-primary">{humanize(entry.action)}</p><time className="text-xs text-quaternary" dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time></div>
                <p className="mt-0.5 text-xs text-tertiary">{entry.actorName} · {entry.targetLabel}</p>
                {entry.reason ? <p className="mt-1 text-xs leading-relaxed text-secondary">{entry.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="Loading face-tagging administration">
      <div className="h-80 animate-pulse rounded-2xl bg-primary" />
      <div className="h-80 animate-pulse rounded-2xl bg-primary" />
      <span className="sr-only">Loading face-tagging administration…</span>
    </div>
  );
}

function Panel({ icon, title, description, actions, children }: { icon: ReactNode; title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-secondary bg-primary shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-secondary p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-tertiary">{icon}</span><div><h3 className="text-base font-semibold text-primary">{title}</h3>{description ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-tertiary">{description}</p> : null}</div></div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function EmptyPanel({ panelId, title, detail }: { panelId: string; title: string; detail: string }) {
  return <div id={panelId} role="tabpanel" className="rounded-2xl border border-secondary bg-primary p-6"><Empty title={title} detail={detail} /></div>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-secondary bg-secondary p-6 text-center">
      <Database className="size-6 text-quaternary" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-primary">{title}</p>
      <p className="mt-1 max-w-lg text-xs leading-relaxed text-tertiary">{detail}</p>
    </div>
  );
}

function Message({ tone, role, children }: { tone: "success" | "warning" | "error"; role: "status" | "alert"; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertCircle : XCircle;
  const classes = tone === "success" ? "border-success_subtle bg-success-primary text-success-primary" : tone === "warning" ? "border-warning_subtle bg-warning-primary text-warning-primary" : "border-error_subtle bg-error-primary text-error-primary";
  return <div role={role} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${classes}`}><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div>{children}</div></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-secondary">{label}{hint ? <span className="ml-1 font-normal text-tertiary">· {hint}</span> : null}{children}</label>;
}

function CheckRow({ checked, onChange, label, detail, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; detail?: string; disabled?: boolean }) {
  return <label className={`flex items-start gap-3 rounded-lg border border-secondary bg-primary p-3 ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}><input type="checkbox" className="mt-0.5 size-4 rounded border-secondary accent-[color:var(--color-brand-600)]" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span><span className="block text-sm font-medium text-primary">{label}</span>{detail ? <span className="mt-0.5 block text-xs leading-relaxed text-tertiary">{detail}</span> : null}</span></label>;
}

function ConfirmationBox({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <div role="group" aria-label={title} className="space-y-3 rounded-xl border border-error_subtle bg-error-primary p-4"><div><p className="text-sm font-semibold text-error-primary">{title}</p><p className="mt-1 text-xs leading-relaxed text-error-primary">{detail}</p></div>{children}</div>;
}

function PersonAvatar({ person }: { person: FaceCanonicalPerson }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-sm font-bold text-quaternary ring-1 ring-inset ring-secondary">
      {person.portraitUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.portraitUrl} alt="" className="h-full w-full object-cover" />
      ) : person.displayName.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("")}
    </span>
  );
}

function ConsentStatus({ identity }: { identity?: FaceIdentity }) {
  if (!identity) return <StatusPill tone="neutral">Not recorded</StatusPill>;
  const status = identity.consent.status;
  return <StatusPill tone={status === "active" ? "success" : status === "revoked" ? "error" : "warning"}>{humanize(status)}</StatusPill>;
}

function StatusPill({ tone, children }: { tone: "success" | "warning" | "error" | "neutral"; children: ReactNode }) {
  const classes = tone === "success" ? "bg-success-primary text-success-primary" : tone === "warning" ? "bg-warning-primary text-warning-primary" : tone === "error" ? "bg-error-primary text-error-primary" : "bg-secondary text-tertiary";
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}

function readApiError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : typeof record.detail === "string" ? record.detail : null;
}

function humanize(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatMilliseconds(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatScore(value: number): string {
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, percent)).toFixed(1)}%`;
}
