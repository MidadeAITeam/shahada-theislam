"""Convert an Al-Wajeez PDF into page-tagged Markdown.

Each page is rendered to an image and sent to Gemini together with the PDF
text layer. The model transcribes the page faithfully; Quran verses (drawn in
a glyph font that has no usable text layer) are replaced by a marker
{{Q:surah:ayah-ayah}} so the verse text can be inserted later from Tanzil.

Usage: python scripts/extract_book.py LANG [--pages 1-5] [--workers 8]
Output: data/wajeez/md/LANG/page-NNN.md  (one file per printed PDF page)
"""
import argparse, base64, concurrent.futures as cf, json, os, pathlib, subprocess, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "data/wajeez/pdf"
OUT_DIR = ROOT / "data/wajeez/md"
MODEL = os.environ.get("EXTRACT_MODEL", "gemini-3.8-flash")

PROMPT = """You are transcribing one page of the book "Al-Wajeez: a classroom curriculum for new Muslims" (language: {lang}).
Return ONLY the page content as GitHub Markdown. Rules:
- Transcribe the text exactly as printed. Do not translate, summarise, correct, or add anything.
- Keep reading order. Use #, ##, ### for the visible heading hierarchy (unit, lesson, section titles).
- Keep numbered and bulleted lists as lists. Render tables as Markdown tables.
- Quran verses: if a verse is printed (often in a special Quran font), replace the verse words with a marker
  {{{{Q:SURAH:AYAH}}}} or {{{{Q:SURAH:FROM-TO}}}} using the numeric surah number and ayah numbers given in the
  citation next to it (e.g. "(Aal-Imran: 85)" -> {{{{Q:3:85}}}}). Keep the printed citation text after the marker.
  If you cannot determine the numbers, write {{{{Q:?}}}} followed by the printed citation.
- Drop running headers/footers, page numbers, decorative elements, and dotted answer lines (.....).
- Exercise / assessment questions: keep the question text, drop the blank lines.
- If the page has no meaningful text (cover art, blank), return exactly: <!-- empty -->
The PDF text layer is given below as a hint; it may have broken Arabic ligatures or garbage for Quran glyphs. Trust the image.
--- TEXT LAYER ---
{text}
"""

def gemini(parts, key, retries=5):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    body = json.dumps({"contents": [{"role": "user", "parts": parts}],
                       "generationConfig": {"temperature": 0}}).encode()
    for i in range(retries):
        try:
            req = urllib.request.Request(url, body, {"Content-Type": "application/json", "x-goog-api-key": key})
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.load(r)
            return "".join(p.get("text", "") for p in d["candidates"][0]["content"]["parts"]).strip()
        except Exception as e:
            if i == retries - 1:
                raise
            time.sleep(2 ** i * 3)

def page_count(pdf):
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    return int(next(l.split()[-1] for l in out.splitlines() if l.startswith("Pages")))

def do_page(lang, pdf, n, key, tmp):
    out = OUT_DIR / lang / f"page-{n:03d}.md"
    if out.exists() and out.stat().st_size > 0:
        return n, "skip"
    text = subprocess.run(["pdftotext", "-q", "-f", str(n), "-l", str(n), str(pdf), "-"],
                          capture_output=True, text=True).stdout
    png = tmp / f"{lang}-{n}"
    subprocess.run(["pdftoppm", "-q", "-r", "130", "-png", "-singlefile", "-f", str(n), "-l", str(n), str(pdf), str(png)], check=True)
    img = base64.b64encode((png.with_suffix(".png")).read_bytes()).decode()
    md = gemini([{"text": PROMPT.format(lang=lang, text=text[:12000])},
                 {"inline_data": {"mime_type": "image/png", "data": img}}], key)
    md = md.removeprefix("```markdown").removeprefix("```").removesuffix("```").strip()
    out.write_text(f"<!-- page: {n} -->\n{md}\n", encoding="utf-8")
    png.with_suffix(".png").unlink(missing_ok=True)
    return n, "ok"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lang"); ap.add_argument("--pages"); ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    key = os.environ["GEMINI_API_KEY"]
    pdf = PDF_DIR / f"{a.lang}.pdf"
    total = page_count(pdf)
    lo, hi = (map(int, a.pages.split("-")) if a.pages else (1, total))
    (OUT_DIR / a.lang).mkdir(parents=True, exist_ok=True)
    tmp = ROOT / "data/tmp"; tmp.mkdir(parents=True, exist_ok=True)
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(do_page, a.lang, pdf, n, key, tmp) for n in range(lo, hi + 1)]
        for f in cf.as_completed(futs):
            try:
                n, s = f.result(); print(a.lang, n, s, flush=True)
            except Exception as e:
                print(a.lang, "ERROR", e, file=sys.stderr, flush=True)

if __name__ == "__main__":
    main()
