/**
 * Single source of truth for the fan-mail surface.
 *
 *   /fan-mail            — hub listing all five
 *   /send-to-[slug]      — per-member focused page
 *
 * Five members in the public mailing list — Silky doesn't have a
 * publicly-shared PO box and is intentionally absent.
 *
 * Address formatting follows USPS conventions:
 *   - PMBs at retail USPS / commercial mail stores get `#<box>` on
 *     the street line (Jason, Marlon).
 *   - Standard PO Boxes are written `PO Box N` (Ron, Lacy, Adapt).
 *
 * Marlon's Tarzana zip is 91356 — confirm before shipping anything
 * larger than a postcard if a route to verify exists.
 */
import { MEMBERS_BY_SLUG } from "./members";

export type MailMember = {
  slug: string;
  /** Display name on the page. */
  displayName: string;
  /** Exact recipient line registered for the PO box or private mailbox. */
  mailRecipient: string;
  /** First glyph used on the postage stamp graphic. */
  initial: string;
  /**
   * Address as it appears on the page (line by line). The first line of
   * the clipboard payload is the recipient's name (added at copy time so
   * the data file stays focused on the address).
   */
  addressLines: readonly string[];
  /** Optional micro-note shown under the address. */
  note?: string;
};

export const MAIL_MEMBERS: readonly MailMember[] = [
  {
    slug: "ron",
    displayName: "Ron",
    mailRecipient: "StableRonaldo",
    initial: "R",
    addressLines: ["PO Box 2459", "Van Nuys, CA 91404"] as const,
  },
  {
    slug: "jason",
    displayName: "Jason",
    mailRecipient: "JasonTheWeen",
    initial: "J",
    addressLines: ["15701 Sherman Way #7854", "Van Nuys, CA 91409"] as const,
  },
  {
    slug: "lacy",
    displayName: "Lacy",
    mailRecipient: "Lacy",
    initial: "L",
    addressLines: ["PO Box 55427", "Sherman Oaks, CA 91413"] as const,
  },
  {
    slug: "marlon",
    displayName: "Marlon",
    mailRecipient: "Marlon (Mar3lg)",
    initial: "M",
    addressLines: ["5609 Yolanda Ave #570730", "Tarzana, CA 91356"] as const,
  },
  {
    slug: "adapt",
    displayName: "Adapt",
    mailRecipient: "Adapt",
    initial: "A",
    addressLines: ["PO Box 2820", "Toluca Lake, CA 91610"] as const,
  },
] as const;

export const MAIL_MEMBERS_BY_SLUG: Readonly<Record<string, MailMember>> = Object.freeze(
  Object.fromEntries(MAIL_MEMBERS.map((m) => [m.slug, m])),
);

/** Build the multi-line clipboard payload: name + address. */
export function clipboardPayloadFor(m: MailMember): string {
  return [m.mailRecipient, ...m.addressLines].join("\n");
}

/**
 * Resolve a mail-member slug back to the canonical member's accent +
 * portrait when one is available. Falls back to neutral tones when not
 * (e.g. if the canonical member ever rotates).
 */
export function canonicalFor(slug: string): {
  stageName: string;
  realName: string;
  accent: string;
  portrait: string;
} | null {
  const m = MEMBERS_BY_SLUG[slug];
  if (!m) return null;
  return {
    stageName: m.stageName,
    realName: m.realName,
    accent: m.accent,
    portrait: m.portrait,
  };
}
