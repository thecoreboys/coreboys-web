"use client";

import { useCallback, useEffect, useState } from "react";
import type { StudioProfile } from "@/lib/studio-profile";

const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition focus:border-brand";

export function StudioProfileEditor({ memberSlug }: { memberSlug: string }) {
  const [profile, setProfile] = useState<StudioProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endpoint = `/api/studio/profile?member=${encodeURIComponent(memberSlug)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as { profile?: StudioProfile; error?: string };
      if (!response.ok || !json.profile) throw new Error(json.error ?? "Unable to load this profile.");
      setProfile(json.profile);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load this profile.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: profile.bio,
          commName: profile.commName,
          favoriteGame: profile.favoriteGame,
          description: profile.description,
          nickname: profile.nickname,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { profile?: StudioProfile; error?: string };
      if (!response.ok || !json.profile) throw new Error(json.error ?? "Unable to save this profile.");
      setProfile(json.profile);
      setNotice("Profile saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-primary" />;
  if (!profile) return <p role="alert" className="text-sm text-error-primary">{error ?? "Profile unavailable."}</p>;

  return (
    <form onSubmit={save} className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs md:p-6">
      <div>
        <p className="text-sm font-semibold text-brand-secondary">Public profile fields</p>
        <h2 className="mt-1 text-xl font-semibold text-primary">{profile.stageName}</h2>
        <p className="mt-1 text-sm text-tertiary">Blank values restore the site default. Global identity, account access, and other members stay admin-only.</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-semibold text-tertiary">Community name<input maxLength={80} className={inputClass} value={profile.commName} onChange={(event) => setProfile({ ...profile, commName: event.target.value })} /></label>
        <label className="text-xs font-semibold text-tertiary">Nickname<input maxLength={80} className={inputClass} value={profile.nickname} onChange={(event) => setProfile({ ...profile, nickname: event.target.value })} /></label>
        <label className="text-xs font-semibold text-tertiary">Favorite game<input maxLength={120} className={inputClass} value={profile.favoriteGame} onChange={(event) => setProfile({ ...profile, favoriteGame: event.target.value })} /></label>
      </div>
      <label className="mt-4 block text-xs font-semibold text-tertiary">Bio<textarea maxLength={2000} rows={5} className={inputClass} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /></label>
      <label className="mt-4 block text-xs font-semibold text-tertiary">Long description<textarea maxLength={4000} rows={7} className={inputClass} value={profile.description} onChange={(event) => setProfile({ ...profile, description: event.target.value })} /></label>

      {error ? <p role="alert" className="mt-4 text-sm text-error-primary">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 text-sm text-success-primary">{notice}</p> : null}
      <button type="submit" disabled={saving} className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white transition hover:bg-brand-solid_hover disabled:opacity-50">{saving ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
