// One-off: translate the steps lead-in, the "thanks" reply and the 19 lesson titles into the languages of
// content/messages.json (fixed texts, never generated at answer time).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../src/config.ts";
import { generateJson } from "../src/llm.ts";

const LANGS: Record<string, string> = { fr: "French", es: "Spanish", de: "German", id: "Indonesian", pt: "Portuguese", ru: "Russian", bs: "Bosnian", vi: "Vietnamese", th: "Thai", tl: "Filipino (Tagalog)", hi: "Hindi", ur: "Urdu", tr: "Turkish", sw: "Swahili", zh: "Chinese (Simplified)", fa: "Persian", bn: "Bengali", ja: "Japanese", ko: "Korean" };
const msgFile = path.join(ROOT, "content/messages.json");
const structFile = path.join(ROOT, "content/structure.json");
const messages = JSON.parse(fs.readFileSync(msgFile, "utf8"));
const structure = JSON.parse(fs.readFileSync(structFile, "utf8"));
const lessons = structure.units.flatMap((u: any) => u.lessons);
const EN = {
  steps_intro: "Here are the steps exactly as the book Al-Wajeez gives them, from the lesson \"{TITLE}\":",
  thanks: "May Allah bless you. Ask me anything about your lesson, or continue to the next one when you are ready.",
  ...Object.fromEntries(lessons.map((l: any) => [`title_${l.id}`, l.title.en])),
  ...Object.fromEntries(structure.units.map((u: any) => [`unit_${u.id}`, u.title?.en ?? ""]).filter(([, v]: any) => v)),
};
await Promise.all(Object.entries(LANGS).map(async ([code, name]) => {
  const r = await generateJson<Record<string, string>>(
    `Translate each value of this JSON into ${name} for a new Muslim. Keep the meaning exact, warm and simple; keep "{TITLE}" unchanged; use the standard Islamic terms in ${name} (wudu, ghusl, salah, zakat, hajj as commonly written in ${name}); "Al-Wajeez" is the book's name. Return JSON with the same keys.\n${JSON.stringify(EN)}`,
    { model: "gemini-3.1-pro-preview", temperature: 0, timeoutMs: 120000 },
  );
  const d = r.data;
  messages[code].steps_intro = d.steps_intro;
  messages[code].thanks = d.thanks;
  for (const l of lessons) if (d[`title_${l.id}`]) l.title[code] = d[`title_${l.id}`];
  for (const u of structure.units) if (u.title && d[`unit_${u.id}`]) u.title[code] = d[`unit_${u.id}`];
  console.log(code, Object.keys(d).length);
}));
fs.writeFileSync(msgFile, JSON.stringify(messages, null, 1));
fs.writeFileSync(structFile, JSON.stringify(structure, null, 1));
