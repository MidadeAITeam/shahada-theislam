// Serves lessons from the file built once by tools/build_lessons.ts. A lesson that a reviewer has
// not approved yet (content/review.json) is shown as the book's own text with its page numbers,
// without a generated summary or questions, as the idea file requires.
import fs from "node:fs";
import path from "node:path";
import { chunkById, edition, lessonChunks, sourceLang } from "./book.ts";
import { config, ROOT } from "./config.ts";
import { LESSONS, lessonById, nextLesson, plannedPath, progressOf, type Choice } from "./curriculum.ts";
import { verses } from "./quran.ts";
import type { Chunk } from "./types.ts";
import structure from "../../content/structure.json" with { type: "json" };
import backgrounds from "../../content/backgrounds.json" with { type: "json" };
import audio from "../../content/audio.json" with { type: "json" };

interface BuiltLesson {
  summary: { text: string; sources: string[] }[];
  steps: { text: string; source: string }[] | null;
  check_question: { question: string; options: string[]; answer_index: number; source: string } | null;
  verses: string[];
  translated_explanation: boolean;
  source_lang: string;
}

const built = new Map<string, Record<string, BuiltLesson> | null>();
function builtFor(lang: string): Record<string, BuiltLesson> | null {
  if (built.has(lang)) return built.get(lang)!;
  const f = path.join(config.dataDir, "build", lang, "lessons.json");
  const v = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  built.set(lang, v);
  return v;
}

let reviewCache: Record<string, { by: string; on: string; method: string }> | null = null;
export function reviewed(lang: string, lessonId: string) {
  if (!reviewCache) {
    const f = path.join(ROOT, "content/review.json");
    reviewCache = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).approved ?? {} : {};
  }
  return reviewCache![`${lang}:${lessonId}`] ?? null;
}

const EXERCISE = /(assessment|exercise|discuss|diary|self-evaluation|my notes|أسئلة تقويمية|تمرين|ناقش|مفكرة|مذكرتي|تقويم ذاتي|évaluation|exercice|discute|evaluación|ejercicio|latihan|diskusi|avaliação|exercício|упражнение|обсуди|vježba|bài tập|thảo luận|แบบฝึกหัด|อภิปราย)/i;
export const isExercise = (c: Chunk) => EXERCISE.test(c.heading);

function ref(c: Chunk) {
  return { id: c.id, page: c.page, lang: c.lang, lesson_id: c.lesson_id, heading: c.heading, text: c.text };
}

function pagePassage(lang: string, page: number): Chunk | undefined {
  return edition(lang)?.chunks.find((c) => c.page === page && !isExercise(c));
}

export function lessonTitle(id: string, lang: string) {
  const l = lessonById(id);
  return l ? l.title[lang] ?? l.title.en : id;
}

export function getLesson(lang: string, lessonId: string, opts: { choice: Choice | null; completed: string[]; background?: string | null }) {
  const meta = lessonById(lessonId);
  if (!meta) return null;
  const src = sourceLang(lang);
  const b = builtFor(lang)?.[lessonId] ?? null;
  const review = reviewed(lang, lessonId);
  const unit = structure.units.find((u) => u.id === meta.unitId)!;
  const passages = lessonChunks(src.lang, lessonId).filter((c) => !isExercise(c));
  const cited = new Set<string>();
  b?.summary.forEach((s) => s.sources.forEach((x) => cited.add(x)));
  b?.steps?.forEach((s) => cited.add(s.source));

  let background_note = null;
  const extraPages: { page: number; why: string }[] = [];
  if (lessonId === structure.path_rules.first) extraPages.push(...backgrounds.always_in_first_lesson);
  if (opts.background && lessonId === structure.path_rules.first) {
    const list = (backgrounds.by_background as Record<string, { page: number; why: string }[]>)[opts.background] ?? [];
    extraPages.push(...list.slice(0, 2));
  }
  const extras = extraPages.map((p) => pagePassage(src.lang, p.page)).filter((c): c is Chunk => Boolean(c));
  if (extras.length) background_note = extras.map(ref);

  const order = plannedPath(opts.choice);
  const next = nextLesson(opts.choice, [...opts.completed, lessonId]);
  return {
    id: lessonId,
    unit: { id: unit.id, index: meta.unitIndex, title: (unit.title as Record<string, string>)[lang] ?? unit.title.en },
    index: meta.index,
    path_index: order.indexOf(lessonId) + 1,
    position: progressOf(opts.choice, opts.completed),
    title: lessonTitle(lessonId, lang),
    pages: passages.length ? [passages[0].page, passages[passages.length - 1].page] : null,
    reviewed: Boolean(review && b),
    review,
    translated_explanation: src.translated,
    summary: review && b ? b.summary : [],
    steps: b?.steps ?? null, // verbatim book text, safe to show even before review
    book_text: review && b ? null : passages.map(ref), // unreviewed: the book itself, with pages
    background_note,
    check_question: review && b?.check_question ? b.check_question : null,
    verses: (b?.verses ?? []).flatMap((v) => verses(v, lang)),
    // Listen-and-repeat recitations for the surahs taught in this lesson (mp3quran.net).
    audio: ((audio.by_lesson as Record<string, number[]>)[lessonId] ?? []).map((n) => {
      const pad = String(n).padStart(3, "0");
      const name = (audio.surah_names as Record<string, Record<string, string>>)[String(n)];
      return {
        surah: n,
        title: name?.[lang] ?? name?.en ?? String(n),
        teaching: { url: `${audio.sources.teaching.server}${pad}.mp3`, label: audio.sources.teaching.label },
        murattal: { url: `${audio.sources.murattal.server}${pad}.mp3`, label: audio.sources.murattal.label },
      };
    }),
    sources: [...cited].map((id) => chunkById(id)).filter((c): c is Chunk => Boolean(c)).map(ref),
    next: next ? { id: next, title: lessonTitle(next, lang) } : null,
  };
}

export function lessonIndex(lang: string, choice: Choice | null, completed: string[]) {
  const order = plannedPath(choice);
  return {
    path: order,
    next: nextLesson(choice, completed),
    units: structure.units.map((u, ui) => ({
      id: u.id,
      index: ui + 1,
      title: (u.title as Record<string, string>)[lang] ?? u.title.en,
      lessons: u.lessons.map((l) => ({
        id: l.id,
        title: lessonTitle(l.id, lang),
        done: completed.includes(l.id),
        path_index: order.indexOf(l.id) + 1,
        reviewed: Boolean(reviewed(lang, l.id)),
      })),
    })),
    total: LESSONS.length,
  };
}
