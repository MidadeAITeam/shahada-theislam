// Turn the assessment questions printed at the end of each Al-Wajeez lesson into interactive
// exercises. The question wording comes from the book; the answer key is written by the model
// from the lesson's own passages and must pass the same checker (every sentence cites a passage).
// Output: data/build/<lang>/exercises.json.  Usage: npx tsx tools/build_exercises.ts <lang> [...]
import fs from "node:fs";
import path from "node:path";
import { lessonChunks, sourceLang } from "../src/book.ts";
import { check } from "../src/checker.ts";
import { config } from "../src/config.ts";
import { LESSONS } from "../src/curriculum.ts";
import { langName } from "../src/answer.ts";
import { generateJson } from "../src/llm.ts";
import { isExercise } from "../src/lessons.ts";

interface Ex { type: "tf" | "mcq" | "open"; prompt: string; options?: string[]; answer_index?: number; explanation: { text: string; sources: string[] }[] }

const SYSTEM = `You turn the printed assessment questions of one lesson of "Al-Wajeez" into interactive exercises for a new Muslim.
You get the lesson passages and the printed exercise passages. Output JSON {"exercises":[...]} with up to 5 items:
{"type":"tf"|"mcq"|"open","prompt":"...","options":["..."],"answer_index":0,
 "explanation":[{"text":"...","sources":["<lesson passage id>"]}]}
Rules:
- Use only questions that ARE printed in the exercise passages; keep their wording (lightly shortened if needed) in {LANG}.
- True/false items: options are the words for True and False in {LANG}. Multiple choice: keep the printed options.
- Open questions (explain, describe, list): type "open", no options; the explanation is the model answer.
- Skip reflective/personal prompts (diaries, "describe your feelings") and anything the lesson passages do not answer.
- explanation: 1-3 short sentences in {LANG}, each citing the lesson passage id(s) that support it; never add outside facts. No quotation marks.`;

for (const lang of process.argv.slice(2)) {
  const src = sourceLang(lang);
  const out: Record<string, Ex[]> = {};
  await Promise.all(LESSONS.map(async (l, i) => {
    await new Promise((r) => setTimeout(r, i * 300));
    const all = lessonChunks(src.lang, l.id);
    const lesson = all.filter((c) => !isExercise(c));
    const printed = all.filter(isExercise);
    if (!printed.length) return;
    const block = (cs: typeof all) => cs.map((c) => `<passage id="${c.id}" page="${c.page}">\n## ${c.heading}\n${c.text}\n</passage>`).join("\n\n");
    try {
      const g = await generateJson<{ exercises: Ex[] }>(
        `LESSON PASSAGES:\n${block(lesson)}\n\nPRINTED EXERCISES:\n${block(printed)}`,
        { system: SYSTEM.replaceAll("{LANG}", langName(lang)), temperature: 0, timeoutMs: 120000 },
      );
      const kept: Ex[] = [];
      for (const ex of g.data.exercises ?? []) {
        const r = check({ sentences: ex.explanation ?? [], quotes: [], verses: [] }, lesson);
        if (!r.sentences.length || r.dropped.length) continue;
        if (ex.type !== "open" && (!ex.options?.length || typeof ex.answer_index !== "number" || !ex.options[ex.answer_index])) continue;
        kept.push({ ...ex, explanation: r.sentences });
      }
      if (kept.length) out[l.id] = kept;
      console.log(lang, l.id, kept.length);
    } catch (e) {
      console.log(lang, l.id, "FAILED", String(e).slice(0, 120));
    }
  }));
  fs.writeFileSync(path.join(config.dataDir, "build", lang, "exercises.json"), JSON.stringify(out, null, 1));
  console.log(lang, "lessons with exercises:", Object.keys(out).length);
}
