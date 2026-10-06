// Qur'an text and translations of meanings are inserted by code, never written by the model.
// Arabic: Tanzil Uthmani (Hafs). Meanings: QuranEnc, in the user's language when available,
// otherwise English.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

let arabic: Map<string, string> | null = null;
const translations = new Map<string, Map<string, string> | null>();

function loadArabic() {
  if (arabic) return arabic;
  arabic = new Map();
  const f = path.join(config.dataDir, "quran/quran-uthmani.txt");
  const lines = fs.readFileSync(f, "utf8").split("\n");
  const BASMALA = lines[0].split("|")[2].trim(); // 1:1 is the basmala itself
  for (const line of lines) {
    const [s, a, t] = line.split("|");
    if (!(s && a && t && /^\d+$/.test(s))) continue;
    let text = t.trim();
    // Tanzil prefixes the basmala to the first verse of every surah except 1 and 9; it is not part of that verse.
    if (a === "1" && s !== "1" && text.startsWith(BASMALA)) text = text.slice(BASMALA.length).trim();
    arabic.set(`${s}:${a}`, text);
  }
  return arabic;
}

function loadTranslation(lang: string) {
  if (translations.has(lang)) return translations.get(lang)!;
  const f = path.join(config.dataDir, `quran/translations/${lang}.json`);
  let m: Map<string, string> | null = null;
  if (fs.existsSync(f)) {
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    m = new Map(Object.entries(d.ayat as Record<string, string>).map(([k, v]) => [k, v.replace(/\[\d+\]/g, "").trim()]));
  }
  translations.set(lang, m);
  return m;
}

export interface Verse { ref: string; arabic: string; meaning: string | null; meaningLang: string | null; source: string }

/** Expand "S:A" or "S:A-B" into verses with Arabic text and a published translation of meanings. */
export function verses(ref: string, lang: string): Verse[] {
  const [s, range] = ref.split(":");
  const [from, toRaw] = range.split("-").map((x) => parseInt(x, 10));
  const to = Number.isNaN(toRaw) || toRaw === undefined ? from : toRaw;
  const ar = loadArabic();
  const tLang = lang === "ar" ? null : loadTranslation(lang) ? lang : loadTranslation("en") ? "en" : null;
  const tr = tLang ? loadTranslation(tLang) : null;
  const out: Verse[] = [];
  for (let a = from; a <= Math.min(to, from + 20); a++) {
    const key = `${parseInt(s, 10)}:${a}`;
    const text = ar.get(key);
    if (!text) continue;
    out.push({ ref: key, arabic: text, meaning: tr?.get(key)?.replace(/^\s*\d{1,3}\s*[.)-]\s*/, "") ?? null, meaningLang: tLang, source: "Tanzil (Hafs) · QuranEnc" });
  }
  return out;
}

/**
 * Replace the book's verse markers {{Q:S:A}} / {{Q:S:A-B}} with the verse text from Tanzil (and, outside
 * Arabic, its published meaning in brackets), so no raw marker ever reaches the learner. Unknown markers go.
 */
export function expandVerseMarkers(text: string, lang: string): string {
  return text.replace(/\{\{Q:([^}]*)\}\}/g, (_m, ref: string) => {
    if (!/^\d{1,3}:\d{1,3}(-\d{1,3})?$/.test(ref.trim())) return "";
    const vs = verses(ref.trim(), lang);
    if (!vs.length) return "";
    // Isolated (FSI…PDI) so the Arabic does not reorder the brackets and words around it in a left-to-right passage.
    const arabic = `\u2068﴿${vs.map((v) => v.arabic).join(" ۝ ")}﴾\u2069`;
    const meaning = lang === "ar" ? "" : vs.map((v) => v.meaning).filter(Boolean).join(" ");
    return meaning ? `${arabic} (${meaning})` : arabic;
  });
}
