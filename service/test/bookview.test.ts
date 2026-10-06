import { test } from "node:test";
import assert from "node:assert/strict";
import { bookContents, bookPage } from "../src/bookview.ts";

test("book contents: units with their title pages, lessons with page ranges, every page once", () => {
  const t = bookContents("en");
  assert.equal(t.lang, "en");
  assert.equal(t.translated, false);
  assert.equal(t.units.length, 4);
  assert.deepEqual(t.units.map((u) => u.title_page), [15, 37, 53, 99]);
  assert.deepEqual(t.units[2].lessons.find((l) => l.id === "u3l3")?.pages, [62, 67]);
  assert.ok(!t.intro.includes(15), "a unit's title page is not part of the introduction");
  assert.deepEqual(t.pages, [...new Set(t.pages)].sort((a, b) => a - b));
});

test("a language without its own edition reads the English one, with lesson titles in its language", () => {
  const t = bookContents("tr");
  assert.equal(t.lang, "en");
  assert.equal(t.translated, true);
  assert.notEqual(t.units[0].lessons[0].title, bookContents("en").units[0].lessons[0].title);
});

test("a page: passages in order, verse markers expanded, exercises marked, neighbours", () => {
  const p = bookPage("en", 64)!;
  assert.equal(p.lesson?.id, "u3l3");
  assert.equal(p.prev, 63);
  assert.equal(p.next, 65);
  assert.ok(p.passages.length > 1);
  assert.ok(p.passages.some((x) => x.exercise) && p.passages.some((x) => !x.exercise));
  for (const lg of ["en", "ar"]) for (const n of bookContents(lg).pages) assert.ok(!bookPage(lg, n)!.passages.some((x) => x.text.includes("{{Q:")), `${lg} p${n}`);
  assert.equal(bookPage("en", 5)!.prev, null);
  assert.equal(bookPage("en", 5)!.lesson, null);
  assert.equal(bookPage("en", 14), null); // not a printed page of this edition
});
