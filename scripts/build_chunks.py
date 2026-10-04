"""Cut each edition of Al-Wajeez into passages with stable ids and printed page numbers.

Input : data/wajeez/md/<lang>/page-NNN.md   (from extract_book.py)
Output: data/build/<lang>/chunks.jsonl      (runtime corpus, not committed: book text)
        content/manifest/<lang>.json        (committed: ids, pages, lessons and SHA-256 only)

A passage never crosses a page, so every citation points to one printed page.
Usage: python scripts/build_chunks.py [lang ...]
"""
import hashlib, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MD = ROOT / "data/wajeez/md"
BUILD = ROOT / "data/build"
MANIFEST = ROOT / "content/manifest"
STRUCT = json.loads((ROOT / "content/structure.json").read_text())

LESSON_PAGES = [(l["id"], *l["pages_ar"]) for u in STRUCT["units"] for l in u["lessons"]]
TOC_PAGES = {16, 20, 26, 30, 38, 44, 54, 58, 62, 68, 72, 76, 84, 88, 92, 100, 104, 108, 112}
DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
Q_MARK = re.compile(r"\{\{Q:(\d{1,3}):(\d{1,3}(?:-\d{1,3})?)\}\}")
SKIP_HEADINGS = re.compile(r"(مفكرة|diary|tagebuch|journal|дневник|catatan|nhật ký|บันทึก)", re.I)
TARGET_WORDS = 120


def pages_of(lang):
    out = {}
    for f in sorted((MD / lang).glob("page-*.md")):
        n = int(f.stem.split("-")[1])
        out[n] = f.read_text(encoding="utf-8")
    return out


def page_offset(pages):
    """PDF index minus printed page number. The Arabic edition prints the first contents page
    (units 1-2: lessons on pages 16, 20, 26, 30, 38, 44) on page 12; find that page here."""
    first = {16, 20, 26, 30, 38, 44}
    for idx in sorted(pages):
        nums = {int(x) for x in re.findall(r"\b(\d{2,3})\b", pages[idx].translate(DIGITS))}
        if idx <= 25 and len(nums & first) >= 5:
            return idx - 12
    raise SystemExit("table of contents not found")


def lesson_for(printed):
    for lid, a, b in LESSON_PAGES:
        if a <= printed <= b:
            return lid
    return None


def split_sentences(text):
    parts = re.split(r"(?<=[.!?؟。])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()]


def chunk_page(text):
    """Group a page's blocks under their nearest heading into ~TARGET_WORDS passages."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S).strip()
    if not text:
        return []
    blocks, heading = [], ""
    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        if not block:
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", block.split("\n")[0])
        if m:
            heading = m.group(2).strip()
            rest = "\n".join(block.split("\n")[1:]).strip()
            if not rest:
                blocks.append((heading, None))
                continue
            block = rest
        blocks.append((heading, block))
    chunks, cur, cur_head = [], [], ""
    for head, block in blocks:
        if block is None:
            if cur:
                chunks.append((cur_head, "\n\n".join(cur)))
                cur = []
            cur_head = head
            continue
        if cur and (head != cur_head or sum(len(b.split()) for b in cur) + len(block.split()) > TARGET_WORDS * 1.5):
            chunks.append((cur_head, "\n\n".join(cur)))
            cur = []
        cur_head = head
        cur.append(block)
    if cur:
        chunks.append((cur_head, "\n\n".join(cur)))
    return [(h, b) for h, b in chunks if len(re.sub(r"\W", "", b)) > 20]


def build(lang):
    pages = pages_of(lang)
    off = page_offset(pages)
    rows = []
    for idx, text in sorted(pages.items()):
        printed = idx - off
        if printed < 5:  # cover and front matter
            continue
        for n, (head, body) in enumerate(chunk_page(text), 1):
            if SKIP_HEADINGS.search(head or ""):
                continue
            refs = [f"{s}:{a}" for s, a in Q_MARK.findall(body)]
            cid = f"wajeez:{lang}:p{printed}:c{n}"
            rows.append({
                "id": cid, "lang": lang, "page": printed, "pdf_page": idx,
                "lesson_id": lesson_for(printed), "heading": head or "",
                "text": body, "sentences": split_sentences(body), "quran_refs": refs,
                "sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
            })
    (BUILD / lang).mkdir(parents=True, exist_ok=True)
    (BUILD / lang / "chunks.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")
    MANIFEST.mkdir(parents=True, exist_ok=True)
    (MANIFEST / f"{lang}.json").write_text(json.dumps({
        "lang": lang, "page_offset": off, "chunks": len(rows),
        "items": [{k: r[k] for k in ("id", "page", "lesson_id", "sha256")} for r in rows]}, indent=1))
    per_lesson = {}
    for r in rows:
        per_lesson[r["lesson_id"]] = per_lesson.get(r["lesson_id"], 0) + 1
    print(lang, "offset", off, "chunks", len(rows), "lessons", len([k for k in per_lesson if k]), flush=True)


if __name__ == "__main__":
    for lang in sys.argv[1:] or sorted(p.name for p in MD.iterdir() if p.is_dir()):
        build(lang)
