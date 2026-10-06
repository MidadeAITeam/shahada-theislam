// Runs eval/shahada_scenarios.json against the live pre-Shahada chat and checks when <shahada/> fires.
// Placeholder assistant turns (OFFER, COMPLETE, CONGRATS) are replaced by the model's real replies:
// we send each user turn in order, chaining previous_response_id.
// Pass rule: expect=true → fires on the final user turn and never earlier (C20: fires on the 2nd user turn;
// the repeat may fire again). expect=false → never fires.
// Usage: npx tsx tools/run_shahada.ts [--base URL] [--runs 3] [--only C11,C14]
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt("--base", "https://shahada.theislam.chat");
const RUNS = Number(opt("--runs", "3"));
const ONLY = opt("--only", "").split(",").filter(Boolean);
const ROOT = path.resolve(import.meta.dirname, "../..");
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/shahada_scenarios.json"), "utf8"));

async function turn(text: string, prev?: string) {
  const res = await fetch(`${BASE}/api/chat/no-auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, previous_response_id: prev }),
  });
  const body = await res.text();
  let last: any = {};
  for (const l of body.split("\n")) if (l.startsWith("data:")) { try { const d = JSON.parse(l.slice(5)); if (d.final) last = d; } catch {} }
  if (last.error) throw new Error(last.error);
  return { text: String(last.text ?? "").replace("\n<shahada/>", ""), shahada: !!last.shahada, id: last.response_id as string };
}

async function runConvo(cat: any, convo: string[][]) {
  const users = convo.filter((m) => m[0] === "user").map((m) => m[1]);
  let prev: string | undefined;
  const fired: boolean[] = [];
  const replies: string[] = [];
  for (const u of users) {
    const r = await turn(u, prev);
    prev = r.id; fired.push(r.shahada); replies.push(r.text);
  }
  const n = users.length;
  let pass: boolean;
  if (!cat.expect) pass = fired.every((f) => !f);
  else if (cat.id === "C20") pass = fired[1] && !fired[0]; // the repeat may fire again or not
  else pass = fired[n - 1] && fired.slice(0, n - 1).every((f) => !f);
  return { users, fired, replies, pass };
}

const out: any[] = [];
const cats = spec.categories.filter((c: any) => !ONLY.length || ONLY.includes(c.id));
await Promise.all(cats.map(async (cat: any) => {
  for (let ci = 0; ci < cat.convos.length; ci++) for (let run = 0; run < RUNS; run++) {
    let r: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { r = await runConvo(cat, cat.convos[ci]); break; } catch (e) { r = { error: String(e), pass: false }; }
    }
    out.push({ id: cat.id, name: cat.name, expect: cat.expect, convo: ci, run, ...r });
  }
}));
out.sort((a, b) => a.id.localeCompare(b.id) || a.convo - b.convo || a.run - b.run);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = path.join(ROOT, `eval/results/shahada_${stamp}.jsonl`);
fs.writeFileSync(file, out.map((o) => JSON.stringify(o)).join("\n") + "\n");
const byCat = new Map<string, { name: string; p: number; t: number }>();
for (const o of out) { const c = byCat.get(o.id) ?? { name: o.name, p: 0, t: 0 }; c.t++; if (o.pass) c.p++; byCat.set(o.id, c); }
for (const [id, c] of byCat) console.log(`${c.p === c.t ? "PASS" : "FAIL"} ${id} ${c.p}/${c.t}  ${c.name}`);
console.log(`total ${out.filter((o) => o.pass).length}/${out.length}  → ${path.relative(ROOT, file)}`);
