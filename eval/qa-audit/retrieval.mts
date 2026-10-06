// Book passages retrieved independently for each question, given to the judge as context.
//   npx tsx ../eval/qa-audit/retrieval.mts <folder with questions.jsonl>   (run from service/)
import fs from "node:fs";
import { search, sourceLang, withNeighbours } from "../../service/src/book.ts";
const D = process.argv[2];
const qs = fs.readFileSync(`${D}/questions.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const out = fs.createWriteStream(`${D}/retrieval.jsonl`);
for (const x of qs) {
  const src = sourceLang(x.lang);
  const h = await search(src.lang, [x.question], { lessonId: x.lesson_id ?? undefined, k: 8 });
  const w = withNeighbours(src.lang, h);
  out.write(JSON.stringify({ id: x.id, edition: src.lang, passages: w.map((y) => ({ id: y.chunk.id, lesson: y.chunk.lesson_id, sem: +y.semantic.toFixed(3), heading: y.chunk.heading, text: y.chunk.text })) }) + "\n");
}
out.end();
