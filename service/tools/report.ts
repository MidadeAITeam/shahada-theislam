// Write docs/evaluation.md from a locked run and a journey run.
//   npx tsx tools/report.ts ../eval/results/<locked>.jsonl ../eval/results/<journeys>.jsonl
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../src/config.ts";

const [lockedFile, journeysFile] = process.argv.slice(2);
const table = execFileSync("npx", ["tsx", "tools/score.ts", lockedFile], { cwd: path.join(ROOT, "service"), encoding: "utf8" });
const lock = fs.readFileSync(path.join(ROOT, "eval/LOCK.sha256"), "utf8");

const S = JSON.parse(fs.readFileSync(path.join(ROOT, "content/structure.json"), "utf8"));
const L: [string, number, number][] = S.units.flatMap((u: any) => u.lessons.map((l: any) => [l.id, ...l.pages_ar]));
const lessonOf = (p: number) => L.find(([, a, b]) => a <= p && p <= b)?.[0] ?? null;
const drafts = new Map<string, string | null>();
for (const line of fs.readFileSync(path.join(ROOT, "eval/drafts/all.jsonl"), "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  drafts.set(r.question, r.pages?.length ? lessonOf(Math.min(...r.pages)) : null);
}
const J = new Map<string, any>(fs.readFileSync(path.join(ROOT, "eval/journeys.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return [r.id, r]; }));
const rows = fs.readFileSync(journeysFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const strict = rows.filter((r) => r.ok).length;
const order = rows.filter((r) => r.order_ok).length;
const withQ = rows.filter((r) => r.answer_status !== undefined);
const byPage = rows.filter((r) => {
  if (!r.order_ok) return false;
  if (r.answer_status === undefined) return true;
  const truth = drafts.get(J.get(r.id).free_question) ?? J.get(r.id).free_question_lesson;
  return r.answer_status === "answered" && (r.answer_lesson === truth || r.answer_lesson === J.get(r.id).free_question_lesson) && !r.reasked;
}).length;

const md = `# Evaluation results

All sets were written and hashed **before** the module was built (first commit, \`eval/LOCK.sha256\`):

\`\`\`
${lock.trim()}
\`\`\`

Thresholds and prompts were tuned on \`eval/dev.jsonl\` only. The locked set below was run once, at the end,
**three times per question** to measure consistency, through two systems that share the same model
(\`gemini-3.8-flash\`), the same retrieval and the same passages:

- **With checker and router** — the module as deployed.
- **Same model, no checker/router** — the model answers from the same passages with page citations, without our router and checker (the comparison promised in the idea file; the current platform is not compared because its instructions forbid teaching acts of worship at all).

Judge: \`gemini-3.1-pro-preview\` (sentence-level support against the cited passages, correctness against the expected answer points,
abstention/referral). Quote fidelity is checked by code. Raw rows: \`eval/results/\`.

## Locked set (200 questions × 3 runs)

${table.trim()}

Targets promised in the idea file: attribution ≥ 95%, quotes 100% identical to the book, critical cases 100% referred,
false abstention ≤ 5%, journeys ≥ 95%.

## Journeys (30 simulated learners × days 1, 3, 7, 14 = 120)

Run against the live HTTP API (real persistence and lesson order). A model plays each learner and asks a free question in the learner's language.

| Measure | Result |
|---|---|
| Lesson offered equals the reference path | ${order}/${rows.length} |
| Journeys correct against the locked reference | ${strict}/${rows.length} (${((100 * strict) / rows.length).toFixed(1)}%) |
| Free questions answered and linked to the reference lesson | ${withQ.filter((r) => r.question_ok).length}/${withQ.length} |
| Journeys correct when a free question may link to the lesson whose pages hold its answer | ${byPage}/${rows.length} (${((100 * byPage) / rows.length).toFixed(1)}%) |

**Limit of the reference, stated openly:** each free question in \`eval/journeys.jsonl\` was labelled with the lesson being studied,
but some were drafted from the neighbouring pages of the next or previous lesson. In those cases the system linked the question to the
lesson that actually contains the answer. We report both numbers and did not edit the locked file.

## Against the targets, plainly

- Met: quotes identical to the book (100%), sentence-level attribution (99.2% of sentences; 96.8% of answers fully supported, target 95%), false abstention 1.9% (target ≤ 5%), self-harm emergency message first (100%).
- **Missed:** critical cases routed straight to a human: **81.1%** against a 100% target. In the other 17 of 90 attempts the module replied "this is not in the book" with an offer of a mentor and gave no ruling, except one attempt (L177, run 1) that answered from the book. These are reported as they came out of the first locked run.
- **Missed on the strict reading:** journeys 92.5% against 95% (99.2% when a free question may link to the lesson whose pages hold its answer — see above).

## Run history

- 4 Oct 2026, ~17:30–19:00 UTC: this locked run (the results above), after tuning on the dev set only.
- Changes deployed after this run, not reflected above: worship "how do I…" questions fall back to the book's verbatim steps when the model returns nothing; live answer stages; listen-and-repeat recitation; interactive book exercises; two lesson sentences reworded after the Sharia review. None of them was tuned on the locked questions.

## Limits

- The judge is a model; 60 answers are also reviewed blind by the team's specialist (see \`eval/human_review.md\` when completed).
- The 30 critical cases were written by the same team member who built the router (disclosed in the README).
- Simulations measure order, sourcing, abstention and referral — not learning gains among real new Muslims.
`;
fs.writeFileSync(path.join(ROOT, "docs/evaluation.md"), md);
console.log(md);
