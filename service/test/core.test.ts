import { test } from "node:test";
import assert from "node:assert/strict";
import { check, acceptable } from "../src/checker.ts";
import { nextLesson, plannedPath, BOOK_ORDER, progressOf } from "../src/curriculum.ts";
import { normalize, splitSentences } from "../src/text.ts";
import type { Chunk } from "../src/types.ts";

const chunk = (id: string, text: string, quran_refs: string[] = []): Chunk => ({
  id, lang: "en", page: 64, lesson_id: "u3l3", heading: "Wudu", text,
  sentences: splitSentences(text), quran_refs, sha256: "x",
});

const A = chunk("wajeez:en:p64:c1", "Wash the face three times. Then wash the arms up to the elbows.", ["5:6"]);
const B = chunk("wajeez:en:p65:c2", "Wiping over the head is done once.");

test("keeps sentences that cite retrieved passages", () => {
  const r = check({ sentences: [{ text: "You wash your face three times.", sources: [A.id] }], quotes: [], verses: [] }, [A, B]);
  assert.equal(r.sentences.length, 1);
  assert.equal(r.droppedRatio, 0);
  assert.ok(acceptable(r));
});

test("drops sentences without an id or with an id that was not retrieved", () => {
  const r = check({
    sentences: [
      { text: "Wash the face.", sources: [A.id] },
      { text: "Make intention in your heart.", sources: [] },
      { text: "Use cold water.", sources: ["wajeez:en:p99:c9"] },
    ], quotes: [], verses: [],
  }, [A, B]);
  assert.deepEqual(r.dropped.map((d) => d.reason), ["no_source_id", "unknown_source_id"]);
  assert.ok(!acceptable(r)); // 2 of 3 dropped > 1/3
});

test("drops a sentence whose quoted text is not in the cited passage", () => {
  const r = check({
    sentences: [
      { text: 'The book says "wash the face three times".', sources: [A.id] },
      { text: 'The book says "wash the feet seven times".', sources: [A.id] },
    ], quotes: [], verses: [],
  }, [A]);
  assert.equal(r.sentences.length, 1);
  assert.equal(r.dropped[0].reason, "quote_not_in_source");
});

test("inserts quotes from the book by reference, never from model text", () => {
  const r = check({ sentences: [{ text: "x", sources: [A.id] }], quotes: [`${A.id}#s2`, `${A.id}#s9`, "wajeez:en:p1:c1#s1"], verses: [] }, [A]);
  assert.equal(r.quotes.length, 1);
  assert.equal(r.quotes[0].text, "Then wash the arms up to the elbows.");
});

test("allows a verse only when a cited passage cites it", () => {
  const r = check({ sentences: [{ text: "x", sources: [A.id] }], quotes: [], verses: ["5:6", "2:255"] }, [A, B]);
  assert.deepEqual(r.verses, ["5:6"]);
});

test("normalisation ignores hamza, tashkeel and quote styles but not wording", () => {
  assert.equal(normalize("الإسلامُ"), normalize("الاسلام"));
  assert.notEqual(normalize("wash three times"), normalize("wash seven times"));
});

test("path starts with the Shahada lesson and puts prerequisites first", () => {
  const p = plannedPath("prayer");
  assert.deepEqual(p.slice(0, 4), ["u1l3", "u3l2", "u3l3", "u3l6"]);
  assert.equal(new Set(p).size, BOOK_ORDER.length);
});

test("fatiha choice brings the short-surahs lesson second", () => {
  assert.deepEqual(plannedPath("fatiha").slice(0, 2), ["u1l3", "u2l2"]);
});

test("no choice follows purification and prayer, then the book", () => {
  assert.deepEqual(plannedPath(null), plannedPath("unsure"));
  assert.deepEqual(plannedPath(null).slice(0, 5), ["u1l3", "u3l2", "u3l3", "u3l6", "u1l1"]);
});

test("next lesson skips completed lessons and ends with null", () => {
  assert.equal(nextLesson("wudu", ["u1l3"]), "u3l2");
  assert.equal(nextLesson("wudu", ["u1l3", "u3l2", "u3l3"]), "u1l1");
  assert.equal(nextLesson("wudu", BOOK_ORDER), null);
  assert.deepEqual(progressOf("wudu", ["u1l3"]), { done: 1, total: BOOK_ORDER.length });
});

test("same inputs always give the same path", () => {
  for (const c of ["wudu", "prayer", "fatiha", "unsure"] as const) assert.deepEqual(plannedPath(c), plannedPath(c));
});
