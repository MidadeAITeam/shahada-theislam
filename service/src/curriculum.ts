// Lesson order is decided by fixed rules in code, never by the model, so the same choice
// and history always give the same next lesson (tested in test/curriculum.test.ts).
import structure from "../../content/structure.json" with { type: "json" };

export type Choice = "wudu" | "prayer" | "fatiha" | "unsure";
export const CHOICES: Choice[] = ["wudu", "prayer", "fatiha", "unsure"];

export interface LessonMeta {
  id: string;
  unitId: string;
  unitIndex: number;
  index: number; // 1-based position in the book
  title: Record<string, string>;
  pagesAr: [number, number];
  critical: boolean;
}

export const LESSONS: LessonMeta[] = structure.units.flatMap((u, ui) =>
  u.lessons.map((l) => ({
    id: l.id,
    unitId: u.id,
    unitIndex: ui + 1,
    index: 0,
    title: l.title as Record<string, string>,
    pagesAr: l.pages_ar as [number, number],
    critical: Boolean((l as { critical?: boolean }).critical),
  })),
).map((l, i) => ({ ...l, index: i + 1 }));

export const BOOK_ORDER = LESSONS.map((l) => l.id);
const FIRST = structure.path_rules.first;
const CHOICE_PATHS = structure.path_rules.choices as Record<Choice, string[]>;
const PREREQ = structure.path_rules.prerequisites as Record<string, string[]>;

export function lessonById(id: string): LessonMeta | undefined {
  return LESSONS.find((l) => l.id === id);
}

/**
 * The full planned order for a learner: the Shahada lesson, then what they chose
 * (with prerequisites first), then the rest of the book in order. A missing choice
 * means "follow the book" (with purification and prayer first, as the idea file says).
 */
export function plannedPath(choice: Choice | null): string[] {
  const picked = CHOICE_PATHS[choice ?? "unsure"] ?? CHOICE_PATHS.unsure;
  const out: string[] = [];
  const add = (id: string) => {
    if (out.includes(id)) return;
    for (const p of PREREQ[id] ?? []) add(p);
    out.push(id);
  };
  add(FIRST);
  picked.forEach(add);
  BOOK_ORDER.forEach(add);
  return out;
}

/** Next lesson not yet completed, following the planned path; null when the book is done. */
export function nextLesson(choice: Choice | null, completed: string[]): string | null {
  const done = new Set(completed);
  return plannedPath(choice).find((id) => !done.has(id)) ?? null;
}

/** Position of a lesson in the learner's own path (1-based) and the path length. */
export function progressOf(choice: Choice | null, completed: string[]): { done: number; total: number } {
  const path = plannedPath(choice);
  return { done: path.filter((id) => completed.includes(id)).length, total: path.length };
}
