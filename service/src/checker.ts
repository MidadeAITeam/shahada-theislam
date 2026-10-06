// The checker is plain code, with no model in the loop. It decides what may reach the user.
//
// Rules (from the idea file):
//  1. Every sentence must carry at least one passage id, and every id must be one of the
//     passages retrieved for this question. Otherwise the sentence is dropped.
//  2. Any text the model put in quotation marks must appear in a cited passage (after
//     normalisation). Otherwise the sentence is dropped.
//  3. Quotes are never written by the model: it names `<chunk>#s<n>` and we insert that
//     sentence verbatim from the book.
//  4. A verse may be shown only if a cited passage itself cites that verse; its text is then
//     inserted from the Qur'an database by the caller.
//  5. If more than a third of the sentences were dropped the caller regenerates once,
//     and if that fails too it apologises and offers a human.
import { containsNormalized, quotedSpans } from "./text.ts";
import type { CheckResult, Chunk, DraftAnswer } from "./types.ts";

export const MAX_DROP_RATIO = 1 / 3;

// Sentences about the retrieval itself ("the provided text does not mention…") are not teaching.
const META = /\b(provided|given|these|the) (text|passages?|excerpts?|sources?)\b|\bpassages?\b|texte fourni|passages fournis|texto proporcionado|pasajes|teks yang (tersedia|diberikan)|bagian teks|предоставленн|приведённ\S* текст|приведенн\S* текст|sağlanan metin|verilen metin|النص(وص)? المقدم|المقاطع|الفقرات المقدمة|bereitgestellte[nr]? text|texto fornecido|trechos fornecidos/i;

function verseCovered(ref: string, cited: Chunk[]): boolean {
  const [s, a] = ref.split(":").map((x) => parseInt(x, 10));
  return cited.some((c) =>
    c.quran_refs.some((r) => {
      const [rs, range] = r.split(":");
      if (parseInt(rs, 10) !== s) return false;
      const [from, to] = range.split("-").map((x) => parseInt(x, 10));
      return a >= from && a <= (Number.isNaN(to) || to === undefined ? from : to);
    }),
  );
}

export function check(draft: DraftAnswer, retrieved: Chunk[]): CheckResult {
  const byId = new Map(retrieved.map((c) => [c.id, c]));
  const kept: CheckResult["sentences"] = [];
  const dropped: CheckResult["dropped"] = [];

  for (const s of draft.sentences ?? []) {
    const text = (s.text ?? "").trim();
    if (!text) continue;
    const ids = (s.sources ?? []).filter((id) => byId.has(id));
    if (ids.length === 0) {
      dropped.push({ text, reason: (s.sources ?? []).length ? "unknown_source_id" : "no_source_id" });
      continue;
    }
    if (META.test(text)) {
      dropped.push({ text, reason: "meta_sentence" });
      continue;
    }
    const cited = ids.map((id) => byId.get(id)!);
    const badQuote = quotedSpans(text).find((q) => !cited.some((c) => containsNormalized(c.text, q)));
    if (badQuote) {
      dropped.push({ text, reason: "quote_not_in_source" });
      continue;
    }
    kept.push({ text, sources: ids });
  }

  const quotes: CheckResult["quotes"] = [];
  for (const ref of draft.quotes ?? []) {
    const [id, sPart] = ref.split("#s");
    const chunk = byId.get(id);
    const idx = parseInt(sPart, 10) - 1;
    if (!chunk || Number.isNaN(idx) || !chunk.sentences[idx]) continue;
    // A citation like "(Reported by Muslim; No. 121)" can be split after "No."; keep it whole.
    let text = chunk.sentences[idx];
    if (/\b(No|Nos|no|p|pp|vol)\.[”"’']?$/.test(text.trim()) && chunk.sentences[idx + 1]) text = `${text} ${chunk.sentences[idx + 1]}`;
    quotes.push({ ref, chunk, text });
  }

  const citedChunks = [...new Set(kept.flatMap((s) => s.sources))].map((id) => byId.get(id)!);
  const verses = (draft.verses ?? []).filter((v) => /^\d{1,3}:\d{1,3}$/.test(v) && verseCovered(v, citedChunks));

  const total = kept.length + dropped.length;
  return { sentences: kept, quotes, verses, dropped, droppedRatio: total ? dropped.length / total : 1 };
}

/** True when the checked answer is good enough to show without regenerating. */
export function acceptable(r: CheckResult): boolean {
  return r.sentences.length > 0 && r.droppedRatio <= MAX_DROP_RATIO;
}
