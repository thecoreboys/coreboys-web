"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Check, Sparkles, X } from "lucide-react";
import { CONTRIBUTOR_ROLES, contributorSchema } from "@/lib/contributors/validation";
import { useContributorLauncher } from "@/hooks/useContributorLauncher";
import { OPEN_CONTRIBUTOR_FORM_EVENT } from "@/lib/site-utility-events";

export function ContributorWidget() {
  const pathname = usePathname(); const prefix = useId();
  const launcher = useContributorLauncher(pathname);
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const [open, setOpen] = useState(false); const [token, setToken] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_CONTRIBUTOR_FORM_EVENT, show);
    return () => window.removeEventListener(OPEN_CONTRIBUTOR_FORM_EVENT, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setToken(""); setError(""); setSent(false);
    fetch("/api/contributors", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok || !data.token) throw new Error(data.error || "Please try again later."); setToken(data.token);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Please try again later."); });
    return () => controller.abort();
  }, [open]);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const visual = window.visualViewport;
    const update = () => setViewport({ height: visual.height, top: visual.offsetTop });
    update(); visual.addEventListener('resize', update); visual.addEventListener('scroll', update);
    return () => { visual.removeEventListener('resize', update); visual.removeEventListener('scroll', update); };
  }, [open]);
  useEffect(() => {
    if (!sent) return;
    modalRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [sent]);
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/studio") || pathname?.startsWith("/access")) return null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !token) return;
    const form = new FormData(event.currentTarget);
    const parsed = contributorSchema.safeParse({ ...Object.fromEntries(["firstName", "lastName", "phone", "twitter", "discord", "portfolio", "role", "how"].map(key => [key, form.get(key) || ""])), ageConfirmed: form.get("ageConfirmed") === "on" });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Please check your details."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/contributors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ details: parsed.data, token, website: form.get("website") || "" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not send your application.");
      setSent(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not send your application. Please try again."); }
    finally { setBusy(false); }
  }
  const field = (name: string, label: string, options: { optional?: boolean; type?: string; placeholder?: string; max?: number; autoComplete?: string } = {}) => <label className="contribute-field" htmlFor={`${prefix}-${name}`}><span>{label}{options.optional ? <small>Optional</small> : null}</span><input id={`${prefix}-${name}`} name={name} type={options.type || "text"} required={!options.optional} maxLength={options.max || 60} placeholder={options.placeholder} autoComplete={options.autoComplete || "off"} /></label>;
  return <Dialog.Root open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
    <Dialog.Trigger asChild><button ref={launcher.ref} className="contribute-launcher" data-occluded={launcher.placement.hidden ? "true" : undefined} style={{ transform: `translateY(-${launcher.placement.lift}px)` }}><Sparkles size={17} aria-hidden /><span>Help make this site better!</span><ArrowUpRight size={14} aria-hidden /></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="contribute-overlay" /><div className="contribute-viewport" style={viewport ? { height: viewport.height, top: viewport.top } : undefined}><Dialog.Content ref={modalRef} className={`contribute-modal${sent ? ' is-confirmation' : ''}`} data-lenis-prevent onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }} onCloseAutoFocus={event => { if (!launcher.ref.current?.getClientRects().length) { event.preventDefault(); document.querySelector<HTMLButtonElement>('[aria-controls="mobile-navigation"]')?.focus(); } }}>
      <Dialog.Close className="contribute-close" aria-label="Close application" disabled={busy}><X size={19} aria-hidden /></Dialog.Close>
      <header className="contribute-intro">{sent ? <div className="contribute-success-icon"><Check size={28} aria-hidden /></div> : null}<Dialog.Title ref={titleRef} tabIndex={-1}>{sent ? 'Application received.' : 'Make your mark.'}</Dialog.Title><Dialog.Description>{sent ? 'Thanks for helping make this site better. Your application has been sent to our admins.' : 'A little skill. A big difference. Help shape the next version of this fan site.'}</Dialog.Description></header>
      {sent ? <div className="contribute-success"><div className="contribute-next"><h3>What happens next?</h3><p>The admins will review your application and can get in touch through the contact details you provided.</p></div><Dialog.Close className="contribute-submit">Back to the site<ArrowUpRight size={16} aria-hidden /></Dialog.Close></div> : <form onSubmit={submit} className="contribute-form" aria-busy={busy}>
        <div className="contribute-grid">
          {field("firstName", "First name", { autoComplete: "given-name" })}{field("lastName", "Last name", { autoComplete: "family-name" })}
          {field("twitter", "Twitter / X handle", { optional: true, placeholder: "@yourhandle", max: 80 })}{field("discord", "Discord handle", { optional: true, placeholder: "yourusername", max: 80 })}
          {field("phone", "Phone number", { optional: true, type: "tel", autoComplete: "tel", max: 35 })}{field("portfolio", "Portfolio", { optional: true, type: "url", placeholder: "https://yourwork.com", max: 500 })}
        </div>
        <p className="contribute-hint">Add at least one handle so we can get in touch.</p>
        <label className="contribute-field" htmlFor={`${prefix}-role`}><span>Your role</span><select id={`${prefix}-role`} name="role" required defaultValue=""><option value="" disabled>Choose where you fit</option>{CONTRIBUTOR_ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
        <label className="contribute-field" htmlFor={`${prefix}-how`}><span>How can you help?</span><textarea id={`${prefix}-how`} name="how" required minLength={20} maxLength={2000} rows={3} placeholder="Tell us what you’d love to work on…" /></label>
        <div className="contribute-trap" aria-hidden="true"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <label className="contribute-age"><input name="ageConfirmed" type="checkbox" required /><span>I confirm that I am 13 years old or older.</span></label>
        <p className="contribute-privacy">Your details are shared with site admins to review your application and contact you. Please don’t include sensitive information. <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy policy ↗</a></p>
        {error ? <p className="contribute-error" role="alert">{error}</p> : null}
        <button type="submit" className="contribute-submit" disabled={busy || !token}>{busy ? "Sending…" : !token && !error ? "Preparing form…" : "Send application"}<ArrowUpRight size={16} aria-hidden /></button>
        {!token && error ? <button type="button" className="contribute-retry" onClick={() => { setOpen(false); }}>Close and try again</button> : null}
      </form>}
    </Dialog.Content></div></Dialog.Portal>
  </Dialog.Root>;
}
