export const FUZZY_SIMILARITY = 0.84;

export function normalizeUtterance(text: string) {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/don't/g, "do not")
    .replace(/dont/g, "do not")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const next = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    next[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = next[j];
  }
  return prev[b.length];
}

export function similarity(a: string, b: string) {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

function squish(value: string) {
  return value.replace(/ /g, "");
}

/** Longest listed phrase wins. Exact text, a squished form, then a fuzzy token window. */
export function matchPhrase(text: string, phrases: readonly string[], threshold = FUZZY_SIMILARITY) {
  const normalized = normalizeUtterance(text);
  if (!normalized) return null;
  const ordered = [...phrases].map(normalizeUtterance).filter(Boolean).sort((a, b) => b.length - a.length);
  const tokens = normalized.split(" ");
  const compact = squish(normalized);
  for (const phrase of ordered) {
    if (normalized.includes(phrase) || compact.includes(squish(phrase))) {
      return { phrase, similarity: 1 };
    }
  }
  let best: { phrase: string; similarity: number } | null = null;
  for (const phrase of ordered) {
    const phraseTokens = phrase.split(" ");
    const widths = [phraseTokens.length, phraseTokens.length + 1];
    for (const width of widths) {
      if (width <= 0 || width > tokens.length) continue;
      for (let i = 0; i <= tokens.length - width; i += 1) {
        const slice = tokens.slice(i, i + width).join(" ");
        const score = similarity(slice, phrase);
        if (score >= threshold && (!best || score > best.similarity)) best = { phrase, similarity: score };
      }
    }
  }
  return best;
}
