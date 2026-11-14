"use client";
/* eslint-disable @next/next/no-img-element -- Local campaign artwork is deliberately rendered as a CSS-like panel background. */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { AUTH_MODAL_EVENT, type AuthModalMode, type AuthModalRequest } from "@/lib/auth/modal";
import { safeAuthNext } from "@/lib/auth/password-reset";
import { dialogTabBoundary, visibleDialogControls } from "@/lib/auth/modal-focus";

// Keep the global event/link listeners immediate while requesting the form
// controls only after the visitor opens sign in or create account.
function FormLoading() {
  return <p role="status" className="mt-7 text-sm text-white/60">Loading secure form…</p>;
}
const LoginForm = dynamic(() => import("./AuthModalForms").then((module) => module.LoginForm), { loading: FormLoading });
const SignupForm = dynamic(() => import("./AuthModalForms").then((module) => module.SignupForm), { loading: FormLoading });
const ForgotPasswordForm = dynamic(() => import("./AuthModalForms").then((module) => module.ForgotPasswordForm), { loading: FormLoading });

type AuthMode = AuthModalMode;
const SLIDE_DURATION_MS = 5_000;

const SLIDES = [
  { label: "WATCH HISTORY", title: "Continue on any device.", copy: "Sign in and CORE remembers where you stopped.", art: "/brand/supporter/signal-room-v1.png" },
  { label: "DVR", title: "Keep a private watch list.", copy: "Save programs in folders and add notes or tags for later.", art: "/brand/supporter/cloud-dvr-v1.png" },
  { label: "LIVE ALERTS", title: "Choose which alerts you get.", copy: "Follow the channels you care about and set quiet hours when you do not want notifications.", art: "/brand/supporter/signal-room-v1.png" },
  { label: "MULTIVIEW", title: "Save your screen layout.", copy: "Return to the same streams, chats, and arrangement the next time you open multiview.", art: "/brand/supporter/cloud-dvr-v1.png" },
] as const;

function safeNext(value: string | null | undefined, fallback: string) {
  return safeAuthNext(value, fallback);
}

function authModeFrom(value: string | null): AuthMode | null {
  return value === "login" || value === "signup" || value === "forgot-password" ? value : null;
}

export function AuthModal() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requestedMode = authModeFrom(params.get("auth"));
  const requestedNextPath = safeNext(params.get("next"), pathname);
  const modalRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<AuthMode | null>(requestedMode);
  const [nextPath, setNextPath] = useState(requestedNextPath);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const activeSlideRef = useRef(0);
  const remainingMsRef = useRef(SLIDE_DURATION_MS);
  const deadlineRef = useRef<number | null>(null);

  useEffect(() => {
    // The root layout survives account-page redirects and client navigation.
    // Follow the destination query even when this modal was already mounted.
    setMode(requestedMode);
    setNextPath(requestedNextPath);
  }, [requestedMode, requestedNextPath]);

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

  const complete = useCallback((destination: string) => {
    close();
    router.push(destination as never);
  }, [close, router]);

  useEffect(() => {
    const interceptAuthLink = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = new URL(target.href, window.location.origin);
      const nextMode = href.pathname === "/login" ? "login" : href.pathname === "/signup" ? "signup" : href.pathname === "/forgot-password" ? "forgot-password" : null;
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
    activeSlideRef.current = value;
    remainingMsRef.current = SLIDE_DURATION_MS;
    setSlide(value);
  }, []);

  useEffect(() => {
    if (!mode) {
      remainingMsRef.current = SLIDE_DURATION_MS;
      deadlineRef.current = null;
      return;
    }
    if (paused || reducedMotion) return;

    const currentSlide = slide;
    const deadline = Date.now() + remainingMsRef.current;
    deadlineRef.current = deadline;
    const timer = window.setTimeout(() => {
      const nextSlide = (currentSlide + 1) % SLIDES.length;
      remainingMsRef.current = SLIDE_DURATION_MS;
      deadlineRef.current = null;
      activeSlideRef.current = nextSlide;
      setSlide(nextSlide);
    }, remainingMsRef.current);

    return () => {
      window.clearTimeout(timer);
      // Preserve the elapsed portion when hover/focus pauses the carousel.
      // A slide change owns a fresh full interval and must not inherit this one.
      if (activeSlideRef.current === currentSlide && deadlineRef.current === deadline) {
        remainingMsRef.current = Math.max(0, deadline - Date.now());
        deadlineRef.current = null;
      }
    };
  }, [mode, paused, reducedMotion, slide]);

  useEffect(() => {
    if (mode) return;
    activeSlideRef.current = 0;
    setSlide(0);
  }, [mode]);

  const setShowcasePaused = useCallback((value: boolean) => {
    setPaused(value);
  }, []);

  useEffect(() => {
    if (!mode) return;
    const priorOverflow = document.body.style.overflow;
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const controls = visibleDialogControls(modalRef.current);
      (controls.find((node) => node.tagName === "INPUT") ?? controls[0] ?? modalRef.current)?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = visibleDialogControls(modalRef.current);
      if (!focusable.length) { event.preventDefault(); modalRef.current?.focus(); return; }
      const target = dialogTabBoundary(focusable, document.activeElement as HTMLElement | null, event.shiftKey);
      if (target) { event.preventDefault(); target.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", keydown);
      if (priorFocus?.isConnected) priorFocus.focus();
    };
  }, [close, mode]);

  if (!mode) return null;
  return (
    <div className="auth-modal-backdrop fixed inset-0 z-[120] flex items-end bg-black/80 p-0 backdrop-blur-xl sm:items-center sm:justify-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" className="auth-modal-panel grid max-h-[100dvh] w-full overflow-y-auto rounded-t-[1.6rem] border border-white/12 bg-[#151518] shadow-[0_34px_140px_rgba(0,0,0,.76)] sm:max-h-[min(46rem,calc(100dvh-2.5rem))] sm:max-w-lg lg:max-w-5xl lg:grid-cols-[minmax(0,1.05fr)_minmax(25rem,.95fr)] sm:rounded-3xl">
        <AuthShowcase slide={slide} isPaused={paused} reducedMotion={reducedMotion} onSlide={selectSlide} onPause={setShowcasePaused} />
        <div className="auth-modal-form relative flex min-h-[34rem] flex-col px-5 py-6 sm:min-h-0 sm:px-10 sm:py-9">
          <button type="button" onClick={close} className="absolute right-4 top-4 grid size-11 place-items-center rounded-xl text-white/65 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={mode === "forgot-password" ? "Close password recovery" : "Close sign in"}><X className="size-4" /></button>
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
            <h1 id="auth-modal-title" className="text-3xl font-semibold tracking-[-.045em] text-white">{mode === "login" ? "Welcome back." : mode === "forgot-password" ? "Forgot your password?" : "Create your account."}</h1>
            <p className="mt-2 text-sm leading-5 text-white/48">{mode === "login" ? "Sign in to sync your watch history and settings." : mode === "forgot-password" ? "Enter your account email and we’ll send you a reset link." : "A free account saves your watch history and settings."}</p>
            {mode === "login" ? <LoginForm initialEmail={recoveryEmail} onForgotPassword={(email) => { setRecoveryEmail(email); open("forgot-password", nextPath); }} onSwitch={() => open("signup", nextPath)} onComplete={complete} next={nextPath} /> : mode === "forgot-password" ? <ForgotPasswordForm initialEmail={recoveryEmail} next={nextPath} onBack={(email) => { setRecoveryEmail(email); open("login", nextPath); }} /> : <SignupForm onSwitch={() => open("login", nextPath)} onComplete={complete} next={nextPath || "/account"} />}
          </div>
        </div>
      </section>
    </div>
  );
}

function AuthShowcase({ slide, isPaused, reducedMotion, onSlide, onPause }: { slide: number; isPaused: boolean; reducedMotion: boolean; onSlide: (value: number) => void; onPause: (value: boolean) => void }) {
  const active = SLIDES[slide]!;
  const pointerInside = useRef(false);
  const focusInside = useRef(false);
  const syncPaused = () => onPause(pointerInside.current || focusInside.current);
  return <aside className="auth-modal-showcase relative isolate hidden min-h-0 overflow-hidden p-5 lg:block"
    onMouseEnter={() => { pointerInside.current = true; syncPaused(); }}
    onMouseLeave={() => { pointerInside.current = false; syncPaused(); }}
    onFocusCapture={() => { focusInside.current = true; syncPaused(); }}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        focusInside.current = false;
        syncPaused();
      }
    }}>
    <img src={active.art} alt="" aria-hidden decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-75 transition-opacity duration-500" />
    <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(7,7,9,.04),rgba(7,7,9,.2)_42%,rgba(7,7,9,.95))]" />
    <div className="flex h-full flex-col justify-end">
      <h2 className="max-w-sm text-4xl font-semibold leading-[.94] tracking-[-.055em] text-white">{active.title}</h2>
      <p className="mt-4 max-w-sm text-sm leading-6 text-white/68">{active.copy}</p>
      <div className="mt-7 flex items-center gap-2" role="tablist" aria-label="Account feature slides">
        <div className="flex w-full gap-1.5">{SLIDES.map((entry, index) => <button key={entry.label} type="button" onClick={() => onSlide(index)} role="tab" aria-selected={index === slide} aria-label={`Show ${entry.label.toLowerCase()}`} className="group relative flex h-11 flex-1 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><span className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/22 transition group-hover:bg-white/35">{index < slide || (index === slide && reducedMotion) ? <span className="absolute inset-y-0 left-0 w-full rounded-full bg-white" /> : null}{index === slide && !reducedMotion ? <span style={{ animationPlayState: isPaused ? "paused" : "running" }} className="auth-showcase-progress absolute inset-y-0 left-0 rounded-full bg-white" /> : null}</span></button>)}</div>
      </div>
    </div>
  </aside>;
}
