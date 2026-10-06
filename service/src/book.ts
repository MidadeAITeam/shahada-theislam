// The book corpus: passages per edition, lexical (BM25) and semantic (embedding) search,
// merged into one ranked list. If no passage reaches the relevance threshold the caller
// abstains ("not in the book") and offers a human.
import fs from "node:fs";
import path from "node:path";
import { config, CONVERTED } from "./config.ts";
import { embedQuery } from "./llm.ts";
import { normalize } from "./text.ts";
import type { Chunk } from "./types.ts";

interface Edition {
  chunks: Chunk[];
  // Class exercises, assessment questions, self-assessment, reading pointers and the final test are
  // not teaching text: they are kept for exercises but never retrieved to answer a question.
  // "Discuss" prompts often carry teaching text too, so they are only ranked lower.
  exercise: boolean[];
  discuss: boolean[];
  byId: Map<string, Chunk>;
  vectors: Float32Array[];
  // BM25
  tf: Map<string, number>[];
  df: Map<string, number>;
  len: number[];
  avgLen: number;
}

const editions = new Map<string, Edition | null>();

// Section headings of non-teaching parts, per edition (the books share one layout and page numbers).
const EXERCISE_HEADINGS = [
  "exercise", "assessment questions", "self-assessment", "additional reading", "choose the correct answer", "final test",
  "تمرين", "أسئلة تقويمية", "تقويم ذاتي", "مطالعة إضافية", "اختر الإجابة", "اختبار نهائي",
  "exercice", "questions d’évaluation", "questions d'évaluation", "évaluation personnelle", "lecture complémentaire",
  "actividad", "preguntas de evaluación", "evaluación personal", "leer más", "examen final",
  "latihan", "soal-soal evaluasi", "evaluasi mandiri", "pelajaran tambahan",
  "exercício", "perguntas de análise", "auto-classificação", "leitura adicional", "teste final",
  "упражнение", "проверочные вопросы", "оценка усвоения", "дополнительный материал", "финальный тест",
  "vježba", "pitanja za utvrđivanje", "utvrđivanje gradiva", "dodatak gradivu", "zadnji test",
  "bài tập", "các câu hỏi đánh giá", "tự đánh giá", "đọc thêm", "kiểm tra cuối",
  "แบบฝึกหัด", "คำถามเพื่อการประเมิน", "ประเมินตนเอง", "การอ่านเพิ่มเติม", "สอบวัดผล",
];
const DISCUSS_HEADINGS = ["discuss", "ناقش", "discute", "a discutir", "diskusikan", "discuta", "обсуждение", "diskusija", "thảo luận", "หารือ"];
const LAST_TEACHING_PAGE = 114; // pages 115-121: assessment, self-assessment, conclusion and the final test

function classify(chunks: Chunk[]): { exercise: boolean[]; discuss: boolean[] } {
  const exercise: boolean[] = [];
  const discuss: boolean[] = [];
  let inExercise = false;
  let page = -1;
  for (const c of chunks) {
    const h = c.heading.trim().toLowerCase();
    if (c.page !== page) { page = c.page; if (h) inExercise = false; }
    if (h) inExercise = EXERCISE_HEADINGS.some((x) => h.startsWith(x));
    exercise.push(inExercise || c.page > LAST_TEACHING_PAGE);
    discuss.push(DISCUSS_HEADINGS.some((x) => h.startsWith(x)));
  }
  return { exercise, discuss };
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length > 1);
}

export function edition(lang: string): Edition | null {
  if (editions.has(lang)) return editions.get(lang)!;
  const dir = path.join(config.dataDir, "build", lang);
  const cf = path.join(dir, "chunks.jsonl");
  if (!fs.existsSync(cf)) {
    editions.set(lang, null);
    return null;
  }
  const chunks: Chunk[] = fs.readFileSync(cf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const vf = path.join(dir, "vectors.json");
  let vectors: Float32Array[] = [];
  if (fs.existsSync(vf)) {
    const v = JSON.parse(fs.readFileSync(vf, "utf8"));
    const idx = new Map<string, number>((v.ids as string[]).map((id, i) => [id, i]));
    vectors = chunks.map((c) => Float32Array.from(v.vectors[idx.get(c.id) ?? -1] ?? []));
  }
  const tf = chunks.map((c) => {
    const m = new Map<string, number>();
    for (const t of tokens(`${c.heading} ${c.text}`)) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  const df = new Map<string, number>();
  tf.forEach((m) => m.forEach((_, t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const len = tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const e: Edition = { chunks, ...classify(chunks), byId: new Map(chunks.map((c) => [c.id, c])), vectors, tf, df, len, avgLen: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length) };
  editions.set(lang, e);
  return e;
}

export function chunkById(id: string): Chunk | undefined {
  const lang = id.split(":")[1];
  return edition(lang)?.byId.get(id);
}

/** Passages of one lesson in reading order. */
export function lessonChunks(lang: string, lessonId: string): Chunk[] {
  return edition(lang)?.chunks.filter((c) => c.lesson_id === lessonId) ?? [];
}

/** Which edition to read from for a user language: their own if converted, else English (Arabic for Arabic speakers). */
export function sourceLang(userLang: string): { lang: string; translated: boolean } {
  if (CONVERTED.includes(userLang) && edition(userLang)) return { lang: userLang, translated: false };
  return { lang: edition("en") ? "en" : "ar", translated: true };
}

function bm25(e: Edition, q: string[], k1 = 1.4, b = 0.75): number[] {
  const N = e.chunks.length;
  return e.tf.map((m, i) => {
    let s = 0;
    for (const t of q) {
      const f = m.get(t);
      if (!f) continue;
      const n = e.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * e.len[i]) / e.avgLen));
    }
    return s;
  });
}

function cosine(a: number[], b: Float32Array): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

export interface Hit { chunk: Chunk; score: number; semantic: number; lexical: number }

/**
 * Hybrid search inside one edition, optionally restricted to a lesson.
 * `queries` may hold the user's question and its translation into the edition's language.
 */
export async function search(lang: string, queries: string[], opts: { lessonId?: string; k?: number; withExercises?: boolean } = {}): Promise<Hit[]> {
  const e = edition(lang);
  if (!e) return [];
  const k = opts.k ?? config.topK;
  const pool = e.chunks.map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.lesson_id && (!opts.lessonId || c.lesson_id === opts.lessonId) && (opts.withExercises || !e.exercise[i]));
  const sem = new Array(e.chunks.length).fill(0);
  if (e.vectors.length) {
    const vs = await Promise.all(queries.map((q) => embedQuery(q)));
    for (const v of vs) pool.forEach(({ i }) => (sem[i] = Math.max(sem[i], cosine(v, e.vectors[i]))));
  }
  const lex = new Array(e.chunks.length).fill(0);
  for (const q of queries) bm25(e, tokens(q)).forEach((s, i) => (lex[i] = Math.max(lex[i], s)));
  const maxLex = Math.max(1e-9, ...pool.map(({ i }) => lex[i]));
  const hits = pool.map(({ c, i }) => ({ chunk: c, semantic: sem[i], lexical: lex[i] / maxLex, score: (0.75 * sem[i] + 0.25 * (lex[i] / maxLex)) * (e.discuss[i] ? 0.9 : 1) }));
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

/**
 * Passages next to a hit on the same page (and the first of the next page), so a list split under
 * short headings ("First", "Second"...) reaches the generator whole.
 */
export function withNeighbours(lang: string, hits: Hit[], top = 3, span = 3): Hit[] {
  const e = edition(lang);
  if (!e) return hits;
  const out = [...hits];
  const have = new Set(hits.map((h) => h.chunk.id));
  for (const h of hits.slice(0, top)) {
    const i = e.chunks.findIndex((c) => c.id === h.chunk.id);
    for (let j = Math.max(0, i - 1); j <= Math.min(e.chunks.length - 1, i + span); j++) {
      const c = e.chunks[j];
      if (have.has(c.id) || e.exercise[j] || !c.lesson_id || c.lesson_id !== h.chunk.lesson_id || Math.abs(c.page - h.chunk.page) > 1) continue;
      have.add(c.id);
      out.push({ chunk: c, score: h.score * 0.9, semantic: h.semantic, lexical: 0 });
    }
  }
  return out;
}

/** Is this passage teaching text (not an exercise, assessment or test)? */
export function isTeaching(c: Chunk): boolean {
  const e = edition(c.lang);
  const i = e ? e.chunks.indexOf(c) : -1;
  return !(e && i >= 0 && e.exercise[i]);
}
