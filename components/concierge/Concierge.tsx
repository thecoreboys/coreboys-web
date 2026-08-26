"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, ArrowRight } from "lucide-react";
import { ease, durations } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Where can I watch Marlon?",
  "Who's live right now?",
  "What's CORE about?",
] as const;

export function Concierge() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll the log on new content.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, draft]);

  async function send(content: string) {
    const text = content.trim();
    if (!text || pending) return;

    setError(null);
    setDraft("");
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setPending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("no response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      // Push an empty assistant message we'll append to.
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const line = event.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice("data: ".length).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { delta?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.delta) {
              assistant += parsed.delta;
              setMessages((m) => {
                const next = [...m];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = { role: "assistant", content: assistant };
                }
                return next;
              });
            }
          } catch {
            // tolerate partial events
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Concierge unreachable.");
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      {/* Floating orb */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open the Concierge"
        aria-expanded={open}
        data-cursor="hover"
        className={cn(
          "fixed bottom-6 right-6 z-[55] inline-flex h-14 w-14 items-center justify-center rounded-full text-[color:var(--bg)]",
          "shadow-[0_18px_48px_rgba(219,3,104,0.35)] transition-transform [transition-timing-function:var(--ease-out)] duration-300",
          "hover:-translate-y-0.5",
        )}
        style={{ backgroundImage: "var(--core-glow)" }}
      >
        <span className="sr-only">{open ? "Close" : "Open"} Concierge</span>
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full opacity-60 blur-md"
          style={{ backgroundImage: "var(--core-glow)" }}
        />
      </button>

      {/* Sheet */}
      <AnimatePresence>
        {open && (
          <motion.aside
            role="dialog"
            aria-label="Core Boys Concierge"
            data-lenis-prevent
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: durations.base / 1000, ease: ease.out }}
            className={cn(
              "fixed bottom-24 right-4 z-[55] flex w-[min(480px,calc(100vw-2rem))] max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]",
              "md:right-6 md:bottom-24",
            )}
          >
            <header className="flex items-center justify-between border-b border-[color:var(--rule)] px-5 py-4">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundImage: "var(--core-glow)" }}
                />
                <span className="font-mono text-xs uppercase tracking-[0.18em]">
                  CORE Concierge
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
              >
                <X size={16} />
              </button>
            </header>

            <div
              ref={logRef}
              role="log"
              aria-live="polite"
              className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-sm"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col gap-4">
                  <p className="text-[color:var(--ink)]">
                    Ask about the boys. Where to watch them. What CORE means.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-full border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-1.5 text-xs text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--ink)]/40 hover:text-[color:var(--ink)]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2",
                      m.role === "user"
                        ? "ml-auto bg-[color:var(--bg)] text-[color:var(--ink)]"
                        : "mr-auto text-[color:var(--ink)]",
                    )}
                  >
                    {linkify(m.content)}
                  </div>
                ))
              )}
              {error ? (
                <div className="rounded-md border border-[color:var(--live)]/40 bg-[color:var(--live)]/10 px-3 py-2 text-xs text-[color:var(--live)]">
                  {error}
                </div>
              ) : null}
            </div>

            <form
              className="flex items-center gap-2 border-t border-[color:var(--rule)] px-3 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask…"
                aria-label="Ask the Concierge"
                disabled={pending}
                className="flex-1 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-dim)] focus-visible:outline-none focus-visible:border-[color:var(--core)]"
              />
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                aria-label="Send"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--bg)] disabled:opacity-50"
                style={{ backgroundImage: "var(--core-glow)" }}
              >
                <ArrowRight size={16} />
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Render bare-URL lines in assistant content as actual links. Keeps the
 * brand-voice instruction "URLs on their own line" rendering nicely.
 */
function linkify(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  return lines.flatMap((line, i) => {
    const isUrl = /^https?:\/\/\S+$/.test(line.trim());
    const node: React.ReactNode = isUrl ? (
      <a
        key={`l${i}`}
        href={line.trim()}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[color:var(--core)] underline-offset-2 hover:underline"
      >
        {line.trim()}
      </a>
    ) : (
      <span key={`l${i}`}>{line}</span>
    );
    return i < lines.length - 1 ? [node, <br key={`br${i}`} />] : [node];
  });
}
