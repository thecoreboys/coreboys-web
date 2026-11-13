import type { PostcardIdentity } from "@/lib/postcard-identities";

/**
 * Writing prompts, greetings and sign-offs from a creator's postcard copy
 * profile, so every page suggests a letter in that creator's voice.
 */
export function LetterPrompts({ identity, accent }: { identity: PostcardIdentity; accent: string }) {
  const { prompts, greetings, signoffs, tone } = identity.copy;

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {prompts.map((prompt) => (
          <li
            key={prompt.id}
            className="relative overflow-hidden rounded-2xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-5 md:p-6"
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">{prompt.label}</p>
            <p className="mt-2 text-lg font-semibold leading-snug text-[color:var(--ink)]">{prompt.question}</p>
            <p className="mt-3 text-sm italic leading-relaxed text-[color:var(--ink-dim)]">“{prompt.placeholder}”</p>
          </li>
        ))}
      </ul>

      <dl className="mt-6 grid gap-5 rounded-2xl border border-dashed border-[color:var(--rule-strong)] p-5 md:grid-cols-[1fr_1fr_auto] md:p-6">
        <PhraseList label="Open with" phrases={greetings} />
        <PhraseList label="Sign off" phrases={signoffs} />
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">Tone</dt>
          <dd className="mt-2 text-sm leading-relaxed text-[color:var(--ink-dim)]">{tone.join(" · ")}</dd>
        </div>
      </dl>
    </div>
  );
}

function PhraseList({ label, phrases }: { label: string; phrases: readonly string[] }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">{label}</dt>
      <dd className="mt-2 flex flex-wrap gap-2">
        {phrases.map((phrase) => (
          <span key={phrase} className="rounded-full border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-1 text-sm text-[color:var(--ink)]">
            {phrase}
          </span>
        ))}
      </dd>
    </div>
  );
}
