// The whole book to browse, not only the passages an answer or a lesson cites: a table of contents
// (units -> lessons -> pages) and one printed page at a time, in reading order. Exercises and the
// assessment pages are part of the book, so they are shown too, only marked as such.
import { edition, sourceLang } from "./book.ts";
import { lessonById } from "./curriculum.ts";
import { lessonTitle } from "./lessons.ts";
import { expandVerseMarkers } from "./quran.ts";
import structure from "../../content/structure.json" with { type: "json" };

const unitTitle = (u: (typeof structure.units)[number], lang: string) => (u.title as Record<string, string>)[lang] ?? u.title.en;

/** Printed pages of an edition in order, and the lesson each one belongs to (null: front matter or a unit's title page). */
function pagesOf(lang: string): { page: number; lesson: string | null }[] {
  const out: { page: number; lesson: string | null }[] = [];
  for (const c of edition(lang)?.chunks ?? []) {
    const last = out[out.length - 1];
    if (last?.page === c.page) last.lesson ??= c.lesson_id;
    else out.push({ page: c.page, lesson: c.lesson_id });
  }
  return out;
}

/**
 * Table of contents for the learner's edition. Lesson titles are in the learner's language; pages
 * are the edition's printed pages (all editions share one layout). A page without a lesson right
 * before a unit's first lesson is that unit's title page; the others before the first lesson are
 * the introduction, and those after the last lesson the book's end.
 */
export function bookContents(userLang: string) {
  const src = sourceLang(userLang);
  const pages = pagesOf(src.lang);
  const range = (ids: string[]) => {
    const ps = pages.filter((p) => p.lesson && ids.includes(p.lesson)).map((p) => p.page);
    return ps.length ? ([ps[0], ps[ps.length - 1]] as [number, number]) : null;
  };
  const titlePages = new Set<number>();
  const units = structure.units.map((u, ui) => {
    const lessons = u.lessons.map((l) => ({ id: l.id, title: lessonTitle(l.id, userLang), pages: range([l.id]) }));
    const r = range(u.lessons.map((l) => l.id));
    const at = r ? pages.findIndex((p) => p.page === r[0]) : -1;
    const before = at > 0 && !pages[at - 1].lesson ? pages[at - 1].page : null;
    if (before) titlePages.add(before);
    return { id: u.id, index: ui + 1, title: unitTitle(u, userLang), title_page: before, pages: r && before ? [before, r[1]] : r, lessons };
  });
  const firstLessonPage = pages.find((p) => p.lesson)?.page ?? Infinity;
  const lastLessonPage = [...pages].reverse().find((p) => p.lesson)?.page ?? -Infinity;
  return {
    lang: src.lang,
    translated: src.translated,
    title: (structure.title as Record<string, string>)[src.lang] ?? structure.title.en,
    intro: pages.filter((p) => p.page < firstLessonPage && !titlePages.has(p.page)).map((p) => p.page),
    end: pages.filter((p) => p.page > lastLessonPage).map((p) => p.page),
    units,
    pages: pages.map((p) => p.page),
  };
}

/** One printed page: its passages in reading order, the lesson it belongs to, and the pages around it. */
export function bookPage(userLang: string, page: number) {
  const src = sourceLang(userLang);
  const e = edition(src.lang);
  if (!e) return null;
  const pages = pagesOf(src.lang);
  const at = pages.findIndex((p) => p.page === page);
  if (at < 0) return null;
  const passages = e.chunks
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.page === page)
    .map(({ c, i }) => ({ id: c.id, heading: c.heading, text: expandVerseMarkers(c.text, c.lang), exercise: e.exercise[i] }));
  const lid = pages[at].lesson;
  const meta = lid ? lessonById(lid) : undefined;
  const unit = meta ? structure.units.find((u) => u.id === meta.unitId) : undefined;
  return {
    page,
    lang: src.lang,
    translated: src.translated,
    lesson: meta ? { id: meta.id, title: lessonTitle(meta.id, userLang), unit: unit ? { id: unit.id, index: meta.unitIndex, title: unitTitle(unit, userLang) } : null } : null,
    prev: pages[at - 1]?.page ?? null,
    next: pages[at + 1]?.page ?? null,
    first: pages[0].page,
    last: pages[pages.length - 1].page,
    passages,
  };
}
