// Build the lesson file once (not at request time): for each lesson, a short summary whose every
// sentence names its passage, the worship steps as verbatim book sentences (chosen by reference,
// inserted by code), and one comprehension question tied to a passage. Everything passes the same
// checker as live answers. Output: data/build/<lang>/lessons.json
//
// Usage: npx tsx tools/build_lessons.ts <lang> [lang ...]
//   For a language without a converted edition (e.g. tl, hi) the English edition is used and the
//   lesson is marked translated_explanation.
import fs from "node:fs";
import path from "node:path";
import { lessonChunks, sourceLang } from "../src/book.ts";
import { check } from "../src/checker.ts";
import { config } from "../src/config.ts";
import { LESSONS } from "../src/curriculum.ts";
import { langName } from "../src/answer.ts";
import { costUsd, generateJson } from "../src/llm.ts";
import type { Chunk, DraftAnswer } from "../src/types.ts";

const WORSHIP_STEPS = new Set(["u3l3", "u3l4", "u3l6"]); // wudu, ghusl, prayer: show the book's steps in full

interface Built {
  id: string;
  lang: string;
  source_lang: string;
  translated_explanation: boolean;
  summary: { text: string; sources: string[] }[];
  steps: { text: string; source: string }[] | null;
  check_question: { question: string; options: string[]; answer_index: number; source: string } | null;
  verses: string[];
  dropped: number;
}

const SYSTEM = `You prepare one lesson of the book "Al-Wajeez" for someone who became Muslim today.
Use ONLY the passages given. Output JSON:
{"summary":[{"text":"...","sources":["<passage id>"]}],
 "step_passages":["<passage id>", ...],
 "verses":["S:A"],
 "check_question":{"question":"...","options":["...","...","..."],"answer_index":0,"source":"<passage id>"}}
Rules:
- summary: 4-8 short, warm, simple sentences in {LANG}, in the order of the lesson. Every sentence lists the passage id(s)
  that support it; never add anything the passages do not say. No quotation marks.
- step_passages: {STEPS}
- verses: up to 2 verses whose marker {{Q:S:A}} appears in the passages and that are central to the lesson.
- check_question: one simple multiple-choice question in {LANG} whose answer is stated in one passage (give its id).
  Skip exercises and assessment questions printed in the book when choosing content.`;

function block(chunks: Chunk[]) {
  return chunks.map((c) => `<passage id="${c.id}" page="${c.page}">\n## ${c.heading}\n${c.sentences.map((s, i) => `  s${i + 1}: ${s}`).join("\n")}\n</passage>`).join("\n\n");
}

async function buildLesson(lang: string, lessonId: string): Promise<{ built: Built; cost: number }> {
  const src = sourceLang(lang);
  const chunks = lessonChunks(src.lang, lessonId);
  const steps = WORSHIP_STEPS.has(lessonId)
    ? "the id(s) of the passage(s) that describe HOW to perform this act of worship step by step, in reading order. Their full text is shown verbatim to the learner, so include every passage that holds part of the steps."
    : "return []";
  const system = SYSTEM.replaceAll("{LANG}", langName(lang)).replace("{STEPS}", steps);
  let cost = 0;
  for (const temperature of [0.2, 0]) {
    const g = await generateJson<DraftAnswer & { summary: DraftAnswer["sentences"]; step_passages: string[]; check_question: Built["check_question"] }>(
      `Lesson: ${LESSONS.find((l) => l.id === lessonId)!.title.en}\n\nPassages:\n${block(chunks)}`,
      { system, temperature, timeoutMs: 120000 },
    );
    cost += costUsd(g.usage);
    const d = g.data;
    const r = check({ sentences: d.summary ?? [], quotes: [], verses: d.verses ?? [] }, chunks);
    if (r.sentences.length >= 2 && r.droppedRatio <= 1 / 3) {
      const cq = d.check_question && chunks.some((c) => c.id === d.check_question!.source) ? d.check_question : null;
      return {
        cost,
        built: {
          id: lessonId, lang, source_lang: src.lang, translated_explanation: src.translated,
          summary: r.sentences,
          steps: WORSHIP_STEPS.has(lessonId)
            ? chunks.filter((c) => (d.step_passages ?? []).includes(c.id)).map((c) => ({ text: c.text, source: c.id }))
            : null,
          check_question: cq, verses: r.verses, dropped: r.dropped.length,
        },
      };
    }
  }
  throw new Error(`lesson ${lang}/${lessonId} did not pass the checker`);
}

for (const lang of process.argv.slice(2)) {
  const out = path.join(config.dataDir, "build", lang, "lessons.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const existing: Record<string, Built> = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  let total = 0;
  await Promise.all(
    LESSONS.filter((l) => !existing[l.id]).map(async (l, i) => {
      await new Promise((r) => setTimeout(r, i * 400));
      try {
        const { built, cost } = await buildLesson(lang, l.id);
        existing[l.id] = built;
        total += cost;
        console.log(lang, l.id, "ok", built.summary.length, "sentences", built.steps?.length ?? "-", "steps");
      } catch (e) {
        console.log(lang, l.id, "FAILED", String(e).slice(0, 200));
      }
    }),
  );
  fs.writeFileSync(out, JSON.stringify(existing, null, 1));
  console.log(lang, "lessons", Object.keys(existing).length, "cost $", total.toFixed(3));
}
