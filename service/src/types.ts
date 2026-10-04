export type Lang = string; // ISO 639-1, e.g. "ar", "en", "tl"

/** One retrievable passage of Al-Wajeez. Id: `wajeez:<lang>:p<page>:c<n>`. */
export interface Chunk {
  id: string;
  lang: Lang;
  page: number; // printed page number of that edition
  lesson_id: string | null;
  heading: string;
  text: string;
  sentences: string[];
  quran_refs: string[]; // "S:A" or "S:A-B" exactly as the book cites them
  sha256: string;
}

/** What the generator returns: every sentence must name the passage(s) that support it. */
export interface DraftAnswer {
  sentences: { text: string; sources: string[] }[];
  quotes: string[]; // "<chunk id>#s<n>" — the code inserts the sentence text
  verses: string[]; // "S:A" — only allowed when a cited passage cites it
  lesson_id?: string | null;
}

export interface CheckedSentence {
  text: string;
  sources: string[];
}

export interface CheckResult {
  sentences: CheckedSentence[];
  quotes: { ref: string; chunk: Chunk; text: string }[];
  verses: string[];
  dropped: { text: string; reason: string }[];
  droppedRatio: number;
}

export type RouteLabel =
  | "curriculum"
  | "out_of_book"
  | "fatwa_personal"
  | "crisis"
  | "practical_need"
  | "social"
  | "difference"
  | "unsure";
