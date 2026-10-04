import { ask } from "../src/answer.ts";
const qs = [
  { question: "How do I make wudu step by step?", lang: "en" },
  { question: "ما معنى شهادة أن لا إله إلا الله؟", lang: "ar" },
  { question: "Paano ako magdasal ng limang beses sa isang araw?", lang: "tl" },
  { question: "What are the inheritance shares of daughters?", lang: "en" },
  { question: "My wife is Christian, is my marriage still valid?", lang: "en" },
];
for (const q of qs) {
  const r = await ask(q);
  console.log("\n==", q.question, "->", r.status, r.route.label, r.lesson?.id, `${r.trace.ms}ms $${r.trace.costUsd.toFixed(4)}`);
  console.log(r.text.slice(0, 600));
  console.log("quotes:", r.quotes.map(x=>x.text.slice(0,80)), "verses:", r.verses.map(v=>v.ref), "dropped:", r.trace.dropped.length, "sources:", r.sources.map(s=>s.id));
}
