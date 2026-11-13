"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowUpRight, Check, X } from "lucide-react";
import { CONTRIBUTOR_ROLES, communitySubmissionSchema, type CommunitySubmission } from "@/lib/contributors/validation";
import { Select } from "@/components/base/select/select";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { UNSAFE_PortalProvider } from "react-aria";

type Kind = CommunitySubmission["kind"];
type Draft = { name: string; contact: string; role: string; portfolio: string; message: string; ageConfirmed: boolean };
const emptyDraft = (): Draft => ({ name: "", contact: "", role: "", portfolio: "", message: "", ageConfirmed: false });

export function ContributorForm({ open, onOpenChange, onReturnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; onReturnFocus: () => void }) {
  const prefix = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [kind, setKind] = useState<Kind>("help");
  const [drafts, setDrafts] = useState<Record<Kind, Draft>>({ help: emptyDraft(), suggestion: emptyDraft() });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setToken(""); setError(""); setSent(false);
    fetch("/api/contributors", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || "Please try again later.");
      setToken(data.token);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Please try again later.");
    });
    return () => controller.abort();
  }, [open]);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const visual = window.visualViewport;
    const update = () => setViewport({ height: visual.height, top: visual.offsetTop });
    update(); visual.addEventListener("resize", update); visual.addEventListener("scroll", update);
    return () => { visual.removeEventListener("resize", update); visual.removeEventListener("scroll", update); };
  }, [open]);
  useEffect(() => {
    if (!sent) return;
    modalRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [sent]);


  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token) return;
    const form = new FormData(event.currentTarget);
    const draft = drafts[kind];
    const parsed = communitySubmissionSchema.safeParse({
      kind, contact: draft.contact, message: draft.message,
      ...(kind === "help" ? { name: draft.name, role: draft.role, portfolio: draft.portfolio, ageConfirmed: draft.ageConfirmed } : {}),
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Please check the form."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/contributors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: parsed.data, token, website: form.get("website") || "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send your submission.");
      setDrafts(previous => ({ ...previous, [kind]: emptyDraft() }));
      setSent(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not send your submission. Please try again.");
    } finally { setBusy(false); }
  }

  function renderForm(mode: Kind) {
    const draft = drafts[mode];
    const update = (value: Partial<Draft>) => setDrafts(previous => ({ ...previous, [mode]: { ...previous[mode], ...value } }));
    const id = (name: string) => `${prefix}-${mode}-${name}`;
    return (
      <form onSubmit={submit} className="contribute-form" aria-busy={busy}>
        <fieldset className="contribute-fields" disabled={busy}>
          {mode === "help" ? <>
            <div className="contribute-grid">
              <label className="contribute-field" htmlFor={id("name")}>
                <span>Name</span><input id={id("name")} name="name" required maxLength={120} autoComplete="name" value={draft.name} onChange={event => update({ name: event.target.value })} />
              </label>
              <label className="contribute-field" htmlFor={id("contact")}>
                <span>Email or handle</span><input id={id("contact")} name="contact" required minLength={2} maxLength={120} placeholder="Email, X, or Discord" value={draft.contact} onChange={event => update({ contact: event.target.value })} />
              </label>
            </div>
            <UNSAFE_PortalProvider getContainer={() => modalRef.current}>
              <Select label="How would you like to help?" name="role" placeholder="Choose a role"
                isRequired hideRequiredIndicator selectedKey={draft.role || null}
                onSelectionChange={key => update({ role: key == null ? "" : String(key) })}
                items={CONTRIBUTOR_ROLES.map(role => ({ id: role, label: role }))}
                className="contribute-role" popoverClassName="contribute-role-popover" size="md">
                {item => <Select.Item id={item.id} label={item.label} />}
              </Select>
            </UNSAFE_PortalProvider>
            <label className="contribute-field" htmlFor={id("portfolio")}>
              <span>Link to your work<small>Optional</small></span>
              <input id={id("portfolio")} name="portfolio" type="url" maxLength={500} placeholder="https://" value={draft.portfolio} onChange={event => update({ portfolio: event.target.value })} />
            </label>
          </> : null}
          <label className="contribute-field" htmlFor={id("message")}>
            <span>{mode === "help" ? "Tell us a little about what you can do" : "What would you like to suggest?"}</span>
            <textarea id={id("message")} name="message" required minLength={mode === "help" ? 20 : 10} maxLength={2000} rows={mode === "help" ? 3 : 5} placeholder={mode === "help" ? "Your skills, ideas, or what you’d like to work on…" : "An idea, improvement, or something we should fix…"} value={draft.message} onChange={event => update({ message: event.target.value })} />
          </label>
          {mode === "suggestion" ? <label className="contribute-field" htmlFor={id("contact")}>
            <span>Email or handle<small>Optional</small></span>
            <input id={id("contact")} name="contact" maxLength={120} placeholder="If you’d like a reply" value={draft.contact} onChange={event => update({ contact: event.target.value })} />
          </label> : null}
          <div className="contribute-trap" aria-hidden="true"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          {mode === "help" ? <Checkbox name="ageConfirmed" size="md" className="contribute-age"
            isRequired isSelected={draft.ageConfirmed} onChange={ageConfirmed => update({ ageConfirmed })}
            label="I am 18 years of age or older." /> : null}
        </fieldset>
        <p className="contribute-privacy">Sent privately to site admins. <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy policy ↗</a></p>
        {error ? <p className="contribute-error" role="alert">{error}</p> : null}
        <button type="submit" className="contribute-submit" disabled={busy || !token}>{busy ? "Sending…" : !token && !error ? "Preparing form…" : mode === "help" ? "Sign up to help" : "Send suggestion"}<ArrowUpRight size={16} aria-hidden /></button>
        {!token && error ? <button type="button" className="contribute-retry" onClick={() => onOpenChange(false)}>Close and try again</button> : null}
      </form>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="contribute-overlay" />
        <div className="contribute-viewport" style={viewport ? { height: viewport.height, top: viewport.top } : undefined}>
          <Dialog.Content ref={modalRef} className={`contribute-modal${sent ? " is-confirmation" : ""}`} data-lenis-prevent
            onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}
            onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }}>
            <Dialog.Close className="contribute-close" aria-label="Close form" disabled={busy}><X size={19} aria-hidden /></Dialog.Close>
            <header className="contribute-intro">
              {sent ? <div className="contribute-success-icon"><Check size={28} aria-hidden /></div> : null}
              <Dialog.Title ref={titleRef} tabIndex={-1}>{sent ? "Thanks!" : "Help & suggestions"}</Dialog.Title>
              <Dialog.Description className={sent ? undefined : "contribute-sr-only"}>{sent ? (kind === "help" ? "Your signup is in the admin inbox. We can follow up using your contact details." : "Your suggestion is in the admin inbox.") : "Sign up to help with the site or send an idea to the admins."}</Dialog.Description>
            </header>
            {sent ? <div className="contribute-success"><Dialog.Close className="contribute-submit">Done<Check size={16} aria-hidden /></Dialog.Close></div> : (
              <Tabs.Root className="contribute-tabs" value={kind} onValueChange={value => { setKind(value as Kind); setError(""); }}>
                <Tabs.List className="contribute-switch" aria-label="Choose a form" data-kind={kind}>
                  <span className="contribute-switch-indicator" aria-hidden="true" />
                  <Tabs.Trigger value="help" disabled={busy}>Sign up to help</Tabs.Trigger>
                  <Tabs.Trigger value="suggestion" disabled={busy}>Suggest something</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="help">{renderForm("help")}</Tabs.Content>
                <Tabs.Content value="suggestion">{renderForm("suggestion")}</Tabs.Content>
              </Tabs.Root>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
