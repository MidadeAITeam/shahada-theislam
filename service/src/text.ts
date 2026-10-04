// Text normalisation used when comparing anything the model wrote against the book.
// Matching is done on a normalised form so that spelling variants (hamza forms,
// tashkeel, tatweel, curly quotes, extra spaces) do not cause false rejections,
// while any change of wording still does.

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[‘’‛′`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[*_#>|]/g, " ")
    .replace(/[^\p{L}\p{N}'"]+/gu, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** True when `needle` appears in `haystack` after normalisation. */
export function containsNormalized(haystack: string, needle: string): boolean {
  const n = normalize(needle);
  return n.length > 0 && normalize(haystack).includes(n);
}

/** Split a passage into sentences (kept verbatim) so quotes can be addressed as `<chunk>#sN`. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟。])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Text the model put between quotation marks (any script's quote characters). */
export function quotedSpans(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]{6,})"|“([^”]{6,})”|«([^»]{6,})»|„([^“”]{6,})[“”]/gu;
  for (const m of s.matchAll(re)) out.push((m[1] ?? m[2] ?? m[3] ?? m[4]).trim());
  return out;
}
