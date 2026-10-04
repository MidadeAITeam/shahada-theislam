"""Write the 30 simulated learners and their 120 reference journeys (frozen before building).

Each learner returns on days 1, 3, 7 and 14. A journey is one visit: the learner opens the
next lesson, may answer the comprehension question, and asks one free question between
lessons. The reference says which lesson must be offered and which lesson each free question
must link to. Personas are invented; none is drawn from real conversations.

Usage: python scripts/gen_journeys.py   -> eval/journeys.jsonl (+ hash appended to LOCK.sha256)
"""
import hashlib, json, pathlib, random

ROOT = pathlib.Path(__file__).resolve().parent.parent
STRUCT = json.loads((ROOT / "content/structure.json").read_text())
BOOK = [l["id"] for u in STRUCT["units"] for l in u["lessons"]]
RULES = STRUCT["path_rules"]
rng = random.Random(1404)

LANGS = ["en"] * 9 + ["ar"] * 7 + ["fr", "es", "id", "pt", "ru", "bs", "vi", "th"] + ["tl", "tl", "hi", "hi", "zh", "sw"]
BACKGROUNDS = ["Christian", "Hindu", "atheist", "Buddhist", "Jewish", "not stated"]
COUNTRIES = ["USA", "India", "Philippines", "UK", "Sweden", "Kenya", "France", "Brazil", "Indonesia", "not stated"]
CHOICES = ["wudu", "prayer", "fatiha", "unsure", None]


def planned(choice):
    out = []
    def add(i):
        if i in out:
            return
        for p in RULES["prerequisites"].get(i, []):
            add(p)
        out.append(i)
    add(RULES["first"])
    for i in RULES["choices"][choice or "unsure"]:
        add(i)
    for i in BOOK:
        add(i)
    return out


def main():
    pool = [json.loads(l) for l in (ROOT / "eval/drafts/all.jsonl").read_text().splitlines() if l.strip()]
    used = {json.loads(l)["question"] for f in ("locked.jsonl", "dev.jsonl")
            for l in (ROOT / "eval" / f).read_text().splitlines() if l.strip()}
    free = [r for r in pool if r["kind"] == "answerable" and r["question"] not in used and r["lang"] in ("ar", "en")]
    rng.shuffle(free)
    by_lesson = {}
    for r in free:
        by_lesson.setdefault(r["lesson_id"], []).append(r)
    rows = []
    for p in range(1, 31):
        lang = LANGS[p - 1]
        persona = {"persona": f"P{p:02d}", "lang": lang, "background": rng.choice(BACKGROUNDS),
                   "country": rng.choice(COUNTRIES), "choice": rng.choice(CHOICES),
                   "lessons_per_visit": rng.choice([1, 1, 2])}
        path = planned(persona["choice"])
        done = []
        for v, day in enumerate((1, 3, 7, 14), 1):
            expected = path[len(done):len(done) + persona["lessons_per_visit"]]
            # free question about the lesson just studied (in English/Arabic source; the simulator rephrases into lang)
            src = by_lesson.get(expected[0], [])
            q = src.pop() if src else None
            rows.append({
                "id": f"{persona['persona']}-V{v}", **persona, "visit": v, "day": day,
                "completed_before": list(done), "expected_next": expected,
                "free_question": q and q["question"], "free_question_lesson": expected[0],
                "must_not_reask": [k for k in ("background", "country") if persona[k] != "not stated"],
            })
            done += expected
    out = ROOT / "eval/journeys.jsonl"
    out.write_text("\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in rows) + "\n")
    h = hashlib.sha256(out.read_bytes()).hexdigest()
    lock = ROOT / "eval/LOCK.sha256"
    lines = [l for l in lock.read_text().splitlines() if "journeys" not in l]
    lock.write_text("\n".join(lines + [f"{h}  eval/journeys.jsonl"]) + "\n")
    print(len(rows), "journeys", h)


if __name__ == "__main__":
    main()
