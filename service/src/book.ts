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
  byId: Map<string, Chunk>;
  vectors: Float32Array[];
  // BM25
  tf: Map<string, number>[];
  df: Map<string, number>;
  len: number[];
  avgLen: number;
}

const editions = new Map<string, Edition | null>();

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
  const e: Edition = { chunks, byId: new Map(chunks.map((c) => [c.id, c])), vectors, tf, df, len, avgLen: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length) };
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
export async function search(lang: string, queries: string[], opts: { lessonId?: string; k?: number } = {}): Promise<Hit[]> {
  const e = edition(lang);
  if (!e) return [];
  const k = opts.k ?? config.topK;
  const pool = e.chunks.map((c, i) => ({ c, i })).filter(({ c }) => c.lesson_id && (!opts.lessonId || c.lesson_id === opts.lessonId));
  const sem = new Array(e.chunks.length).fill(0);
  if (e.vectors.length) {
    for (const q of queries) {
      const v = await embedQuery(q);
      pool.forEach(({ i }) => (sem[i] = Math.max(sem[i], cosine(v, e.vectors[i]))));
    }
  }
  const lex = new Array(e.chunks.length).fill(0);
  for (const q of queries) bm25(e, tokens(q)).forEach((s, i) => (lex[i] = Math.max(lex[i], s)));
  const maxLex = Math.max(1e-9, ...pool.map(({ i }) => lex[i]));
  const hits = pool.map(({ c, i }) => ({ chunk: c, semantic: sem[i], lexical: lex[i] / maxLex, score: 0.75 * sem[i] + 0.25 * (lex[i] / maxLex) }));
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}
