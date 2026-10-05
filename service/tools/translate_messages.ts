// One-off: translate the fixed referral/safety texts into more languages (reviewed, then committed
// as content/messages.json). These texts are never generated at answer time.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../src/config.ts";
import { generateJson } from "../src/llm.ts";
import { MESSAGES_EN } from "../src/messages.ts";

const LANGS: Record<string, string> = { fr: "French", es: "Spanish", de: "German", id: "Indonesian", pt: "Portuguese", ru: "Russian", bs: "Bosnian", vi: "Vietnamese", th: "Thai", tl: "Filipino (Tagalog)", hi: "Hindi", ur: "Urdu", tr: "Turkish", sw: "Swahili", zh: "Chinese (Simplified)", fa: "Persian", bn: "Bengali", ja: "Japanese", ko: "Korean" };
const out: Record<string, Record<string, string>> = {};
for (const [code, name] of Object.entries(LANGS)) {
  const r = await generateJson<Record<string, string>>(
    `Translate each value of this JSON into ${name} for a new Muslim reading it in a chat. Keep the meaning exact, warm and simple. Keep "{NUMBER}" unchanged. Use the standard Islamic terms in ${name} (e.g. mentor, Al-Wajeez as the book's name). Return JSON with the same keys.\n${JSON.stringify(MESSAGES_EN)}`,
    { model: "gemini-3.1-pro-preview", temperature: 0, timeoutMs: 120000 },
  );
  out[code] = r.data;
  console.log(code, Object.keys(r.data).length);
}
fs.writeFileSync(path.join(ROOT, "content/messages.json"), JSON.stringify(out, null, 1));
