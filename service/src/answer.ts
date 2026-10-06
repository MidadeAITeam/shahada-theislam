// Question path: route -> retrieve -> constrained generation -> checker -> render.
// Nothing reaches the user before the checker has passed it.
import { search, sourceLang, withNeighbours, type Hit } from "./book.ts";
import { acceptable, check } from "./checker.ts";
import { config } from "./config.ts";
import { lessonById } from "./curriculum.ts";
import { costUsd, generateJson, type Usage } from "./llm.ts";
import { expandVerseMarkers, verses, type Verse } from "./quran.ts";
import { route, type Route, type Worship } from "./router.ts";
import { DIFFERENCE_NOTE, offTopicText, referralText, socialText, stepsIntro } from "./messages.ts";
import { getLesson } from "./lessons.ts";
import type { CheckResult, Chunk, DraftAnswer } from "./types.ts";

export interface SourceRef { id: string; page: number; lang: string; lesson_id: string | null; heading: string; text: string }
export interface AnswerResult {
  status: "answered" | "not_in_book" | "referred" | "social" | "failed";
  text: string; // final, checked answer (Markdown-free sentences joined)
  sentences: { text: string; sources: string[] }[];
  quotes: { ref: string; text: string; page: number }[];
  verses: Verse[];
  sources: SourceRef[];
  lesson: { id: string; title: string } | null;
  translatedExplanation: boolean; // "machine-translated explanation, original attached"
  steps?: boolean; // the answer is the book's verbatim steps of an act of worship
  difference_note?: string | null; // fixed text on matters of legitimate scholarly difference
  partial_note?: string | null; // fixed text when part of the question is beyond the book: a mentor can help
  route: Pick<Route, "action" | "label" | "emergency">;
  trace: { retrieved: { id: string; score: number }[]; dropped: CheckResult["dropped"]; attempts: number; costUsd: number; ms: number };
}

const LANG_NAMES: Record<string, string> = {
  ar: "Arabic", en: "English", fr: "French", es: "Spanish", id: "Indonesian", pt: "Portuguese", ru: "Russian", bs: "Bosnian",
  vi: "Vietnamese", th: "Thai", tl: "Filipino (Tagalog)", hi: "Hindi", ur: "Urdu", zh: "Chinese", sw: "Swahili", bn: "Bengali",
  ml: "Malayalam", ta: "Tamil", te: "Telugu", si: "Sinhala", ps: "Pashto", om: "Oromo", tr: "Turkish", de: "German", fa: "Persian",
  ja: "Japanese", ko: "Korean", so: "Somali", ha: "Hausa", am: "Amharic",
};
export const langName = (l: string) => LANG_NAMES[l] ?? l;

const SYSTEM = `You are a gentle tutor for someone who has just become Muslim. You answer ONLY from the passages
given to you from the book "Al-Wajeez: A Classroom Curriculum for New Muslims". You never use outside knowledge.
Output JSON only:
{"sentences":[{"text":"...","sources":["<passage id>", ...]}], "quotes":["<passage id>#s<n>"], "verses":["S:A"], "lesson_id":"<lesson id or null>", "unanswered_parts":["..."]}
Rules:
- Write 2-8 short, simple sentences in {LANG} that answer the question directly (start with the answer: yes, no, or what to do).
  Every sentence MUST list the passage id(s) that support it. If a passage does not support a sentence, do not write it.
- Speak to the learner about the topic. Never talk about "the passages", "the text provided" or what is or is not mentioned.
- Answer the question actually asked, including its specific case ("by mistake", "while travelling", "sitting down",
  "an English copy", "laughing in prayer"). A general rule is not an answer to a specific case the passages do not mention:
  never let it imply an answer. A general principle (such as "all transactions are permissible unless forbidden") never
  settles a specific product, situation or case the passages do not name. If the general rule could be read as settling the specific case (e.g. "eating and
  drinking break the fast" for "I drank by mistake"), return no sentences at all. Otherwise you may give the general rule
  only if it truly helps, and then you MUST list the specific case in "unanswered_parts".
- If the passages answer only part of the question, answer that part and list the other parts, briefly, in "unanswered_parts".
- If the message asks several questions, handle every one: answer it from the passages or list it in "unanswered_parts".
  Never skip a part silently.
- Do not put any text in quotation marks. To quote the book, add "<passage id>#s<n>" to "quotes" (n = sentence number shown
  in the passage); the exact words will be inserted from the book. Quote at most 2 sentences.
- For steps of an act of worship (wudu, ghusl, prayer), list ALL the steps given in the passages, in order, without shortening.
- To show a verse, add "S:A" to "verses" only if a passage you cite contains the marker {{Q:S:A}}. Never write verse text yourself.
- Never word anything as a saying of the Prophet ﷺ unless it is quoted from a passage.
- Never issue a ruling on the person's own situation.
- If the passages do not answer any part of the question, return {"sentences":[],"quotes":[],"verses":[],"lesson_id":null,"unanswered_parts":[]}.
- lesson_id: the lesson of the passages you mainly used.`;

function passageBlock(hits: Hit[]): string {
  return hits
    .map(({ chunk: c }) => {
      const lesson = c.lesson_id ? lessonById(c.lesson_id) : undefined;
      const sents = c.sentences.map((s, i) => `  s${i + 1}: ${s}`).join("\n");
      return `<passage id="${c.id}" page="${c.page}" lesson="${c.lesson_id ?? ""}" title="${lesson?.title.en ?? ""}">\n## ${c.heading}\n${sents}\n</passage>`;
    })
    .join("\n\n");
}

async function searchQueries(q: string, to: string): Promise<{ queries: string[]; usage?: Usage }> {
  // Two search phrasings in the edition's language: a faithful translation (or the question itself) and
  // one in the terms a beginner's fiqh/aqeedah textbook would use (e.g. "conditions of wiping over socks").
  try {
    const r = await generateJson<{ queries: string[] }>(
      `Write 2 short search queries in ${langName(to)} to find the answer to this question in a beginner's Islamic textbook: (1) the question translated/kept faithfully, (2) the same need phrased with the textbook's own terms (chapter-style wording). Return {"queries": ["...", "..."]}.\nQuestion: """${q}"""`,
      { model: config.routerModel, temperature: 0, timeoutMs: 15000, thinking: "minimal" },
    );
    return { queries: (r.data.queries ?? []).filter((x) => typeof x === "string" && x.trim()).slice(0, 2), usage: r.usage };
  } catch {
    return { queries: [] };
  }
}

const STEPS_LESSON: Record<Worship, string> = { wudu: "u3l3", ghusl: "u3l4", prayer: "u3l6" };

/** The book's own steps for wudu, ghusl or prayer, verbatim (from the English edition if this one lacks them). */
function bookSteps(lang: string, which: Worship) {
  const id = STEPS_LESSON[which];
  const own = getLesson(lang, id, { choice: null, completed: [] });
  if (own?.steps?.length) return { lesson: own, steps: own.steps, translated: sourceLang(lang).translated };
  const en = getLesson("en", id, { choice: null, completed: [] });
  return en?.steps?.length ? { lesson: { ...en, title: own?.title ?? en.title }, steps: en.steps, translated: true } : null;
}

export interface AskInput { question: string; lang: string; lessonId?: string | null; history?: string; country?: string | null }
export type Stage = { stage: "routing" } | { stage: "found"; pages: number[] } | { stage: "checking" };

export async function ask(input: AskInput, onStage: (s: Stage) => void = () => {}): Promise<AnswerResult> {
  const t0 = Date.now();
  let cost = 0;
  const track = (u?: Usage) => u && (cost += costUsd(u));
  const lessonTitle = (id?: string | null) => (id ? lessonById(id)?.title[input.lang] ?? lessonById(id)?.title.en ?? id : "");
  const base = (status: AnswerResult["status"], r: Route, extra: Partial<AnswerResult> = {}): AnswerResult => ({
    status, text: "", sentences: [], quotes: [], verses: [], sources: [], lesson: null, translatedExplanation: false,
    route: { action: r.action, label: r.label, emergency: r.emergency },
    trace: { retrieved: [], dropped: [], attempts: 0, costUsd: cost, ms: Date.now() - t0 }, ...extra,
  });

  onStage({ stage: "routing" });
  const r = await route(input.question, input.lessonId ? lessonTitle(input.lessonId) : "", input.history ?? "");
  track(r.usage);
  if (r.action === "refer") return base("referred", r, { text: referralText(r.label, input.lang, r.emergency, input.country) });
  if (r.action === "social") return base("social", r, { text: r.label === "off_topic" ? offTopicText(input.lang) : socialText(input.question, input.lang) });

  // "What is this lesson about?" / "summarize it": the lesson's reviewed summary, each sentence with its source.
  if (r.aboutLesson && input.lessonId) {
    const l = getLesson(input.lang, input.lessonId, { choice: null, completed: [] });
    if (l?.summary.length) {
      return {
        status: "answered", text: l.summary.map((x) => x.text).join(" "), sentences: l.summary, quotes: [], verses: [],
        sources: l.sources, lesson: { id: l.id, title: l.title }, translatedExplanation: l.translated_explanation,
        route: { action: r.action, label: r.label, emergency: r.emergency },
        trace: { retrieved: [], dropped: [], attempts: 0, costUsd: cost, ms: Date.now() - t0 },
      };
    }
  }

  // "How do I make wudu / pray / do ghusl?": the book's steps, verbatim, every time (code text only).
  if (r.stepsOf) {
    const bs = bookSteps(input.lang, r.stepsOf);
    if (bs) {
      const { lesson, steps } = bs;
      const intro = stepsIntro(input.lang, lesson.title);
      return {
        status: "answered", text: intro, sentences: [{ text: intro, sources: steps.map((x) => x.source) }],
        quotes: steps.map((x) => ({ ref: x.source, text: x.text, page: Number(x.source.split(":p")[1].split(":")[0]) })),
        verses: [], sources: lesson.sources, lesson: { id: lesson.id, title: lesson.title }, translatedExplanation: bs.translated,
        steps: true, route: { action: r.action, label: r.label, emergency: r.emergency },
        trace: { retrieved: [], dropped: [], attempts: 0, costUsd: cost, ms: Date.now() - t0 },
      };
    }
  }

  const src = sourceLang(input.lang);
  const question = r.standalone && input.history ? r.standalone : input.question;
  const sq = await searchQueries(question, src.lang);
  track(sq.usage);
  const queries = [question, ...sq.queries];
  const hits = await search(src.lang, queries, { lessonId: input.lessonId ?? undefined });
  const retrieved = hits.map((h) => ({ id: h.chunk.id, score: +h.score.toFixed(3) }));
  const relevant = withNeighbours(src.lang, hits.filter((h) => h.semantic >= config.minRelevance));
  if (relevant.length === 0) {
    return base("not_in_book", r, { text: referralText("not_in_book", input.lang, false), trace: { retrieved, dropped: [], attempts: 0, costUsd: cost, ms: Date.now() - t0 } });
  }

  const scopeHint = r.label === "out_of_book"
    ? "This question goes beyond a beginner book. Answer only if a passage answers it directly and specifically; a general principle or a passing mention is not an answer, so then return no sentences.\n"
    : "";
  const differenceHint = r.label === "difference"
    ? "The learner mentions a different practice or opinion. Explain what the book says on this point (with its passages), without judging the other practice and without saying which person is right.\n"
    : "";
  onStage({ stage: "found", pages: [...new Set(relevant.slice(0, 4).map((h) => h.chunk.page))].sort((a, b) => a - b) });
  const prompt = `${scopeHint}${differenceHint}${input.lessonId ? `The learner is studying the lesson "${lessonTitle(input.lessonId)}". Answer only from it.\n` : ""}${
    input.history ? `Earlier in this conversation:\n${input.history}\n` : ""}Question (${langName(input.lang)}): """${input.question}"""\n\nPassages:\n${passageBlock(relevant)}`;
  const system = SYSTEM.replaceAll("{LANG}", langName(input.lang));

  let checked: CheckResult | null = null;
  let draft: DraftAnswer | null = null;
  let attempts = 0;
  // Second try: if the first draft was empty, only the closest passages by meaning (a long list of
  // loosely related passages makes the model give up too early).
  const closest = [...relevant].sort((a, b) => b.semantic - a.semantic).slice(0, 6);
  const retryPrompt = prompt.replace(/Passages:\n[\s\S]*$/, `Passages:\n${passageBlock(closest)}`) +
    "\n\nIf any passage answers the question or part of it, answer that part.";
  for (const temperature of [0.2, 0]) {
    attempts++;
    if (attempts === 1) setTimeout(() => onStage({ stage: "checking" }), 1500);
    // (Not for questions the router already judged beyond a beginner book: there an empty draft is the right answer.)
    const emptyBefore: boolean = attempts === 2 && draft !== null && (draft.sentences ?? []).length === 0 && r.label !== "out_of_book";
    try {
      const g: { data: DraftAnswer; usage?: Usage } = await generateJson<DraftAnswer>(emptyBefore ? retryPrompt : prompt, { system, temperature, timeoutMs: 45000, thinking: "low" });
      track(g.usage);
      draft = g.data;
      checked = check(g.data, relevant.map((h) => h.chunk));
      if (acceptable(checked) || (checked.sentences.length === 0 && r.label === "out_of_book")) break;
    } catch {
      checked = null;
    }
  }
  const trace = { retrieved, dropped: checked?.dropped ?? [], attempts, costUsd: cost, ms: Date.now() - t0 };
  if (!checked || checked.sentences.length === 0) {
    // Point to the closest lesson when the book has one on the topic, so a decline is not a dead end.
    const near = [...relevant].sort((a, b) => b.semantic - a.semantic)[0];
    const nearLesson = checked && near && near.semantic >= 0.7 && near.chunk.lesson_id ? { id: near.chunk.lesson_id, title: lessonTitle(near.chunk.lesson_id) } : null;
    return base(checked ? "not_in_book" : "failed", r, { text: referralText(checked ? "not_in_book" : "failed", input.lang, false), lesson: nearLesson, trace });
  }
  if (!acceptable(checked)) return base("failed", r, { text: referralText("failed", input.lang, false), trace });

  const used = new Map<string, Chunk>();
  checked.sentences.forEach((s) => s.sources.forEach((id) => used.set(id, relevant.find((h) => h.chunk.id === id)!.chunk)));
  checked.quotes.forEach((q) => used.set(q.chunk.id, q.chunk));
  const counts = new Map<string, number>();
  [...used.values()].forEach((c) => c.lesson_id && counts.set(c.lesson_id, (counts.get(c.lesson_id) ?? 0) + 1));
  const lessonId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Fixed (never generated) notes: room on matters of scholarly difference, and an offer of a
  // mentor when the question goes beyond what the book covers.
  const differenceNote = r.label === "difference" ? DIFFERENCE_NOTE[input.lang] ?? DIFFERENCE_NOTE.en : null;
  const unanswered = (draft?.unanswered_parts ?? []).filter((x) => typeof x === "string" && x.trim());
  const partialNote = !differenceNote && unanswered.length > 0 ? referralText("partial", input.lang, false) : null;
  const note = differenceNote ?? partialNote;
  return {
    status: "answered",
    text: checked.sentences.map((s) => s.text).join(" ") + (note ? `\n\n${note}` : ""),
    difference_note: differenceNote,
    partial_note: partialNote,
    sentences: checked.sentences,
    quotes: checked.quotes.map((q) => ({ ref: q.ref, text: expandVerseMarkers(q.text, q.chunk.lang), page: q.chunk.page })),
    verses: checked.verses.flatMap((v) => verses(v, input.lang)),
    sources: [...used.values()].map((c) => ({ id: c.id, page: c.page, lang: c.lang, lesson_id: c.lesson_id, heading: c.heading, text: expandVerseMarkers(c.text, c.lang) })),
    lesson: lessonId ? { id: lessonId, title: lessonTitle(lessonId) } : null,
    translatedExplanation: src.translated,
    route: { action: r.action, label: r.label, emergency: r.emergency },
    trace,
  };
}
