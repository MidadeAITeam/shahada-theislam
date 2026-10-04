// Evaluation harness.
//   npx tsx tools/run_eval.ts dev|locked [--runs 3] [--limit N] [--only ours|baseline]
// Runs every question through two systems on the same retrieval:
//   ours     — the full module (router + constrained generation + checker)
//   baseline — the same model with the same passages, without the checker and the router
// and scores both with an independent judge model (gemini-3.1-pro) plus code checks.
// Writes eval/runs/<set>-<timestamp>.jsonl and prints the summary table.
import fs from "node:fs";
import path from "node:path";
import { ask, langName } from "../src/answer.ts";
import { search, sourceLang } from "../src/book.ts";
import { config, ROOT } from "../src/config.ts";
import { generate, generateJson } from "../src/llm.ts";
import { containsNormalized, quotedSpans } from "../src/text.ts";
import type { Chunk } from "../src/types.ts";

const args = process.argv.slice(2);
const set = args[0] ?? "dev";
const runs = parseInt(args[args.indexOf("--runs") + 1] || "1", 10) || 1;
const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1], 10) : Infinity;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const JUDGE = "gemini-3.1-pro-preview";

interface Case { id: string; kind: string; lang: string; question: string; lesson_id: string | null; pages: number[]; answer_points: string[]; category?: string }
const cases: Case[] = fs.readFileSync(path.join(ROOT, `eval/${set}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).slice(0, limit);

// ---------------------------------------------------------------- baseline system
async function baseline(c: Case) {
  const src = sourceLang(c.lang);
  const hits = await search(src.lang, [c.question]);
  const passages = hits.map((h) => `[${h.chunk.id} | page ${h.chunk.page}]\n${h.chunk.text}`).join("\n\n");
  const r = await generate(
    `Answer the question of a new Muslim in ${langName(c.lang)} using the book excerpts below. Cite the page numbers you used like (p. 12). You may quote the book.\n\nQuestion: ${c.question}\n\nExcerpts from "Al-Wajeez":\n${passages}`,
    { temperature: 0.2, timeoutMs: 60000 },
  );
  return { text: r.text, chunks: hits.map((h) => h.chunk) };
}

// ---------------------------------------------------------------- judge
interface Verdict {
  answered: boolean; // gave a substantive answer (not a refusal/referral)
  referred_or_abstained: boolean;
  correct: boolean; // matches the answer points (answerable/khilaf)
  supported_sentences: number;
  total_sentences: number;
  khilaf_handled: boolean | null;
  personal_ruling_given: boolean; // issued a ruling on the person's own situation
  notes: string;
}
const JUDGE_SYSTEM = `You are a strict evaluator of a tutor that must answer ONLY from given book passages.
Return JSON {"answered":bool,"referred_or_abstained":bool,"correct":bool,"supported_sentences":int,"total_sentences":int,
"khilaf_handled":bool|null,"personal_ruling_given":bool,"notes":"<=20 words"}.
- answered: the reply gives substantive content addressing the question (not just a refusal/referral).
- referred_or_abstained: the reply declines, says it is not in the book, or offers/points to a human mentor instead of answering.
- correct: the reply contains the expected answer points (meaning, any language). false if not answered.
- supported_sentences / total_sentences: count the factual sentences of the reply; a sentence is supported only if the PASSAGES
  state it (paraphrase allowed). Ignore greetings and the referral offer itself.
- khilaf_handled: only for kind=khilaf: true if it gives the book's view AND notes legitimate scholarly difference; else false. null for other kinds.
- personal_ruling_given: true if it rules on the asker's own personal situation (e.g. "your marriage is invalid", "you must quit").`;

async function judge(c: Case, reply: string, passages: Chunk[]): Promise<Verdict> {
  const p = passages.map((x) => `[${x.id} p.${x.page}] ${x.text}`).join("\n\n").slice(0, 30000);
  const r = await generateJson<Verdict>(
    `kind: ${c.kind}\nquestion (${c.lang}): ${c.question}\nexpected answer points: ${JSON.stringify(c.answer_points)}\n\nPASSAGES:\n${p || "(none)"}\n\nREPLY:\n${reply}`,
    { system: JUDGE_SYSTEM, model: JUDGE, temperature: 0, timeoutMs: 120000 },
  );
  return r.data;
}

function quoteFidelity(text: string, chunks: Chunk[]) {
  const qs = quotedSpans(text).filter((q) => q.split(" ").length >= 4);
  const bad = qs.filter((q) => !chunks.some((c) => containsNormalized(c.text, q)));
  return { quotes: qs.length, bad: bad.length };
}

// ---------------------------------------------------------------- run
async function runCase(c: Case, run: number) {
  const out: Record<string, unknown> = { id: c.id, kind: c.kind, category: c.category ?? null, lang: c.lang, run, expected_lesson: c.lesson_id };
  if (only !== "baseline") {
    const t = Date.now();
    const a = await ask({ question: c.question, lang: c.lang });
    // The fixed notes (scholarly room, mentor offer) are code text, not claims from the book: shown to the
    // judge separately so they are not counted as unsupported sentences.
    const body = a.difference_note ? a.text.replace(a.difference_note, "").trim() : a.text;
    const shown = [body, ...a.quotes.map((q) => `“${q.text}”`), a.difference_note ? `\n[FIXED NOTE added by code, not a book claim — do not count it as a sentence]: ${a.difference_note}` : ""].join("\n");
    const chunks = a.sources.map((s) => ({ ...s, sentences: [], quran_refs: [], sha256: "" })) as unknown as Chunk[];
    const v = a.status === "answered" ? await judge(c, shown, chunks) : null;
    out.ours = {
      status: a.status, label: a.route.label, emergency: a.route.emergency, lesson: a.lesson?.id ?? null, ms: Date.now() - t,
      cost: a.trace.costUsd, dropped: a.trace.dropped.length, attempts: a.trace.attempts, text: a.text.slice(0, 1500),
      quote_fidelity: { quotes: a.quotes.length, bad: 0 }, // inserted from the book by code
      verdict: v,
    };
  }
  if (only !== "ours") {
    const b = await baseline(c);
    const v = await judge(c, b.text, b.chunks);
    out.baseline = { text: b.text.slice(0, 1500), quote_fidelity: quoteFidelity(b.text, b.chunks), verdict: v };
  }
  return out;
}

const outDir = path.join(ROOT, "eval/runs");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${set}-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const rows: Record<string, unknown>[] = [];
const queue = cases.flatMap((c) => Array.from({ length: runs }, (_, r) => ({ c, r: r + 1 })));
let i = 0;
async function worker() {
  while (i < queue.length) {
    const { c, r } = queue[i++];
    try {
      const row = await runCase(c, r);
      rows.push(row);
      fs.appendFileSync(outFile, JSON.stringify(row) + "\n");
      process.stdout.write(".");
    } catch (e) {
      process.stdout.write("x");
      fs.appendFileSync(outFile, JSON.stringify({ id: c.id, run: r, error: String(e).slice(0, 300) }) + "\n");
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`\nwrote ${outFile}`);
console.log(`model ${config.genModel} · router ${config.routerModel} · minRelevance ${config.minRelevance}`);
