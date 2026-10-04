// The start card: what the user said about themselves, each field backed by their own sentence.
// The model proposes; code keeps a field only if its evidence is found verbatim in the user's
// own messages (never the assistant's). Nothing is inferred, and nothing is stored until the
// user confirms the card.
import { config } from "./config.ts";
import { generateJson } from "./llm.ts";
import { containsNormalized } from "./text.ts";

export interface Field { value: string; evidence: string; label?: string }
export interface StartCard {
  language: Field;
  previous_religion: Field | null;
  country: Field | null;
  asked_about: Field | null;
}

const RELIGIONS = ["christian", "jewish", "hindu", "buddhist", "atheist", "agnostic", "sikh", "other"];

const PROMPT = `Below are the USER's own messages from a conversation in which they just accepted Islam.
Extract ONLY what the user explicitly said about themselves. For each field copy the exact user sentence (or clause)
that states it as "evidence". If the user did not say it explicitly, return null for that field. Do not guess from
names, language, writing style or topics.
Return JSON:
{"previous_religion": {"value": one of ${JSON.stringify(RELIGIONS)}, "evidence": "..."} | null,
 "country": {"value": "<ISO 3166-1 alpha-2>", "label": "<country name in the user's language>", "evidence": "..."} | null,
 "asked_about": {"value": "<the main topic they asked about, 1-4 words, in the user's language>", "evidence": "..."} | null}`;

export async function startCard(lang: string, conversation: { role: string; text: string }[]): Promise<StartCard> {
  const userText = conversation.filter((m) => m.role === "user").map((m) => m.text).join("\n");
  const card: StartCard = { language: { value: lang, evidence: "" }, previous_religion: null, country: null, asked_about: null };
  if (!userText.trim()) return card;
  try {
    const r = await generateJson<Omit<StartCard, "language">>(`${PROMPT}\n\nUSER MESSAGES:\n"""${userText.slice(-6000)}"""`, {
      model: config.routerModel, temperature: 0, timeoutMs: 20000,
    });
    for (const k of ["previous_religion", "country", "asked_about"] as const) {
      const f = r.data[k];
      // Keep a field only when its evidence really is the user's own words.
      if (f && f.value && f.evidence && f.evidence.length >= 3 && containsNormalized(userText, f.evidence)) {
        if (k === "previous_religion" && !RELIGIONS.includes(f.value)) continue;
        card[k] = { value: f.value, evidence: f.evidence.trim(), ...(f.label ? { label: f.label } : {}) };
      }
    }
  } catch {
    /* the card is optional; an empty card is a valid result */
  }
  return card;
}
