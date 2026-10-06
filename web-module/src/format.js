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

/**
 * A passage as blocks: { type: 'p' | 'h', text }, { type: 'ul' | 'ol', items: [{ n?, text }] } and
 * { type: 'table', head: [cell] | null, rows: [[cell]] } for the book's Markdown tables (prayer times,
 * the study plan), whose cells may hold line breaks.
 */
export function blocks(t) {
  const out = [];
  const src = String(t || '').replace(MARKER, '').replace(TAGS, '');
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
  const cells = (line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => clean(c).trim());
  // A table row stays one line (its <br>s are line breaks inside a cell); elsewhere <br> ends a line.
  const lines = src.split('\n').flatMap((raw) => (/^\s*\|.*\|\s*$/.test(raw) ? [raw] : raw.split(/<br\s*\/?>/i)));
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if (/^\|.*\|$/.test(line)) {
      const row = cells(line);
      let table = out.at(-1)?.type === 'table' && !para ? out.at(-1) : null;
      if (!table) push((table = { type: 'table', head: null, rows: [] }));
      // The |---|---| line under the first row makes that row the header.
      if (row.every((c) => /^:?-{2,}:?$/.test(c))) {
        if (!table.head && table.rows.length === 1) table.head = table.rows.pop();
      } else table.rows.push(row);
    } else if (!line) para = null;
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
  return out.filter((b) => (b.type === 'table' ? b.rows.length || b.head : b.items ? b.items.some((i) => i.text.trim()) : b.text.trim()));
}

/** Every word a passage shows, for reading time. */
export const words = (t) => clean(t).split(/\s+/).filter(Boolean).length;
