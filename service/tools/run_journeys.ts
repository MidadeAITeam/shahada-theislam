// Journey simulation: 30 invented learners × 4 visits (days 1, 3, 7, 14) = 120 journeys, run
// against the live HTTP API (real persistence, real lesson order, real question path).
// A model plays each learner and asks the free question in the learner's own language and words.
//   npx tsx tools/run_journeys.ts [--base http://localhost:8080] [--limit N]
// A journey is correct when: the lesson offered equals the reference, every lesson opened is
// the reference lesson, the free question is answered and linked to the reference lesson, and
// the learner is never asked again for what they already stated.
import fs from "node:fs";
import path from "node:path";
import { langName } from "../src/answer.ts";
import { ROOT } from "../src/config.ts";
import { generateJson } from "../src/llm.ts";

const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:8080";
const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1], 10) : Infinity;

interface J {
  id: string; persona: string; lang: string; background: string; country: string; choice: string | null; day: number; visit: number;
  completed_before: string[]; expected_next: string[]; free_question: string | null; free_question_lesson: string; must_not_reask: string[];
}
const journeys: J[] = fs.readFileSync(path.join(ROOT, "eval/journeys.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const personas = [...new Set(journeys.map((j) => j.persona))].slice(0, limit);

class Client {
  cookie = "";
  async call(method: string, p: string, body?: unknown) {
    const r = await fetch(BASE + p, { method, headers: { "Content-Type": "application/json", cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    return r.json();
  }
}

const ASKS_AGAIN = /(what is your (current )?(belief|religion)|where are you from|which country|ما (هو )?معتقدك|من أين أنت)/i;

async function rephrase(j: J): Promise<string> {
  const r = await generateJson<{ question: string }>(
    `You play a new Muslim (former ${j.background}, from ${j.country}) who studied a lesson today. Ask this question to your tutor in ${langName(j.lang)}, in your own simple words (one or two sentences). Do not mention any book or lesson. Return {"question": "..."}.\nQuestion: ${j.free_question}`,
    { temperature: 0.7, timeoutMs: 30000, thinking: "low" },
  );
  return r.data.question;
}

const out: Record<string, unknown>[] = [];
for (const p of personas) {
  const js = journeys.filter((j) => j.persona === p).sort((a, b) => a.visit - b.visit);
  const c = new Client();
  const first = js[0];
  const convo = [
    { role: "user", text: first.background !== "not stated" || first.country !== "not stated" ? `Hello. I am ${first.background !== "not stated" ? first.background : ""}${first.country !== "not stated" ? ` from ${first.country}` : ""}.` : "Hello." },
    { role: "assistant", text: "Welcome." },
    { role: "user", text: "I bear witness that there is no god but Allah and that Muhammad is the Messenger of Allah." },
  ];
  await c.call("POST", "/api/shahada/start", { lang: first.lang, conversation: convo });
  await c.call("POST", "/api/shahada/profile", { lang: first.lang, choice: first.choice, card: { country: null } });
  for (const j of js) {
    const row: Record<string, unknown> = { id: j.id, lang: j.lang, day: j.day, expected: j.expected_next };
    const opened: string[] = [];
    let orderOk = true;
    for (const exp of j.expected_next) {
      const prog = await c.call("GET", "/api/shahada/progress");
      const offered = prog.next?.id ?? null;
      if (offered !== exp) orderOk = false;
      const lesson = await c.call("GET", `/api/shahada/lessons/${offered}?lang=${j.lang}`);
      opened.push(lesson.id);
      await c.call("POST", `/api/shahada/lessons/${offered}/complete`, { lang: j.lang, check_answer: lesson.check_question?.answer_index ?? null });
    }
    row.opened = opened;
    row.order_ok = orderOk;
    let qOk = true;
    if (j.free_question) {
      const q = await rephrase(j);
      const a = await c.call("POST", "/api/shahada/ask", { question: q, lang: j.lang });
      row.question = q;
      row.answer_status = a.status;
      row.answer_lesson = a.lesson?.id ?? null;
      row.reasked = ASKS_AGAIN.test(a.text ?? "");
      qOk = a.status === "answered" && a.lesson?.id === j.free_question_lesson && !row.reasked;
    }
    row.question_ok = qOk;
    row.ok = orderOk && qOk;
    out.push(row);
    process.stdout.write(row.ok ? "." : "x");
  }
}
const file = path.join(ROOT, `eval/runs/journeys-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
fs.writeFileSync(file, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
const ok = out.filter((r) => r.ok).length;
const order = out.filter((r) => r.order_ok).length;
const qs = out.filter((r) => r.answer_status !== undefined);
console.log(`\nJourneys correct: ${ok}/${out.length} (${((100 * ok) / out.length).toFixed(1)}%)`);
console.log(`Lesson order matches the reference: ${order}/${out.length}`);
console.log(`Free questions answered and linked to the right lesson: ${qs.filter((r) => r.question_ok).length}/${qs.length}`);
console.log(`wrote ${file}`);
