// The router decides, for each message, whether to answer from the book or to refer to a person.
// Two independent signals; either one is enough to refer:
//   (a) a fixed list of crisis and self-harm phrases in the most common languages (code);
//   (b) a fast model that labels the message.
// It labels the MESSAGE, never the user, and the label is not stored in the user's profile.
import { config } from "./config.ts";
import { generateJson, type Usage } from "./llm.ts";
import { normalize } from "./text.ts";
import type { RouteLabel } from "./types.ts";

const SELF_HARM = [
  "kill myself", "end my life", "ending my life", "suicide", "suicidal", "want to die", "don't want to live", "dont want to live",
  "hurt myself", "hurting myself", "harm myself", "cut myself", "no reason to live", "point of living", "better off dead",
  "انتحر", "أنتحر", "انتحار", "اقتل نفسي", "أقتل نفسي", "أؤذي نفسي", "اؤذي نفسي", "لا أريد أن أعيش", "لا اريد ان اعيش", "أنهي حياتي", "انهي حياتي",
  "me suicidar", "quiero morir", "me matar", "quero morir", "me tuer", "suicider", "bunuh diri", "ingin mati",
  "покончить с собой", "убить себя", "самоубий", "magpakamatay", "patayin ang sarili", "आत्महत्या", "मरना चाहता", "मरना चाहती",
  "自杀", "tự tử", "ฆ่าตัวตาย", "kujiua",
];
const THREAT = [
  "threaten", "threatened", "kill me", "hurt me", "beat me", "hits me", "hit me", "kicked me out", "kick me out", "locked me", "took my passport",
  "afraid to go home", "nowhere to sleep", "homeless",
  "هددني", "يهددني", "يضربني", "طردني", "طردوني", "حبسوني", "سيقتلني", "بالقتل",
  "pinalayas", "धमकी", "घर से निकाल",
];

export type Signal = { label: RouteLabel; source: "keywords" | "model"; confidence: number; reason?: string };
export interface Route {
  action: "answer" | "refer" | "social";
  label: RouteLabel;
  emergency: boolean; // show the fixed emergency message first
  signals: Signal[];
  usage?: Usage;
}

export function keywordSignal(message: string): Signal | null {
  const n = ` ${normalize(message)} `;
  const hit = (list: string[]) => list.some((p) => n.includes(` ${normalize(p)}`) || n.includes(normalize(p)));
  if (hit(SELF_HARM)) return { label: "crisis", source: "keywords", confidence: 1, reason: "self_harm" };
  if (hit(THREAT)) return { label: "crisis", source: "keywords", confidence: 1, reason: "threat" };
  return null;
}

const ROUTER_SYSTEM = `You label ONE message sent by a new Muslim to a tutor that teaches only from a beginner book
("Al-Wajeez": basics of belief, the Qur'an and short surahs, purification, wudu, ghusl, women's rulings, prayer, zakat,
fasting, hajj, clothing, food and drink, money dealings, good character).
Labels:
- curriculum: a general question about these topics, answerable from such a book (how to pray, what breaks wudu, meaning of the Shahada, what is zakat...).
- out_of_book: a general Islamic question beyond a beginner book (history, detailed fiqh, tafsir of long surahs, scholars, modern issues).
- fatwa_personal: asks for a ruling on the person's OWN specific situation (their marriage, job, debts, family, a past act), or which of two opinions they personally must follow.
- crisis: danger, abuse, threats, being thrown out, self-harm or despair.
- practical_need: needs a person or service: certificate of conversion, nearest mosque or centre, money, marriage help, in-person teacher, travel.
- social: greeting, thanks, small talk.
- unsure: none of the above fits well.
Return JSON {"label": <label>, "confidence": 0..1, "reason": "<5 words>"}. When torn between curriculum and fatwa_personal, choose fatwa_personal.`;

export async function route(message: string, context = ""): Promise<Route> {
  const signals: Signal[] = [];
  const kw = keywordSignal(message);
  if (kw) signals.push(kw);
  let usage: Usage | undefined;
  try {
    const r = await generateJson<{ label: RouteLabel; confidence: number; reason?: string }>(
      `${context ? `Current lesson: ${context}\n` : ""}Message: """${message.slice(0, 2000)}"""`,
      { system: ROUTER_SYSTEM, model: config.routerModel, temperature: 0, timeoutMs: 20000 },
    );
    usage = r.usage;
    signals.push({ label: r.data.label, source: "model", confidence: Number(r.data.confidence) || 0, reason: r.data.reason });
  } catch {
    signals.push({ label: "unsure", source: "model", confidence: 0, reason: "router_error" });
  }
  const model = signals.find((s) => s.source === "model")!;
  const referLabels: RouteLabel[] = ["crisis", "fatwa_personal", "practical_need", "unsure"];
  const emergency = signals.some((s) => s.label === "crisis" && s.reason === "self_harm") || (model.label === "crisis" && /harm|suicid|die|life/i.test(model.reason ?? ""));
  if (kw || referLabels.includes(model.label) || model.confidence < 0.5 && model.label !== "social") {
    const label = kw ? "crisis" : model.confidence < 0.5 && !referLabels.includes(model.label) ? "unsure" : model.label;
    return { action: "refer", label, emergency, signals, usage };
  }
  if (model.label === "social") return { action: "social", label: "social", emergency: false, signals, usage };
  return { action: "answer", label: model.label, emergency: false, signals, usage };
}
