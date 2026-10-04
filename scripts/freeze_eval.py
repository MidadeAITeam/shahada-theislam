"""Select and freeze the evaluation sets, then write their SHA-256 to eval/LOCK.sha256.

locked.jsonl (200, never used for tuning, run once at the end):
  120 answerable (40 ar, 40 en, 20 tl, 20 hi — tl/hi have no converted edition)
   20 legitimate-difference (khilaf), 30 not in the book, 30 critical (fatwa/crisis/practical)
dev.jsonl (100, used to tune thresholds), disjoint from locked.

Usage: python scripts/freeze_eval.py
"""
import hashlib, json, pathlib, random, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DRAFTS = ROOT / "eval/drafts"
STRUCT = json.loads((ROOT / "content/structure.json").read_text())
LESSONS = [(l["id"], *l["pages_ar"]) for u in STRUCT["units"] for l in u["lessons"]]
META = re.compile(r"(\bbook\b|\blesson\b|\bpage\b|according to|الكتاب|الدرس|الصفحة|aklat|aralin|पुस्तक|पाठ|किताब)", re.I)
rng = random.Random(20261004)


def lesson_for(page):
    return next((lid for lid, a, b in LESSONS if a <= page <= b), None)


def load():
    rows = [json.loads(l) for l in (DRAFTS / "all.jsonl").read_text().splitlines() if l.strip()]
    seen, out = set(), []
    for r in rows:
        q = r["question"].strip()
        if q in seen or (r["kind"] == "answerable" and META.search(q)):
            continue
        seen.add(q)
        if r["kind"] != "unanswerable":
            r["lesson_id"] = lesson_for(min(r["pages"])) if r["pages"] else r["lesson_id"]
            if not r["lesson_id"]:
                continue
        out.append(r)
    return out


def take_balanced(pool, n):
    """Round-robin over lessons so every lesson is represented."""
    by = {}
    for r in pool:
        by.setdefault(r.get("lesson_id"), []).append(r)
    for v in by.values():
        rng.shuffle(v)
    keys = sorted(by, key=str)
    out = []
    while len(out) < n and any(by.values()):
        for k in keys:
            if by[k] and len(out) < n:
                out.append(by[k].pop())
    return out


def main():
    rows = load()
    pick = lambda kind, lang=None: [r for r in rows if r["kind"] == kind and (lang is None or r["lang"] == lang)]
    locked, dev = [], []
    for lang, n_locked, n_dev in (("ar", 40, 20), ("en", 40, 20), ("tl", 20, 10), ("hi", 20, 10)):
        both = take_balanced(pick("answerable", lang), n_locked + n_dev)
        rng.shuffle(both)
        locked += both[:n_locked]
        dev += both[n_locked:]
    kh = pick("khilaf"); rng.shuffle(kh)
    locked += kh[:20]; dev += kh[20:30]
    un = pick("unanswerable"); rng.shuffle(un)
    locked += un[:30]; dev += un[30:45]
    crit = [json.loads(l) for l in (DRAFTS / "critical.jsonl").read_text().splitlines() if l.strip()]
    for c in crit:
        c.update(kind="critical", lesson_id=None, pages=[], answer_points=["routes to a human", "no generated ruling"])
    locked += [c for c in crit if not c.get("dev")]
    dev += [c for c in crit if c.get("dev")]
    for i, r in enumerate(locked, 1):
        r["id"] = f"L{i:03d}"
    for i, r in enumerate(dev, 1):
        r["id"] = f"D{i:03d}"
    assert len(locked) == 200, len(locked)
    out = ROOT / "eval"
    lines = lambda xs: "\n".join(json.dumps(x, ensure_ascii=False, sort_keys=True) for x in xs) + "\n"
    (out / "locked.jsonl").write_text(lines(locked))
    (out / "dev.jsonl").write_text(lines(dev))
    h = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    (out / "LOCK.sha256").write_text(f"{h(out / 'locked.jsonl')}  eval/locked.jsonl\n{h(out / 'dev.jsonl')}  eval/dev.jsonl\n")
    from collections import Counter
    print("locked", Counter((r["kind"], r["lang"]) for r in locked))
    print("dev", len(dev), Counter(r["kind"] for r in dev))
    print((out / "LOCK.sha256").read_text())


if __name__ == "__main__":
    main()
