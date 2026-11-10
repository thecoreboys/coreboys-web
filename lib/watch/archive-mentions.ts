/** The @ token immediately before the caret, without interpreting email addresses. */
export function archiveMentionAt(value: string, caret: number): { query: string; start: number; end: number } | null {
  const end = Math.max(0, Math.min(value.length, caret));
  const match = /(?:^|\s)@([a-z0-9._-]*)$/i.exec(value.slice(0, end));
  if (!match) return null;
  const suffix = /^[a-z0-9._-]*/i.exec(value.slice(end))?.[0] ?? "";
  return { query: match[1]!.toLowerCase(), start: end - match[1]!.length - 1, end: end + suffix.length };
}

export function removeArchiveMention(value: string, mention: { start: number; end: number }): string {
  return `${value.slice(0, mention.start)}${value.slice(mention.end)}`.replace(/\s{2,}/g, " ").trim();
}
