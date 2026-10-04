// Review lesson summaries in languages the team cannot read directly: each sentence is translated
// back into Arabic and checked against the passage it cites. A lesson is approved for display only
// if every sentence passes; the result is recorded in content/review.json with this method.
//   npx tsx tools/backtranslate_review.ts es id pt bs vi ru th tl hi
import fs from "node:fs";
import path from "node:path";
import { chunkById } from "../src/book.ts";
import { config, ROOT } from "../src/config.ts";
import { generateJson } from "../src/llm.ts";

const reviewFile = path.join(ROOT, "content/review.json");
const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
const report: string[] = [];

for (const lang of process.argv.slice(2)) {
  const f = path.join(config.dataDir, "build", lang, "lessons.json");
  if (!fs.existsSync(f)) continue;
  const lessons = JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, { summary: { text: string; sources: string[] }[] }>;
  await Promise.all(Object.entries(lessons).map(async ([lid, l], i) => {
    await new Promise((r) => setTimeout(r, i * 300));
    const items = l.summary.map((s, k) => `${k + 1}. SENTENCE: ${s.text}\n   PASSAGE: ${s.sources.map((id) => chunkById(id)?.text ?? "").join(" ").slice(0, 1500)}`).join("\n");
    try {
      const r = await generateJson<{ results: { n: number; arabic: string; supported: boolean }[] }>(
        `For each numbered item: translate SENTENCE into Arabic ("arabic"), then decide whether the PASSAGE states it (paraphrase allowed; anything added, stronger or different = false).\nReturn {"results":[{"n":1,"arabic":"...","supported":true}, ...]}.\n\n${items}`,
        { model: "gemini-3.1-pro-preview", temperature: 0, timeoutMs: 120000 },
      );
      const ok = r.data.results.length === l.summary.length && r.data.results.every((x) => x.supported);
      if (ok) review.approved[`${lang}:${lid}`] = { by: "automated back-translation check (gemini-3.1-pro), every sentence against its cited passage", on: "2026-10-04", method: "back-translation to Arabic" };
      report.push(`${lang} ${lid} ${ok ? "approved" : "kept as book text only: " + r.data.results.filter((x) => !x.supported).map((x) => x.n).join(",")}`);
    } catch (e) {
      report.push(`${lang} ${lid} error ${String(e).slice(0, 80)}`);
    }
  }));
}
fs.writeFileSync(reviewFile, JSON.stringify(review, null, 1));
console.log(report.sort().join("\n"));
