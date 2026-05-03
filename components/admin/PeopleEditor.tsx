"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

export type MemberRow = {
  slug: string;
  stageName: string;
  realName: string;
  birthDate: string | null;
  accent: string;
  twitchLogin: string;
  commName: string;
  commLogo: string;
  avatarUrl: string;
  bio: string;
};

export type CrewRow = {
  slug: string;
  name: string;
  role: string;
  worksWith: string[];
};

type MemberOverride = Partial<{
  stageName: string;
  realName: string;
  birthDate: string;
  twitchLogin: string;
  commName: string;
  bio: string;
  hidden: boolean;
  alias: string;
  roles: string[];
  height: string;
  weight: string;
  nickname: string;
  favoriteGame: string;
  description: string;
  /** S3 / public path to the override profile image. */
  profileImage: string;
  /** Hex accent color (#rrggbb) — drives blooms, name glow, and the
   * comm chip tint on /m/[slug]. */
  accent: string;
}>;

type CrewOverride = Partial<{
  name: string;
  role: string;
  hidden: boolean;
}>;

/**
 * Admin people editor — inline edit forms for every member + crew, plus
 * "add" forms at the bottom of each list. State persists to localStorage
 * keyed by slug. Phase 4 swaps for /v1/members and /v1/crew endpoints
 * writing to the `editable_*_overrides` tables.
 */
export function PeopleEditorClient({
  memberRows,
  crewRows,
}: {
  memberRows: MemberRow[];
  crewRows: CrewRow[];
}) {
  const [memberOverrides, setMemberOverrides] = useState<Record<string, MemberOverride>>({});
  const [crewOverrides, setCrewOverrides] = useState<Record<string, CrewOverride>>({});
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editingCrew, setEditingCrew] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  useEffect(() => {
    // Load existing overrides from the API. API returns snake_case
    // columns; we normalise back to the camelCase keys this component
    // already uses for state.
    (async () => {
      try {
        const res = await fetch("/api/admin/people/members", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as {
            overrides: Array<Record<string, unknown> & { slug: string }>;
          };
          const m: Record<string, MemberOverride> = {};
          for (const row of json.overrides) {
            m[row.slug] = {
              stageName: (row.stage_name as string) ?? undefined,
              realName: (row.real_name as string) ?? undefined,
              bio: (row.bio as string) ?? undefined,
              birthDate: (row.birth_date as string) ?? undefined,
              twitchLogin: (row.twitch_login as string) ?? undefined,
              commName: (row.comm_name as string) ?? undefined,
              accent: (row.accent_color as string) ?? undefined,
              hidden: (row.hidden as boolean) ?? false,
              alias: (row.alias as string) ?? undefined,
              height: (row.height as string) ?? undefined,
              weight: (row.weight as string) ?? undefined,
              nickname: (row.nickname as string) ?? undefined,
              favoriteGame: (row.favorite_game as string) ?? undefined,
              description: (row.description as string) ?? undefined,
              roles: (row.roles as string[]) ?? undefined,
            };
          }
          setMemberOverrides(m);
        }
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch("/api/admin/people/crew", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as {
            overrides: Array<Record<string, unknown> & { slug: string }>;
          };
          const c: Record<string, CrewOverride> = {};
          for (const row of json.overrides) {
            c[row.slug] = {
              name: (row.display_name as string) ?? undefined,
              role: (row.role as string) ?? undefined,
              hidden: (row.hidden as boolean) ?? false,
            };
          }
          setCrewOverrides(c);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const saveMember = async (slug: string, patch: MemberOverride) => {
    setMemberOverrides((prev) => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));
    setEditingMember(null);
    try {
      // Translate field names to the API's expected camelCase. Most are
      // already aligned; `accent` here = `accentColor` in the API.
      const payload: Record<string, unknown> = { ...patch };
      if (patch.accent !== undefined) {
        payload.accentColor = patch.accent;
        delete payload.accent;
      }
      await fetch(`/api/admin/people/members/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      /* leave optimistic state in place; admin will see the error indirectly on next load */
    }
    setSavedSlug(slug);
    window.setTimeout(() => setSavedSlug(null), 1500);
  };

  const saveCrew = async (slug: string, patch: CrewOverride) => {
    setCrewOverrides((prev) => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));
    setEditingCrew(null);
    try {
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) payload.displayName = patch.name;
      if (patch.role !== undefined) payload.role = patch.role;
      if (patch.hidden !== undefined) payload.hidden = patch.hidden;
      await fetch(`/api/admin/people/crew/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      /* ignore */
    }
    setSavedSlug(slug);
    window.setTimeout(() => setSavedSlug(null), 1500);
  };

  const toggleMemberHidden = (slug: string) => {
    saveMember(slug, { hidden: !memberOverrides[slug]?.hidden });
  };

  const toggleCrewHidden = (slug: string) => {
    saveCrew(slug, { hidden: !crewOverrides[slug]?.hidden });
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Members */}
      <div>
        <header className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--ink)]">
            Members · {memberRows.length}
          </h2>
          <p className="text-[11px] text-[color:var(--ink-faint)]">
            Edits saved to localStorage · Phase 4 wires <code className="font-mono">PUT /v1/members/:slug</code>
          </p>
        </header>
        <ul className="flex flex-col gap-2">
          {memberRows.map((m) => {
            const o = memberOverrides[m.slug];
            const isEditing = editingMember === m.slug;
            const display = {
              stageName: o?.stageName ?? m.stageName,
              realName: o?.realName ?? m.realName,
              birthDate: o?.birthDate ?? m.birthDate ?? "",
              twitchLogin: o?.twitchLogin ?? m.twitchLogin,
              commName: o?.commName ?? m.commName,
              bio: o?.bio ?? m.bio,
              hidden: o?.hidden ?? false,
              alias: o?.alias ?? "",
              roles: o?.roles ?? [],
              height: o?.height ?? "",
              weight: o?.weight ?? "",
              nickname: o?.nickname ?? "",
              favoriteGame: o?.favoriteGame ?? "",
              description: o?.description ?? "",
              profileImage: o?.profileImage ?? "",
              accent: o?.accent ?? m.accent,
            };
            return (
              <li
                key={m.slug}
                className={`overflow-hidden rounded-lg border bg-[color:var(--bg-elev)] transition-colors ${
                  display.hidden
                    ? "border-dashed border-[color:var(--rule)] opacity-60"
                    : "border-[color:var(--rule)]"
                }`}
              >
                {isEditing ? (
                  <MemberEditForm row={m} value={display} onSave={(patch) => saveMember(m.slug, patch)} onCancel={() => setEditingMember(null)} />
                ) : (
                  <div className="flex items-center gap-4 p-3">
                    <Image
                      src={m.avatarUrl}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-[color:var(--ink)]">
                        {display.stageName}
                      </p>
                      <p className="text-[12px] text-[color:var(--ink-dim)]">
                        {display.realName}
                        {display.birthDate ? ` · b. ${display.birthDate}` : ""}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                        <Image src={m.commLogo} alt="" width={12} height={12} className="h-3 w-3 object-contain" />
                        {display.commName} · twitch.tv/{display.twitchLogin}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {savedSlug === m.slug ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--success)]">
                          <Check size={12} /> Saved
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleMemberHidden(m.slug)}
                        title={display.hidden ? "Show on site" : "Hide from site"}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
                      >
                        {display.hidden ? "○" : "●"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingMember(m.slug)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove ${m.stageName} from the site?`)) {
                            toggleMemberHidden(m.slug);
                          }
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
                        title="Remove (soft delete)"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled
          title="Phase 4 — POST /v1/members"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] px-3 py-2 text-[12px] font-medium text-[color:var(--ink-faint)] cursor-not-allowed"
        >
          <Plus size={12} /> Add member (Phase 4)
        </button>
      </div>

      {/* Crew */}
      <div>
        <header className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--ink)]">
            Crew · {crewRows.length}
          </h2>
        </header>
        <ul className="flex flex-col gap-2">
          {crewRows.map((c) => {
            const o = crewOverrides[c.slug];
            const isEditing = editingCrew === c.slug;
            const display = {
              name: o?.name ?? c.name,
              role: o?.role ?? c.role,
              hidden: o?.hidden ?? false,
            };
            return (
              <li
                key={c.slug}
                className={`overflow-hidden rounded-lg border bg-[color:var(--bg-elev)] ${
                  display.hidden
                    ? "border-dashed border-[color:var(--rule)] opacity-60"
                    : "border-[color:var(--rule)]"
                }`}
              >
                {isEditing ? (
                  <CrewEditForm
                    row={c}
                    value={display}
                    onSave={(patch) => saveCrew(c.slug, patch)}
                    onCancel={() => setEditingCrew(null)}
                  />
                ) : (
                  <div className="flex items-center gap-4 p-3">
                    <span
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[color:var(--bg)] text-[14px] font-bold text-[color:var(--ink-faint)]"
                    >
                      {c.name
                        .split(" ")
                        .map((n) => n[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-[color:var(--ink)]">
                        {display.name}
                      </p>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                        {display.role} · works with {c.worksWith.join(", ") || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {savedSlug === c.slug ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--success)]">
                          <Check size={12} /> Saved
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleCrewHidden(c.slug)}
                        title={display.hidden ? "Show on site" : "Hide from site"}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
                      >
                        {display.hidden ? "○" : "●"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCrew(c.slug)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove ${c.name} from the site?`)) toggleCrewHidden(c.slug);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled
          title="Phase 4 — POST /v1/crew"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] px-3 py-2 text-[12px] font-medium text-[color:var(--ink-faint)] cursor-not-allowed"
        >
          <Plus size={12} /> Add crew (Phase 4)
        </button>
      </div>
    </div>
  );
}

function MemberEditForm({
  row,
  value,
  onSave,
  onCancel,
}: {
  row: MemberRow;
  value: {
    stageName: string;
    realName: string;
    birthDate: string;
    twitchLogin: string;
    commName: string;
    bio: string;
    alias: string;
    roles: string[];
    height: string;
    weight: string;
    nickname: string;
    favoriteGame: string;
    description: string;
    profileImage: string;
    accent: string;
  };
  onSave: (patch: MemberOverride) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const rolesText = draft.roles.join(", ");
  const setRolesText = (v: string) =>
    setDraft({ ...draft, roles: v.split(",").map((s) => s.trim()).filter(Boolean) });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          stageName: draft.stageName === row.stageName ? undefined : draft.stageName,
          realName: draft.realName === row.realName ? undefined : draft.realName,
          birthDate: draft.birthDate === (row.birthDate ?? "") ? undefined : draft.birthDate,
          twitchLogin: draft.twitchLogin === row.twitchLogin ? undefined : draft.twitchLogin,
          commName: draft.commName === row.commName ? undefined : draft.commName,
          bio: draft.bio === row.bio ? undefined : draft.bio,
          alias: draft.alias || undefined,
          roles: draft.roles.length > 0 ? draft.roles : undefined,
          height: draft.height || undefined,
          weight: draft.weight || undefined,
          nickname: draft.nickname || undefined,
          favoriteGame: draft.favoriteGame || undefined,
          description: draft.description || undefined,
          profileImage: draft.profileImage || undefined,
          accent: draft.accent === row.accent ? undefined : draft.accent,
        });
      }}
      className="flex flex-col gap-4 p-4"
    >
      <fieldset>
        <legend className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          Identity
        </legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Stage name">
            <input
              value={draft.stageName}
              onChange={(e) => setDraft({ ...draft, stageName: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Alias">
            <input
              value={draft.alias}
              onChange={(e) => setDraft({ ...draft, alias: e.target.value })}
              placeholder="Marlon3lg"
              className={inputClass}
            />
          </Field>
          <Field label="Real name">
            <input
              value={draft.realName}
              onChange={(e) => setDraft({ ...draft, realName: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Nickname">
            <input
              value={draft.nickname}
              onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
              placeholder="Big M"
              className={inputClass}
            />
          </Field>
          <Field label="Birth date (YYYY-MM-DD)">
            <input
              type="date"
              value={draft.birthDate}
              onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Twitch login">
            <input
              value={draft.twitchLogin}
              onChange={(e) => setDraft({ ...draft, twitchLogin: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          Profile
        </legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Roles" hint="Comma-separated. E.g. Streamer, Producer.">
            <input
              value={rolesText}
              onChange={(e) => setRolesText(e.target.value)}
              placeholder="Streamer, Producer"
              className={inputClass}
            />
          </Field>
          <Field label="Comm name">
            <input
              value={draft.commName}
              onChange={(e) => setDraft({ ...draft, commName: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Height">
            <input
              value={draft.height}
              onChange={(e) => setDraft({ ...draft, height: e.target.value })}
              placeholder={`6'1"`}
              className={inputClass}
            />
          </Field>
          <Field label="Weight">
            <input
              value={draft.weight}
              onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
              placeholder="175 lb"
              className={inputClass}
            />
          </Field>
          <Field label="Favorite game">
            <input
              value={draft.favoriteGame}
              onChange={(e) => setDraft({ ...draft, favoriteGame: e.target.value })}
              placeholder="Fortnite"
              className={inputClass}
            />
          </Field>
          <Field label="Profile image URL" hint="Leave blank to use the synced portrait.">
            <input
              value={draft.profileImage}
              onChange={(e) => setDraft({ ...draft, profileImage: e.target.value })}
              placeholder="/members/marlon/your-photo.jpg"
              className={inputClass}
            />
          </Field>
          <Field label="Accent color" hint="Drives blooms, name glow, comm chip on /m/[slug].">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.accent}
                onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)]"
              />
              <input
                type="text"
                value={draft.accent}
                onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
                placeholder="#ff5a3c"
                className={`${inputClass} font-mono`}
              />
            </div>
          </Field>
        </div>
      </fieldset>

      <Field label="Bio (one-liner)" hint="Used in card previews and meta descriptions.">
        <textarea
          rows={2}
          value={draft.bio}
          onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          className={inputClass}
        />
      </Field>

      <Field
        label="Description (long form)"
        hint={`Markdown links supported: [text](https://url)`}
      >
        <textarea
          rows={4}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className={inputClass}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--rule)] pt-3">
        <button type="submit" className="btn btn-primary">
          <Check size={14} /> Save
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
}

function CrewEditForm({
  row,
  value,
  onSave,
  onCancel,
}: {
  row: CrewRow;
  value: { name: string; role: string };
  onSave: (patch: CrewOverride) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: draft.name === row.name ? undefined : draft.name,
          role: draft.role === row.role ? undefined : draft.role,
        });
      }}
      className="flex flex-col gap-3 p-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Role">
          <select
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            className={inputClass}
          >
            <option value="cameraman">Cameraman</option>
            <option value="management">Management</option>
            <option value="editor">Editor</option>
            <option value="producer">Producer</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary">
          <Check size={14} /> Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
        >
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--core)] focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium tracking-tight text-[color:var(--ink-dim)]">
        {label}
      </span>
      {hint ? <span className="-mt-0.5 text-[10px] text-[color:var(--ink-faint)]">{hint}</span> : null}
      {children}
    </label>
  );
}
