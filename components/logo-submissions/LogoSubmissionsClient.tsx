"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowBigDown, ArrowBigUp, FileText, UploadCloud } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

type PublicFile = { id: string; file_name: string; content_type: string; file_role: string; url: string };
type Submission = { id: string; publicName: string; designName: string; description: string; submittedAt: string; upvotes: number; files: PublicFile[] };
const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/svg+xml,application/pdf,application/zip";

export function LogoSubmissionsClient() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());
  const [voteStart] = useState(() => Date.now());

  useEffect(() => {
    void fetch("/api/logo-submissions", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setItems(data.submissions ?? []))
      .catch(() => setError("Public submissions are unavailable right now."));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    form.set("startedAt", String(startedAt.current));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/logo-submissions", { method: "POST", credentials: "same-origin", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not send your submission.");
      event.currentTarget.reset();
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send your submission.");
    } finally {
      setBusy(false);
    }
  }

  async function vote(id: string, voteType: "up" | "down") {
    setError(null);
    try {
      const response = await fetch(`/api/logo-submissions/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: voteType, company: "", startedAt: voteStart }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Vote not saved.");
      setItems((current) => current.map((item) => item.id === id ? { ...item, upvotes: data.upvotes } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vote not saved.");
    }
  }

  return (
    <div className="space-y-16">
      {!loading && user ? (
        <section className="border-y border-secondary py-8 md:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.55fr)]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-primary md:text-3xl">Submit work.</h2>
              <p className="mt-3 max-w-[62ch] text-sm leading-6 text-tertiary">
                Send a wordmark, icon, and anything else that helps explain the idea. It stays private while the team reviews it.
              </p>
            </div>
            <p className="border-l border-brand-solid pl-4 text-sm leading-6 text-tertiary">
              Not every submission will be used, but every complete submission will be reviewed.
            </p>
          </div>
          {sent ? (
            <div className="mt-8 border-l-2 border-brand-solid py-2 pl-4 text-sm leading-6 text-primary">
              Received. It is now in review and will remain private unless the team approves it.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-9 grid gap-6" encType="multipart/form-data">
              <input className="absolute -left-[9999px]" tabIndex={-1} aria-hidden name="company" autoComplete="off" />
              <div className="grid gap-6 md:grid-cols-2">
                <TextField label="Name this direction" name="designName" placeholder="Midnight Signal" required />
                <TextField label="How should we credit you?" name="publicName" placeholder="Your public submission name" required />
              </div>
              <label className="block text-sm font-medium text-secondary">
                Tell us what you were trying to solve
                <textarea required name="description" minLength={20} maxLength={2500} rows={5} placeholder="The idea behind the mark, how the wordmark and icon relate, and where you picture it being used." className="mt-2 w-full border border-secondary bg-primary px-3 py-3 text-sm leading-6 text-primary outline-none placeholder:text-placeholder focus:border-brand-solid" />
              </label>
              <div className="grid gap-6 md:grid-cols-2">
                <FileField label="Upload the wordmark" name="wordmark" required />
                <FileField label="Upload the icon" name="icon" required />
              </div>
              <FileField label="Supporting files, if useful" name="additional" multiple hint="Optional: color studies, mockups, source exports, or a short PDF. Up to 8 files." />
              {error ? <p role="alert" className="text-sm text-error-primary">{error}</p> : null}
              <button disabled={busy} className="inline-flex w-fit items-center gap-2 bg-brand-solid px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-solid_hover disabled:opacity-60"><UploadCloud className="size-4" />{busy ? "Sending…" : "Send for review"}</button>
            </form>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-primary">Public submissions.</h2>
        {error ? <p role="alert" className="mt-4 text-sm text-error-primary">{error}</p> : null}
        {items.length ? (
          <div className="mt-7 grid gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item, index) => <SubmissionCase key={item.id} item={item} index={index} onVote={vote} />)}
          </div>
        ) : (
          <p className="mt-7 border-t border-secondary pt-5 text-sm text-tertiary">No approved submissions yet.</p>
        )}
      </section>
    </div>
  );
}

function SubmissionCase({ item, index, onVote }: { item: Submission; index: number; onVote: (id: string, vote: "up" | "down") => Promise<void> }) {
  const lead = item.files.find((file) => file.file_role === "wordmark") ?? item.files[0];
  const supporting = item.files.filter((file) => file.id !== lead?.id);
  return (
    <article className={`border-t border-secondary pt-4 ${index % 5 === 0 ? "md:col-span-2 xl:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div><h3 className="text-xl font-semibold tracking-tight text-primary">{item.designName}</h3><p className="mt-1 text-sm text-tertiary">{item.publicName}</p></div>
        <time className="shrink-0 font-mono text-[10px] uppercase tracking-[.12em] text-quaternary">{new Date(item.submittedAt).toLocaleDateString()}</time>
      </div>
      {lead ? <LogoFile file={lead} designName={item.designName} large={index % 5 === 0} /> : null}
      <p className="mt-4 max-w-[68ch] text-sm leading-6 text-tertiary">{item.description}</p>
      {supporting.length ? <div className="mt-5 grid max-w-[42rem] grid-cols-2 gap-px bg-secondary">{supporting.map((file) => <LogoFile key={file.id} file={file} designName={item.designName} />)}</div> : null}
      <div className="mt-5 flex items-center gap-2">
        <button onClick={() => void onVote(item.id, "up")} className="inline-flex items-center gap-1 border border-secondary px-3 py-2 text-sm font-semibold text-primary transition hover:border-brand-solid" aria-label={`Upvote ${item.designName}`}><ArrowBigUp className="size-4" />{item.upvotes}</button>
        <button onClick={() => void onVote(item.id, "down")} className="border border-transparent p-2 text-tertiary transition hover:border-secondary hover:text-secondary" aria-label={`Downvote ${item.designName}`}><ArrowBigDown className="size-4" /></button>
      </div>
    </article>
  );
}

function LogoFile({ file, designName, large = false }: { file: PublicFile; designName: string; large?: boolean }) {
  const isImage = file.content_type.startsWith("image/") && file.content_type !== "image/svg+xml";
  return <a href={file.url} target="_blank" rel="noreferrer" className={`group block bg-secondary p-3 transition hover:bg-primary ${large ? "mt-5" : ""}`}>
    {isImage ? <img src={file.url} alt={`${designName} ${file.file_role}`} className={`${large ? "aspect-[2.4/1]" : "aspect-[1.5/1]"} w-full object-contain`} /> : <span className={`${large ? "aspect-[2.4/1]" : "aspect-[1.5/1]"} grid place-items-center bg-primary`}><FileText className="size-7 text-brand-secondary" /></span>}
    <span className="mt-2 block truncate font-mono text-[10px] uppercase tracking-[.12em] text-tertiary">{file.file_role} · {file.file_name}</span>
  </a>;
}

function TextField({ label, name, placeholder, required }: { label: string; name: string; placeholder: string; required?: boolean }) {
  return <label className="block text-sm font-medium text-secondary">{label}<input required={required} name={name} placeholder={placeholder} className="mt-2 h-11 w-full border border-secondary bg-primary px-3 text-sm text-primary outline-none placeholder:text-placeholder focus:border-brand-solid" /></label>;
}

function FileField({ label, name, required, multiple, hint }: { label: string; name: string; required?: boolean; multiple?: boolean; hint?: string }) {
  return <label className="block border-y border-secondary py-4 text-sm font-medium text-secondary"><span className="flex items-center gap-2"><UploadCloud className="size-4 text-brand-secondary" />{label}</span><input required={required} multiple={multiple} name={name} type="file" accept={ACCEPT} className="mt-3 block w-full text-xs text-tertiary file:mr-3 file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-secondary" />{hint ? <span className="mt-2 block text-xs font-normal text-tertiary">{hint}</span> : null}</label>;
}
