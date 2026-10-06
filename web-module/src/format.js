// Book passages arrive as light Markdown (lists, headings, emphasis, the odd <u> tag and verse
// markers). The templates render them through these blocks, never through v-html: paragraphs,
// bullet and numbered lists, headings as a bold line, and ﷺ as its own segment so it can be sized.

// A verse marker the service did not expand ({{Q:2:255}}) is never shown raw.
const MARKER = /\{\{\s*Q:[^}]*\}\}/g;
const TAGS = /<\/?(?:u|b|i|em|strong|span|sup|sub|mark|small|big|font)\b[^>]*>/gi;

/** Plain text of a passage: no markup, markers or emphasis signs; line breaks kept. */
export function clean(t) {
  return String(t || '')
    .replace(MARKER, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(TAGS, '')
    .replace(/\*\*?|__/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:])/g, '$1');
}

/** Text split around ﷺ, so the symbol can get a font and size that render it clearly. */
export function segments(t) {
  return String(t || '')
    .split(/(ﷺ)/)
    .filter(Boolean)
    .map((s) => ({ text: s, saw: s === 'ﷺ' }));
}

/** A passage as blocks: { type: 'p' | 'h', text } and { type: 'ul' | 'ol', items: [{ n?, text }] }. */
export function blocks(t) {
  const out = [];
  const src = String(t || '').replace(MARKER, '').replace(/<br\s*\/?>/gi, '\n').replace(TAGS, '');
  let para = null;
  const push = (b) => {
    para = null;
    out.push(b);
  };
  const item = (type, it) => {
    const last = out.at(-1);
    para = null;
    if (last?.type === type) last.items.push(it);
    else out.push({ type, items: [it] });
  };
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) para = null;
    else if ((m = /^#{1,6}\s+(.*)$/.exec(line))) push({ type: 'h', text: clean(m[1]) });
    else if ((m = /^[-*•]\s+(.*)$/.exec(line))) item('ul', { text: clean(m[1]) });
    else if ((m = /^([0-9٠-٩]{1,3})[.)]\s+(.*)$/.exec(line))) item('ol', { n: m[1], text: clean(m[2]) });
    else {
      const text = clean(line.replace(/^>\s?/, ''));
      if (!text.trim()) continue;
      if (para) para.text += `\n${text}`;
      else out.push((para = { type: 'p', text }));
    }
  }
  return out.filter((b) => (b.items ? b.items.some((i) => i.text.trim()) : b.text.trim()));
}

/** Every word a passage shows, for reading time. */
export const words = (t) => clean(t).split(/\s+/).filter(Boolean).length;
