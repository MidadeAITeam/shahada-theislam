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
- fatwa_personal: the answer depends on the details of the person's OWN circumstances, which a general book cannot settle:
  the validity of their existing marriage, what to do about their specific job, debts, family conflict, a past act they
  describe in detail, or which of two scholars they personally must follow. Examples: "My wife is Christian, is our marriage
  valid?", "I work in a bar, must I quit?", "I took my shahada drunk, does it count?".
  NOT fatwa_personal (these are curriculum): general questions even when phrased with "I" or "my", e.g. "Will Allah forgive
  the sins I did before Islam?", "Can I eat meat slaughtered by a Christian?", "Is taking a loan with interest allowed?",
  "How do I wash my face in wudu?".
- crisis: danger, abuse, threats, being thrown out, self-harm or despair.
- practical_need: needs a person or service: certificate of conversion, nearest mosque or centre, money, marriage help, in-person teacher, travel.
- difference: asks which of two practices or opinions is right, or mentions that others do or say something different from
  what they learned (e.g. "my friend prays with hands at his sides, which is correct?", "some say any touch breaks wudu").
  These are answered from the book with its view, and the tutor notes that scholars have legitimate room on the matter.
- social: greeting, thanks, small talk.
- unsure: none of the above fits well.
Return JSON {"label": <label>, "confidence": 0..1, "reason": "<5 words>"}. When the question can be answered by stating a general rule, choose curriculum; choose fatwa_personal only when the specific personal details change the answer.`;

export async function route(message: string, context = ""): Promise<Route> {
  const signals: Signal[] = [];
  const kw = keywordSignal(message);
  if (kw) signals.push(kw);
  let usage: Usage | undefined;
  try {
    const r = await generateJson<{ label: RouteLabel; confidence: number; reason?: string }>(
      `${context ? `Current lesson: ${context}\n` : ""}Message: """${message.slice(0, 2000)}"""`,
      { system: ROUTER_SYSTEM, model: config.routerModel, temperature: 0, timeoutMs: 20000, thinking: "minimal" },
    );
    usage = r.usage;
    signals.push({ label: r.data.label, source: "model", confidence: Number(r.data.confidence) || 0, reason: r.data.reason });
  } catch {
    // A failed model call is not a judgement about the message: fall back to the keyword signal
    // alone and let retrieval decide (no passage above the threshold -> "not in the book" + referral).
    signals.push({ label: "curriculum", source: "model", confidence: 1, reason: "router_unavailable" });
  }
  const model = signals.find((s) => s.source === "model")!;
  const referLabels: RouteLabel[] = ["crisis", "fatwa_personal", "practical_need", "unsure"];
  const emergency = signals.some((s) => s.label === "crisis" && s.reason === "self_harm") || (model.label === "crisis" && /harm|suicid|die|life/i.test(model.reason ?? ""));
  if (kw || referLabels.includes(model.label) || model.confidence < 0.5 && model.label !== "social") {
    const label = kw ? "crisis" : model.confidence < 0.5 && !referLabels.includes(model.label) ? "unsure" : model.label;
    return { action: "refer", label, emergency, signals, usage };
  }
  if (model.label === "difference") return { action: "answer", label: "difference", emergency: false, signals, usage };
  if (model.label === "social") return { action: "social", label: "social", emergency: false, signals, usage };
  return { action: "answer", label: model.label, emergency: false, signals, usage };
}
