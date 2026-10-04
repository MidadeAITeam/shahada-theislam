"""Draft the evaluation question sets from the book text (run once, before building).

For each lesson, Gemini Pro reads the lesson pages and drafts questions with the
lesson id and the pages that hold the answer. A human then reviews the drafts;
the reviewed files are frozen and their SHA-256 published (eval/LOCK.sha256).

Usage: python scripts/gen_eval.py
Writes eval/drafts/*.jsonl (not used by the system at runtime).
"""
import json, os, pathlib, random, re, subprocess, time, concurrent.futures as cf

ROOT = pathlib.Path(__file__).resolve().parent.parent
MD = ROOT / "data/wajeez/md"
OUT = ROOT / "eval/drafts"
MODEL = "gemini-3.1-pro-preview"
STRUCT = json.loads((ROOT / "content/structure.json").read_text())

def gemini(prompt, schema=None):
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.7, "responseMimeType": "application/json"}}
    if schema:
        body["generationConfig"]["responseSchema"] = schema
    for i in range(5):
        r = subprocess.run(["curl", "-sS", "-m", "300", "-H", "Content-Type: application/json",
                            "-H", f"x-goog-api-key: {os.environ['GEMINI_API_KEY']}",
                            f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                            "-d", json.dumps(body)], capture_output=True, text=True)
        try:
            d = json.loads(r.stdout)
            return json.loads(d["candidates"][0]["content"]["parts"][0]["text"])
        except Exception:
            time.sleep(5 * (i + 1))
    raise RuntimeError(r.stdout[:500])

# PDF page index minus printed page number, per edition (TOC page check: ar p12, en p13).
OFFSET = {"ar": 0, "en": 1}

def pages(lang, a, b):
    """Lesson pages (printed numbering a..b) with markers rewritten to printed page numbers."""
    off = OFFSET[lang]
    out = []
    for n in range(a + off, b + off + 1):
        f = MD / lang / f"page-{n:03d}.md"
        if f.exists():
            out.append(f.read_text().replace(f"<!-- page: {n} -->", f"<!-- page: {n - off} -->"))
    return "\n".join(out)

Q_SCHEMA = {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
    "question": {"type": "STRING"}, "answer_points": {"type": "ARRAY", "items": {"type": "STRING"}},
    "pages": {"type": "ARRAY", "items": {"type": "INTEGER"}}, "style": {"type": "STRING"}},
    "required": ["question", "answer_points", "pages", "style"]}}

ANSWERABLE = """You write test questions for a tutor that teaches NEW MUSLIMS from the book below (one lesson of "Al-Wajeez").
Write {n} questions a new Muslim might really ask, whose answer is clearly IN these pages.
Language of the questions: {qlang}. Mix styles: {styles}.
- "direct": uses the book's own terms. - "indirect": everyday wording, no book terms, or a practical situation.
For each: question, 2-4 short answer_points (in English) that a correct answer must contain, the page numbers
(from the <!-- page: N --> markers) that hold the answer, and style. No fatwa-on-personal-situation questions.
--- LESSON PAGES ---
{text}"""

KHILAF = """From the lesson pages below (book "Al-Wajeez" for new Muslims), find points where scholars have legitimate
difference of opinion (e.g. details of prayer positions, what nullifies wudu, ghusl details, fasting details) and the book
states one view. Write {n} questions in {qlang} a new Muslim might ask about such a point (e.g. "my friend prays
differently..."). answer_points must include "states the book's view" and "notes there is legitimate scholarly room/difference".
pages = where the book states it. style = "khilaf".
--- LESSON PAGES ---
{text}"""

UNANSWERABLE = """Write {n} questions in {qlang} that a new Muslim might plausibly ask, related to Islam, but whose answer
is NOT in the book "Al-Wajeez" (a short beginner curriculum: basics of belief, Qur'an short surahs, purification, wudu, ghusl,
women's rulings, prayer basics, zakat, fasting, hajj, clothing, food, money dealings, manners).
Make them general (not personal fatwas), e.g. details of inheritance shares, history of a specific caliph, rulings on
cryptocurrency, tafsir of a long surah, biographies of scholars, details of eclipse prayer. answer_points = ["abstains: not in the book",
"offers human referral"]. pages = []. style = "unanswerable".
Here is the book's table of contents for reference:
{toc}"""

def lesson_list():
    for u in STRUCT["units"]:
        for l in u["lessons"]:
            yield l

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    toc = (MD / "ar/page-012.md").read_text() + (MD / "ar/page-013.md").read_text()
    jobs = []
    # 220 answerable drafts per split pool (ar/en from their own edition; tl/hi asked against English pages)
    plan = [("ar", "Arabic", "ar"), ("en", "English", "en"), ("tl", "Filipino (Tagalog)", "en"), ("hi", "Hindi", "en")]
    with cf.ThreadPoolExecutor(8) as ex:
        for l in lesson_list():
            a, b = l["pages_ar"]
            for qlang_code, qlang, src in plan:
                n = 6 if qlang_code in ("ar", "en") else 3
                jobs.append(ex.submit(lambda l=l, a=a, b=b, qc=qlang_code, ql=qlang, src=src, n=n: (
                    "answerable", qc, l["id"], src,
                    gemini(ANSWERABLE.format(n=n, qlang=ql, styles="direct and indirect, about half each",
                                             text=pages(src, max(1, a - 1), b + 1)), Q_SCHEMA))))
            if l.get("critical") or l["id"] in ("u3l6", "u3l3", "u3l4", "u3l8", "u3l2"):
                for qc, ql in (("ar", "Arabic"), ("en", "English")):
                    jobs.append(ex.submit(lambda l=l, a=a, b=b, qc=qc, ql=ql: (
                        "khilaf", qc, l["id"], qc,
                        gemini(KHILAF.format(n=4, qlang=ql, text=pages(qc, max(1, a - 1), b + 1)), Q_SCHEMA))))
        for qc, ql in (("ar", "Arabic"), ("en", "English"), ("tl", "Filipino (Tagalog)"), ("hi", "Hindi")):
            jobs.append(ex.submit(lambda qc=qc, ql=ql: (
                "unanswerable", qc, None, None, gemini(UNANSWERABLE.format(n=18, qlang=ql, toc=toc), Q_SCHEMA))))
        rows = []
        for f in cf.as_completed(jobs):
            kind, qc, lid, src, items = f.result()
            for it in items:
                rows.append({"kind": kind, "lang": qc, "lesson_id": lid, "source_edition": src, **it})
            print(kind, qc, lid, len(items), flush=True)
    random.Random(42).shuffle(rows)
    (OUT / "all.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")
    print("total", len(rows))

if __name__ == "__main__":
    main()
