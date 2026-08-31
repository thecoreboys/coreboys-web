"use client";
/* eslint-disable @next/next/no-img-element -- Local campaign artwork is deliberately rendered as a CSS-like panel background. */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "@untitledui/icons";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { useAuth } from "@/components/providers/AuthProvider";
import { AUTH_MODAL_EVENT, type AuthModalRequest } from "@/lib/auth/modal";
import { authErrorClass } from "./AuthShell";

type AuthMode = "login" | "signup";
const SLIDE_DURATION_MS = 5_000;

const SLIDES = [
  { label: "WATCH HISTORY", title: "Continue on any device.", copy: "Sign in and CORE remembers where you stopped.", art: "/brand/supporter/signal-room-v1.png" },
  { label: "DVR", title: "Keep a private watch list.", copy: "Save programs in folders and add notes or tags for later.", art: "/brand/supporter/cloud-dvr-v1.png" },
  { label: "LIVE ALERTS", title: "Choose which alerts you get.", copy: "Follow the channels you care about and set quiet hours when you do not want notifications.", art: "/brand/supporter/signal-room-v1.png" },
  { label: "MULTIVIEW", title: "Save your screen layout.", copy: "Return to the same streams, chats, and arrangement the next time you open multiview.", art: "/brand/supporter/cloud-dvr-v1.png" },
] as const;

function safeNext(value: string | null | undefined, fallback: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}

function authModeFrom(value: string | null): AuthMode | null {
  return value === "login" || value === "signup" ? value : null;
}

export function AuthModal() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const modalRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<AuthMode | null>(() => authModeFrom(params.get("auth")));
  const [nextPath, setNextPath] = useState(() => safeNext(params.get("next"), pathname));
  const [slide, setSlide] = useState(0);
  const [carouselCycle, setCarouselCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const open = useCallback((nextMode: AuthMode, next?: string | null) => {
    const query = new URLSearchParams(window.location.search);
    query.set("auth", nextMode);
    const safe = safeNext(next, `${window.location.pathname}${window.location.search}`);
    query.set("next", safe);
    window.history.pushState(window.history.state, "", `${window.location.pathname}?${query}`);
    setNextPath(safe);
    setMode(nextMode);
  }, []);

  const close = useCallback(() => {
    const query = new URLSearchParams(window.location.search);
    query.delete("auth");
    query.delete("next");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query.size ? `?${query}` : ""}`);
    setMode(null);
  }, []);

  useEffect(() => {
    const interceptAuthLink = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = new URL(target.href, window.location.origin);
      const nextMode = href.pathname === "/login" ? "login" : href.pathname === "/signup" ? "signup" : null;
      if (!nextMode || href.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      open(nextMode, href.searchParams.get("next"));
    };
    // Capture means Next's Link handler never begins navigating to /login
    // before this shared modal has a chance to handle the request.
    document.addEventListener("click", interceptAuthLink, true);
    return () => document.removeEventListener("click", interceptAuthLink, true);
  }, [open]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const request = (event as CustomEvent<AuthModalRequest>).detail;
      open(request?.mode ?? "login", request?.next);
    };
    window.addEventListener(AUTH_MODAL_EVENT, onOpen);
    return () => window.removeEventListener(AUTH_MODAL_EVENT, onOpen);
  }, [open]);

  useEffect(() => {
    const syncWithHistory = () => {
      const query = new URLSearchParams(window.location.search);
      setMode(authModeFrom(query.get("auth")));
      setNextPath(safeNext(query.get("next"), pathname));
    };
    window.addEventListener("popstate", syncWithHistory);
    return () => window.removeEventListener("popstate", syncWithHistory);
  }, [pathname]);

  useEffect(() => {
    if (!mode) return;
    for (const art of new Set(SLIDES.map((entry) => entry.art))) {
      const image = new Image();
      image.decoding = "async";
      image.src = art;
    }
  }, [mode]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const selectSlide = useCallback((value: number) => {
    setSlide(value);
    setCarouselCycle((cycle) => cycle + 1);
  }, []);

  useEffect(() => {
    if (!mode || paused || reducedMotion) return;
    const timer = window.setTimeout(() => {
      setSlide((value) => (value + 1) % SLIDES.length);
      setCarouselCycle((cycle) => cycle + 1);
    }, SLIDE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [carouselCycle, mode, paused, reducedMotion]);

  useEffect(() => {
    if (mode) return;
    setSlide(0);
    setCarouselCycle((cycle) => cycle + 1);
  }, [mode]);

  const setShowcasePaused = useCallback((value: boolean) => {
    setPaused(value);
    setCarouselCycle((cycle) => cycle + 1);
  }, []);

  useEffect(() => {
    if (!mode) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => modalRef.current?.querySelector<HTMLElement>("input,button,[href]")?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter((node) => !node.hasAttribute("aria-hidden"));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = priorOverflow; document.removeEventListener("keydown", keydown); };
  }, [close, mode]);

  if (!mode) return null;
  return (
    <div className="auth-modal-backdrop fixed inset-0 z-[120] flex items-end bg-black/80 p-0 backdrop-blur-xl sm:items-center sm:justify-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" className="auth-modal-panel grid max-h-[100dvh] w-full overflow-y-auto rounded-t-[1.6rem] border border-white/12 bg-[#151518] shadow-[0_34px_140px_rgba(0,0,0,.76)] sm:max-h-[min(46rem,calc(100dvh-2.5rem))] sm:max-w-5xl sm:grid-cols-[minmax(0,1.05fr)_minmax(25rem,.95fr)] sm:overflow-hidden sm:rounded-3xl">
        <AuthShowcase slide={slide} cycle={carouselCycle} isPaused={paused} reducedMotion={reducedMotion} onSlide={selectSlide} onPause={setShowcasePaused} />
        <div className="auth-modal-form relative flex min-h-[34rem] flex-col px-5 py-6 sm:min-h-0 sm:px-10 sm:py-9">
          <button type="button" onClick={close} className="absolute right-4 top-4 grid size-10 place-items-center rounded-xl text-white/45 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label="Close sign in"><X className="size-4" /></button>
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
            <h1 id="auth-modal-title" className="text-3xl font-semibold tracking-[-.045em] text-white">{mode === "login" ? "Welcome back." : "Create your account."}</h1>
            <p className="mt-2 text-sm leading-5 text-white/48">{mode === "login" ? "Sign in to sync your watch history and settings." : "A free account saves your watch history and settings."}</p>
            {mode === "login" ? <LoginForm onSwitch={() => open("signup", nextPath)} onComplete={(destination) => router.push(destination as never)} next={nextPath} /> : <SignupForm onSwitch={() => open("login", nextPath)} onComplete={(destination) => router.push(destination as never)} next={nextPath || "/account"} />}
          </div>
        </div>
      </section>
    </div>
  );
}

function AuthShowcase({ slide, cycle, isPaused, reducedMotion, onSlide, onPause }: { slide: number; cycle: number; isPaused: boolean; reducedMotion: boolean; onSlide: (value: number) => void; onPause: (value: boolean) => void }) {
  const active = SLIDES[slide]!;
  return <aside className="auth-modal-showcase relative isolate hidden min-h-0 overflow-hidden p-5 sm:block" onMouseEnter={() => onPause(true)} onMouseLeave={() => onPause(false)} onFocusCapture={() => onPause(true)} onBlurCapture={() => onPause(false)}>
    <img src={active.art} alt="" aria-hidden decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-75 transition-opacity duration-500" />
    <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(7,7,9,.04),rgba(7,7,9,.2)_42%,rgba(7,7,9,.95))]" />
    <div className="flex h-full flex-col justify-end">
      <h2 className="max-w-sm text-4xl font-semibold leading-[.94] tracking-[-.055em] text-white">{active.title}</h2>
      <p className="mt-4 max-w-sm text-sm leading-6 text-white/68">{active.copy}</p>
      <div className="mt-7 flex items-center gap-2" role="tablist" aria-label="Account feature slides">
        <button type="button" onClick={() => onSlide((slide + SLIDES.length - 1) % SLIDES.length)} className="grid size-9 place-items-center rounded-lg bg-black/30 text-white/70 ring-1 ring-white/12 transition hover:bg-black/55 hover:text-white" aria-label="Previous feature"><ChevronLeft className="size-4" /></button>
        <div className="flex flex-1 gap-1.5">{SLIDES.map((entry, index) => <button key={entry.label} type="button" onClick={() => onSlide(index)} role="tab" aria-selected={index === slide} aria-label={`Show ${entry.label.toLowerCase()}`} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/22 transition hover:bg-white/35">{index < slide ? <span className="absolute inset-y-0 left-0 w-full rounded-full bg-white" /> : null}{index === slide && !isPaused && !reducedMotion ? <span key={`${slide}-${cycle}`} className="auth-showcase-progress absolute inset-y-0 left-0 rounded-full bg-white" /> : null}</button>)}</div>
        <button type="button" onClick={() => onSlide((slide + 1) % SLIDES.length)} className="grid size-9 place-items-center rounded-lg bg-black/30 text-white/70 ring-1 ring-white/12 transition hover:bg-black/55 hover:text-white" aria-label="Next feature"><ChevronRight className="size-4" /></button>
      </div>
    </div>
  </aside>;
}

function LoginForm({ next, onSwitch, onComplete }: { next: string; onSwitch: () => void; onComplete: (destination: string) => void }) {
  const { refresh } = useAuth(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setLoading(true); setError(null); try { const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); const data = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) { setError(data.error ?? "We couldn't sign you in. Check your email and password, then try again."); return; } await refresh(); onComplete(next); } catch { setError("Couldn't reach the server. Check your connection and try again."); } finally { setLoading(false); } }
  return <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">{error ? <p className={authErrorClass} role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{error}</span></p> : null}<Input isRequired size="md" label="Email" type="email" name="email" autoComplete="email" value={email} onChange={setEmail} isInvalid={error ? true : undefined} placeholder="you@email.com" /><Input isRequired size="md" label="Password" type="password" name="password" autoComplete="current-password" value={password} onChange={setPassword} isInvalid={error ? true : undefined} placeholder="••••••••" /><Button type="submit" size="lg" color="primary" isLoading={loading} className="mt-1 w-full">Sign in</Button><p className="text-center text-xs text-white/48">New to CoreTV? <button type="button" onClick={onSwitch} className="font-semibold text-rose-300 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200">Create a free account</button></p></form>;
}

function SignupForm({ next, onSwitch, onComplete }: { next: string; onSwitch: () => void; onComplete: (destination: string) => void }) {
  const { refresh } = useAuth(); const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [consent, setConsent] = useState(false); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!consent) { setError("Please tick the box to agree to the Terms and Privacy Policy before continuing."); return; } setLoading(true); setError(null); try { const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, email, password, consent }) }); const data = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) { setError(data.error ?? "We couldn't create your account. Double-check your details and try again."); return; } await refresh(); onComplete(next); } catch { setError("Couldn't reach the server. Check your connection and try again."); } finally { setLoading(false); } }
  return <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">{error ? <p className={authErrorClass} role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{error}</span></p> : null}<Input isRequired size="md" label="Name" type="text" name="name" autoComplete="name" value={displayName} onChange={setDisplayName} placeholder="Your name" /><Input isRequired size="md" label="Email" type="email" name="email" autoComplete="email" value={email} onChange={setEmail} placeholder="you@email.com" /><Input isRequired size="md" label="Password" type="password" name="password" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} placeholder="At least 8 characters" hint="Use 8 or more characters with a mix of letters and numbers." /><Checkbox size="md" isSelected={consent} onChange={setConsent} isInvalid={error && !consent ? true : undefined} label={<span className="text-tertiary">I confirm I am 13 or older and agree to the <Link href="/legal/terms" className="font-medium text-brand-secondary hover:underline">Terms</Link> and <Link href="/legal/privacy" className="font-medium text-brand-secondary hover:underline">Privacy Policy</Link>.</span>} /><Button type="submit" size="lg" color="primary" isLoading={loading} iconTrailing={ArrowRight} className="mt-1 w-full">Create free account</Button><p className="text-center text-xs text-white/48">Already have an account? <button type="button" onClick={onSwitch} className="font-semibold text-rose-300 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200">Sign in</button></p></form>;
}
