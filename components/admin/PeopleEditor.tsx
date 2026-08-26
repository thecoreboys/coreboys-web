"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Edit01, Plus, Trash01, X, Eye, EyeOff } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { NativeSelect } from "@/components/base/select/select-native";
import { Badge } from "@/components/base/badges/badges";

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
   * comm chip tint on /about/[slug]. */
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
 *
 * UUI controls throughout: Input / TextArea / NativeSelect / Button /
 * ButtonUtility / Badge on consistent card surfaces.
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
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-primary">
            Members · {memberRows.length}
          </h2>
          <p className="text-xs text-quaternary">
            Edits saved via <code className="font-mono">PATCH /v1/members/:slug</code>
          </p>
        </header>
        <ul className="flex flex-col gap-3">
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
                className={`overflow-hidden rounded-xl bg-primary ring-1 ring-inset ring-secondary shadow-xs transition-all ${
                  display.hidden ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-lg"
                }`}
              >
                {isEditing ? (
                  <MemberEditForm
                    row={m}
                    value={display}
                    onSave={(patch) => saveMember(m.slug, patch)}
                    onCancel={() => setEditingMember(null)}
                  />
                ) : (
                  <div className="flex items-center gap-4 p-4">
                    <Image
                      src={m.avatarUrl}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-secondary"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-primary">{display.stageName}</p>
                        {display.hidden ? (
                          <Badge type="pill-color" size="sm" color="gray">
                            Hidden
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-tertiary">
                        {display.realName}
                        {display.birthDate ? ` · b. ${display.birthDate}` : ""}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-2 text-xs text-quaternary">
                        <Image
                          src={m.commLogo}
                          alt=""
                          width={12}
                          height={12}
                          className="h-3 w-3 object-contain"
                        />
                        {display.commName} · twitch.tv/{display.twitchLogin}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {savedSlug === m.slug ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success-primary">
                          <Check className="size-3.5" /> Saved
                        </span>
                      ) : null}
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip={display.hidden ? "Show on site" : "Hide from site"}
                        icon={display.hidden ? EyeOff : Eye}
                        onClick={() => toggleMemberHidden(m.slug)}
                      />
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="Edit"
                        icon={Edit01}
                        onClick={() => setEditingMember(m.slug)}
                      />
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="Remove (soft delete)"
                        icon={Trash01}
                        onClick={() => {
                          if (confirm(`Remove ${m.stageName} from the site?`)) {
                            toggleMemberHidden(m.slug);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Button
          size="md"
          color="secondary"
          iconLeading={Plus}
          isDisabled
          className="mt-4"
        >
          Add member (Phase 4)
        </Button>
      </div>

      {/* Crew */}
      <div>
        <header className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-primary">
            Crew · {crewRows.length}
          </h2>
        </header>
        <ul className="flex flex-col gap-3">
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
                className={`overflow-hidden rounded-xl bg-primary ring-1 ring-inset ring-secondary shadow-xs transition-all ${
                  display.hidden ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-lg"
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
                  <div className="flex items-center gap-4 p-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-quaternary ring-1 ring-inset ring-secondary">
                      {c.name
                        .split(" ")
                        .map((n) => n[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-primary">{display.name}</p>
                        {display.hidden ? (
                          <Badge type="pill-color" size="sm" color="gray">
                            Hidden
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-tertiary">
                        <span className="capitalize">{display.role}</span> · works with{" "}
                        {c.worksWith.join(", ") || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {savedSlug === c.slug ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success-primary">
                          <Check className="size-3.5" /> Saved
                        </span>
                      ) : null}
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip={display.hidden ? "Show on site" : "Hide from site"}
                        icon={display.hidden ? EyeOff : Eye}
                        onClick={() => toggleCrewHidden(c.slug)}
                      />
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="Edit"
                        icon={Edit01}
                        onClick={() => setEditingCrew(c.slug)}
                      />
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="Remove (soft delete)"
                        icon={Trash01}
                        onClick={() => {
                          if (confirm(`Remove ${c.name} from the site?`)) toggleCrewHidden(c.slug);
                        }}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Button size="md" color="secondary" iconLeading={Plus} isDisabled className="mt-4">
          Add crew (Phase 4)
        </Button>
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
      className="flex flex-col gap-6 p-5 md:p-6"
    >
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-secondary">Identity</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Stage name"
            size="md"
            value={draft.stageName}
            onChange={(v) => setDraft({ ...draft, stageName: v })}
          />
          <Input
            label="Alias"
            size="md"
            value={draft.alias}
            onChange={(v) => setDraft({ ...draft, alias: v })}
            placeholder="Marlon3lg"
          />
          <Input
            label="Real name"
            size="md"
            value={draft.realName}
            onChange={(v) => setDraft({ ...draft, realName: v })}
          />
          <Input
            label="Nickname"
            size="md"
            value={draft.nickname}
            onChange={(v) => setDraft({ ...draft, nickname: v })}
            placeholder="Big M"
          />
          <Input
            label="Birth date"
            type="date"
            size="md"
            value={draft.birthDate}
            onChange={(v) => setDraft({ ...draft, birthDate: v })}
          />
          <Input
            label="Twitch login"
            size="md"
            value={draft.twitchLogin}
            onChange={(v) => setDraft({ ...draft, twitchLogin: v })}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-secondary">Profile</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Roles"
            hint="Comma-separated. E.g. Streamer, Producer."
            size="md"
            value={rolesText}
            onChange={(v) => setRolesText(v)}
            placeholder="Streamer, Producer"
          />
          <Input
            label="Comm name"
            size="md"
            value={draft.commName}
            onChange={(v) => setDraft({ ...draft, commName: v })}
          />
          <Input
            label="Height"
            size="md"
            value={draft.height}
            onChange={(v) => setDraft({ ...draft, height: v })}
            placeholder={`6'1"`}
          />
          <Input
            label="Weight"
            size="md"
            value={draft.weight}
            onChange={(v) => setDraft({ ...draft, weight: v })}
            placeholder="175 lb"
          />
          <Input
            label="Favorite game"
            size="md"
            value={draft.favoriteGame}
            onChange={(v) => setDraft({ ...draft, favoriteGame: v })}
            placeholder="Fortnite"
          />
          <Input
            label="Profile image URL"
            hint="Leave blank to use the synced portrait."
            size="md"
            value={draft.profileImage}
            onChange={(v) => setDraft({ ...draft, profileImage: v })}
            placeholder="/members/marlon/your-photo.jpg"
          />
          <div className="md:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-secondary">Accent color</span>
            <span className="-mt-1 mb-2 block text-xs text-tertiary">
              Drives blooms, name glow, and comm chip on /about/[slug].
            </span>
            <div className="flex items-center gap-2.5">
              <input
                type="color"
                value={draft.accent}
                onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-lg bg-primary ring-1 ring-inset ring-primary"
                aria-label="Accent color picker"
              />
              <div className="max-w-[200px] flex-1">
                <Input
                  size="md"
                  value={draft.accent}
                  onChange={(v) => setDraft({ ...draft, accent: v })}
                  placeholder="#ff5a3c"
                  inputClassName="font-mono"
                  aria-label="Accent color hex"
                />
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      <TextArea
        label="Bio (one-liner)"
        hint="Used in card previews and meta descriptions."
        rows={2}
        value={draft.bio}
        onChange={(v) => setDraft({ ...draft, bio: v })}
      />

      <TextArea
        label="Description (long form)"
        hint="Markdown links supported: [text](https://url)"
        rows={4}
        value={draft.description}
        onChange={(v) => setDraft({ ...draft, description: v })}
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-secondary pt-5">
        <Button type="submit" color="primary" size="md" iconLeading={Check}>
          Save changes
        </Button>
        <Button type="button" color="secondary" size="md" onClick={onCancel} iconLeading={X}>
          Cancel
        </Button>
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
      className="flex flex-col gap-4 p-5 md:p-6"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Name"
          size="md"
          value={draft.name}
          onChange={(v) => setDraft({ ...draft, name: v })}
        />
        <NativeSelect
          label="Role"
          size="md"
          value={draft.role}
          onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          options={[
            { label: "Cameraman", value: "cameraman" },
            { label: "Management", value: "management" },
            { label: "Editor", value: "editor" },
            { label: "Technical productions", value: "producer" },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-secondary pt-4">
        <Button type="submit" color="primary" size="md" iconLeading={Check}>
          Save changes
        </Button>
        <Button type="button" color="secondary" size="md" onClick={onCancel} iconLeading={X}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
