const CONCEPT_ALIASES: ReadonlyArray<{ triggers: string[]; expansions: string[] }> = [
  {
    triggers: ["20v1", "20 v 1", "20 vs 1", "20 women", "20 girls", "edate", "e date", "e-date", "rizz"],
    expansions: ["dating show", "e date", "edate", "20 versus 1", "20v1", "20 women", "20 girls", "rizz"],
  },
  {
    triggers: ["livestream", "live stream", "broadcast", "vod", "replay"],
    expansions: ["livestream", "live stream", "broadcast", "past broadcast", "vod", "replay"],
  },
  {
    triggers: ["short", "shorts", "reel", "reels", "tiktok", "vertical"],
    expansions: ["short form", "vertical video", "youtube shorts", "instagram reels", "tiktok"],
  },
  {
    triggers: ["photo", "picture", "image", "photographic"],
    expansions: ["photo", "picture", "image", "photographic content"],
  },
  {
    triggers: ["game", "gaming", "valorant", "call of duty", "fortnite"],
    expansions: ["game", "gaming", "gameplay", "stream"],
  },
];

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function textTokens(value: string): string[] {
  return normalizeText(value).split(" ").filter((token) => token.length > 1);
}

export function expandConcepts(value: string): string[] {
  const normalized = normalizeText(value);
  const output = new Set<string>();
  for (const group of CONCEPT_ALIASES) {
    if (group.triggers.some((trigger) => normalized.includes(normalizeText(trigger)))) {
      group.expansions.forEach((entry) => output.add(entry));
    }
  }
  return [...output];
}

export function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution);
    }
    previous = current;
  }
  return previous[right.length]!;
}

export function tokenFuzzySimilarity(query: string, document: string): number {
  const queryTokens = textTokens(query);
  const documentTokens = textTokens(document);
  if (!queryTokens.length || !documentTokens.length) return 0;
  let sum = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    for (const documentToken of documentTokens) {
      const distance = editDistance(queryToken, documentToken);
      best = Math.max(best, 1 - distance / Math.max(queryToken.length, documentToken.length, 1));
    }
    sum += Math.max(0, best);
  }
  return sum / queryTokens.length;
}

export function matchedQueryTerms(query: string, document: string): string[] {
  const documentTokens = textTokens(document);
  return textTokens(query).filter((queryToken) =>
    documentTokens.some((token) =>
      token === queryToken ||
      (queryToken.length >= 4 && editDistance(queryToken, token) <= Math.max(1, Math.floor(queryToken.length / 4))),
    ),
  );
}
