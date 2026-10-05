#!/usr/bin/env python3
"""Build the challenge presentation (Arabic, RTL) from the official template.

    python3 docs/deck/build_deck.py [path/to/template.pptx]

Every number shown on the slides lives in DATA below. To present different results (e.g. a new
evaluation run), edit DATA and run the command again: the deck is rebuilt from the untouched template.
Screenshots are read from docs/screenshots/ (real captures of https://shahada.theislam.chat at a
1280 px wide window, 2x pixel density) and cropped here.

Needs: Python 3.9+, lxml, Pillow. The PDF is exported separately (LibreOffice or PowerPoint):
    soffice --headless --convert-to pdf --outdir docs/deck docs/deck/theislam-chat-after-shahada.pptx
"""
import copy
import io
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from lxml import etree
from PIL import Image

# ---------------------------------------------------------------------------------------------
# DATA: every number on the slides. Swap these and rebuild.
# ---------------------------------------------------------------------------------------------
DATA = {
    # Platform export of 8 Sept 2026 (stats/db_stats.json, stats/post_shahada_stats.json)
    "platform": {
        "conversations": "16,653",
        "countries": "150",
        "shahada": "166",
        "ended_within_2": "89",
        "ended_within_2_pct": "54%",
        "left_contact": "11",
        "left_contact_pct": "6.6%",
        "came_back": "13",
        "asked_pray_wudu": "22",
        "export_date": "8 سبتمبر 2026",
    },
    # Evaluation (docs/evaluation.md)
    "results_label": "المجموعة المثبتة: 200 سؤال × 3 محاولات",
    "results_rows": [
        # (metric, with checker & router, same model without checker/router)
        ("الاقتباسات المطابقة لنص الكتاب", "100% (444/444)", "92.1% (760/825)"),
        ("الحالات الحرجة: لا حكم، مع عرض مرشد", "98.9% (89/90)", "81.1% (73/90)"),
        ("الحالات الحرجة: إحالة مباشرة إلى إنسان", "81.1% (73/90)", "81.1% (73/90)"),
        ("إيذاء النفس: رسالة الطوارئ أولاً", "100% (12/12)", "–"),
        ("ما ليس في الكتاب: امتناع أو إحالة", "91.1% (82/90)", "85.6% (77/90)"),
        ("أسئلة لها جواب رُفضت خطأً (الأقل أفضل)", "1.9% (7/360)", "4.2% (15/360)"),
        ("أسئلة لها جواب أُجيبت صحيحاً", "90.6% (326/360)", "90.6% (326/360)"),
        ("الجمل المسندة إلى الكتاب", "99.2%", "99.5%"),
        ("أجوبة مسندة بالكامل إلى مقاطعها", "96.8%", "99.0%"),
        ("مسائل الخلاف المعتبر عُرضت مع السعة", "86.7% (52/60)", "0% (0/60)"),
        ("الجواب مربوط بدرسه الصحيح", "95.2%", "–"),
    ],
    "results_missed": "لم نبلغه: الإحالة المباشرة للحالات الحرجة 81% مقابل هدف 100%؛ والبقية تلقّت «ليس في الكتاب» مع عرض مرشد، دون حكم. التقرير الكامل: docs/evaluation.md",
    "quotes_ours": "100%",
    "quotes_base": "92.1%",
    "journeys_total": "120",
    "journeys_order": "120/120",
    "journeys_strict": "111/120",
    "journeys_strict_pct": "92.5%",
    "journeys_by_page": "119/120",
    "latency_median_s": "8.3",
    "cost_per_question_usd": "0.0013",
    # Project facts
    "patch_lines": "181",
    "book_editions": "10",
    "book_languages": "ar · en · fr · es · id · pt · ru · bs · vi · th",
    "quranenc_languages": "أكثر من 20 لغة",
    "lessons": "19",
    "units": "4",
    "built_dates": "4–6 أكتوبر 2026",
    "metrics_from": "7 أكتوبر",
    "date": "6 أكتوبر 2026",
    "link": "shahada.theislam.chat",
    "repo": "github.com/MidadeAITeam/shahada-theislam",
}

# Team: names are filled in by the team lead (the roles are those of the idea file).
TEAM = [
    ("اسم العضو", "قائد الفريق", "العرض والتنسيق والتسليم"),
    ("اسم العضو", "مهندس الذكاء الاصطناعي", "الاسترجاع والتوليد المقيّد والفاحص والتقييم"),
    ("اسم العضو", "مطوّر الخلفية", "الخدمة والحساب والإحالة ولوحة المرشد"),
    ("اسم العضو", "مطوّر الواجهات", "الوحدة داخل واجهة theislam.chat"),
    ("اسم العضو", "المختص الشرعي", "مراجعة الدروس والحالات الحرجة والبلاغات"),
]

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs" / "screenshots"
OUT = ROOT / "docs" / "deck" / "theislam-chat-after-shahada.pptx"
DEFAULT_TEMPLATE = Path(
    "/Users/muhammad/midade/projects/presentations/تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي/final/"
    "LcXbkXRzH232sfKL8cAgJ1AI7jQATxu2bP0S4EWu.pptx"
)

# Crop boxes in screenshot pixels (2560x1600 captures): the chat column without the page chrome.
# Right-hand 1000 px of the RTL chat column, so the text stays legible on a slide.
SCREENS = {
    "start": ("01-start-card.png", (300, 280, 1640, 1620)),
    "lesson": ("02-shahada-lesson-source.png", (0, 40, 1500, 1540)),
    "wudu": ("03-wudu-steps-exercises.png", (680, 100, 2000, 1420)),
    "answer": ("04-answer-with-sources.png", (1240, 180, 2560, 1500)),
    "refusal": ("05-not-in-book.png", (0, 280, 1320, 1600)),
    "dialog": ("06-referral-dialog.png", (630, 130, 1930, 1430)),
}

# Colours of the challenge identity
NAVY, VIOLET, TURQ, LIGHT = "12183F", "6150EA", "2EF2C2", "F2F4FF"
SOFT, MUTED, CARD_LINE = "CBCFE6", "8E99CC", "323D68"
L_TEXT, L_MUTED, L_LINE, L_CARD = "12183F", "4A5590", "E0D9FB", "FFFFFF"

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
NSDECL = 'xmlns:a="%s" xmlns:p="%s" xmlns:r="%s"' % (NS["a"], NS["p"], NS["r"])
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"
CT_NOTES = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"
EMU = 9525  # template canvas is 1920 x 1080 px


def E(v):
    return int(round(v * EMU))


# ---------------------------------------------------------------------------------------------
# DrawingML builders (strings, parsed when inserted)
# ---------------------------------------------------------------------------------------------
FONT = "Readex Pro"


NUM = re.compile(r"[$]?\d[\d.,/:×]*%?[$]?")


def bidi(text):
    """Keep numbers like 92.1%, 111/120 or 0.0013$ in their written order inside Arabic text."""
    return NUM.sub(lambda m: "\u200e" + m.group(0) + "\u200e", text)


def run(text, sz, color, b=False, font=FONT):
    text = bidi(text)
    return (
        f'<a:r><a:rPr lang="ar-SA" sz="{int(sz * 100)}" b="{1 if b else 0}" dirty="0">'
        f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
        f'<a:latin typeface="{font}"/><a:ea typeface="{font}"/><a:cs typeface="{font}"/><a:sym typeface="{font}"/>'
        f"</a:rPr><a:t>{escape(text)}</a:t></a:r>"
    )


def para(runs, algn="r", rtl=True, before=0, after=0, ln=100, bullet=False):
    if isinstance(runs, str):
        runs = [runs]
    bu = (
        '<a:buClr><a:srgbClr val="%s"/></a:buClr><a:buSzPct val="100000"/><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>' % TURQ
        if bullet
        else "<a:buNone/>"
    )
    mar = 'marL="342900" indent="-342900"' if bullet else 'marL="0" indent="0"'
    return (
        f'<a:p><a:pPr {mar} rtl="{1 if rtl else 0}" algn="{algn}">'
        f'<a:lnSpc><a:spcPct val="{ln * 1000}"/></a:lnSpc>'
        f'<a:spcBef><a:spcPts val="{int(before * 100)}"/></a:spcBef><a:spcAft><a:spcPts val="{int(after * 100)}"/></a:spcAft>'
        f"{bu}</a:pPr>{''.join(runs)}</a:p>"
    )


def fill_xml(color, alpha=None):
    if color is None:
        return "<a:noFill/>"
    a = f'<a:alpha val="{int(alpha * 1000)}"/>' if alpha is not None else ""
    return f'<a:solidFill><a:srgbClr val="{color}">{a}</a:srgbClr></a:solidFill>'


def line_xml(color, alpha=None, w=1.0):
    if color is None:
        return "<a:ln><a:noFill/></a:ln>"
    return f'<a:ln w="{E(w)}">{fill_xml(color, alpha)}</a:ln>'


class Ids:
    def __init__(self, start=3000):
        self.n = start

    def __call__(self):
        self.n += 1
        return self.n


def shape(sid, x, y, w, h, paras=None, fill=None, alpha=None, line=None, line_alpha=None, line_w=1.0,
          geom="rect", adj=None, anchor="t", inset=0, name=None):
    av = f'<a:gd name="adj" fmla="val {adj}"/>' if adj is not None else ""
    ins = E(inset)
    tx = ""
    if paras is not None:
        tx = (
            f'<p:txBody><a:bodyPr wrap="square" lIns="{ins}" tIns="{ins}" rIns="{ins}" bIns="{ins}" anchor="{anchor}" rtlCol="1">'
            f"<a:noAutofit/></a:bodyPr><a:lstStyle/>{''.join(paras)}</p:txBody>"
        )
    tb = ' txBox="1"' if paras is not None and fill is None and line is None else ""
    return (
        f'<p:sp {NSDECL}><p:nvSpPr><p:cNvPr id="{sid}" name="{escape(name or f"deck {sid}")}"/><p:cNvSpPr{tb}/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{E(x)}" y="{E(y)}"/><a:ext cx="{E(w)}" cy="{E(h)}"/></a:xfrm>'
        f'<a:prstGeom prst="{geom}"><a:avLst>{av}</a:avLst></a:prstGeom>{fill_xml(fill, alpha)}{line_xml(line, line_alpha, line_w)}</p:spPr>'
        f"{tx}</p:sp>"
    )


def picture(sid, rid, x, y, w, h, line=None, adj=2500, name=None, descr=""):
    return (
        f'<p:pic {NSDECL}><p:nvPicPr><p:cNvPr id="{sid}" name="{escape(name or f"picture {sid}")}" descr="{escape(descr)}"/>'
        f'<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
        f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        f'<p:spPr><a:xfrm><a:off x="{E(x)}" y="{E(y)}"/><a:ext cx="{E(w)}" cy="{E(h)}"/></a:xfrm>'
        f'<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val {adj}"/></a:avLst></a:prstGeom>'
        f"{line_xml(line, None, 2) if line else '<a:ln><a:noFill/></a:ln>'}</p:spPr></p:pic>"
    )


def table(sid, x, y, colw, rows, rowh, name="table"):
    """rows: list of rows; a row is a list of cells (cell = dict(paras=[...], fill=hex, anchor)).
    Columns are given right-to-left (tblPr rtl)."""
    grid = "".join(f'<a:gridCol w="{E(c)}"/>' for c in colw)
    body = []
    for ri, row in enumerate(rows):
        h = rowh[ri] if isinstance(rowh, list) else rowh
        cells = []
        for c in row:
            bd = "".join(
                f'<a:{s} w="{E(1)}"><a:solidFill><a:srgbClr val="{c.get("line", CARD_LINE)}"/></a:solidFill></a:{s}>'
                for s in ("lnL", "lnR", "lnT", "lnB")
            )
            cells.append(
                f'<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>{"".join(c["paras"])}</a:txBody>'
                f'<a:tcPr marL="{E(14)}" marR="{E(14)}" marT="{E(6)}" marB="{E(6)}" anchor="{c.get("anchor", "ctr")}">'
                f"{bd}{fill_xml(c.get('fill'))}</a:tcPr></a:tc>"
            )
        body.append(f'<a:tr h="{E(h)}">{"".join(cells)}</a:tr>')
    total_w = sum(colw)
    total_h = sum(rowh) if isinstance(rowh, list) else rowh * len(rows)
    return (
        f'<p:graphicFrame {NSDECL}><p:nvGraphicFramePr><p:cNvPr id="{sid}" name="{name}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>'
        f'<p:xfrm><a:off x="{E(x)}" y="{E(y)}"/><a:ext cx="{E(total_w)}" cy="{E(total_h)}"/></p:xfrm>'
        f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr rtl="1" firstRow="1" bandRow="0"/>'
        f'<a:tblGrid>{grid}</a:tblGrid>{"".join(body)}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>'
    )


# ---------------------------------------------------------------------------------------------
# Slide editing context
# ---------------------------------------------------------------------------------------------
class Slide:
    def __init__(self, deck, src):
        self.deck = deck
        self.src = src
        self.xml = etree.fromstring(deck.parts[f"ppt/slides/slide{src}.xml"])
        self.rels = etree.fromstring(deck.parts[f"ppt/slides/_rels/slide{src}.xml.rels"])
        self.tree = self.xml.find(".//p:cSld/p:spTree", NS)
        self.ids = Ids()
        self.notes = ""

    # -- shapes in the template slide
    def find(self, sid):
        for el in self.tree:
            c = el.find(".//p:cNvPr", NS)
            if c is not None and c.get("id") == str(sid):
                return el
        raise KeyError(f"shape {sid} not in template slide {self.src}")

    def drop(self, *sids):
        for s in sids:
            el = self.find(s)
            el.getparent().remove(el)

    def text(self, sid, lines, color=None, size=None, bold=None):
        """Replace the text of a template shape, keeping its paragraph and run formatting.
        lines: list of strings (one paragraph each) or of lists of (text, overrides) runs."""
        el = self.find(sid)
        body = el.find(".//p:txBody", NS)
        ps = body.findall("a:p", NS)
        proto = ps[0]
        for p_ in ps:
            body.remove(p_)
        for line in lines:
            p_ = copy.deepcopy(proto)
            runs = p_.findall("a:r", NS)
            rproto = runs[0] if runs else None
            for r_ in p_.findall("a:r", NS) + p_.findall("a:fld", NS) + p_.findall("a:br", NS):
                p_.remove(r_)
            end = p_.find("a:endParaRPr", NS)
            segs = line if isinstance(line, list) else [(line, {})]
            for txt, ov in segs:
                r_ = copy.deepcopy(rproto) if rproto is not None else etree.fromstring(f'<a:r {NSDECL}><a:rPr lang="ar-SA"/><a:t/></a:r>')
                rpr = r_.find("a:rPr", NS)
                if size or ov.get("size"):
                    rpr.set("sz", str(int((ov.get("size") or size) * 100)))
                if bold is not None or "bold" in ov:
                    rpr.set("b", "1" if ov.get("bold", bold) else "0")
                col = ov.get("color") or color
                if col:
                    sf = rpr.find("a:solidFill", NS)
                    if sf is not None:
                        rpr.remove(sf)
                    rpr.insert(0, etree.fromstring(f'<a:solidFill {NSDECL}><a:srgbClr val="{col}"/></a:solidFill>'))
                r_.find("a:t", NS).text = bidi(txt)
                if end is not None:
                    end.addprevious(r_)
                else:
                    p_.append(r_)
            body.append(p_)

    def move(self, sid, x, y, w, h):
        el = self.find(sid)
        el.find(".//a:off", NS).set("x", str(E(x)))
        el.find(".//a:off", NS).set("y", str(E(y)))
        el.find(".//a:ext", NS).set("cx", str(E(w)))
        el.find(".//a:ext", NS).set("cy", str(E(h)))

    def add(self, xml):
        self.tree.append(etree.fromstring(xml))

    def add_rel(self, rtype, target):
        existing = {r.get("Id") for r in self.rels}
        n = 100
        while f"rId{n}" in existing:
            n += 1
        rid = f"rId{n}"
        el = etree.SubElement(self.rels, f"{{{REL_NS}}}Relationship")
        el.set("Id", rid)
        el.set("Type", RT + rtype)
        el.set("Target", target)
        return rid

    def image(self, png_bytes):
        name = self.deck.add_media(png_bytes)
        return self.add_rel("image", f"../media/{name}")

    def template_image(self, media_name):
        return self.add_rel("image", f"../media/{media_name}")

    def rel_of(self, sid):
        el = self.find(sid)
        return el.find(".//a:blip", NS).get(f"{{{NS['r']}}}embed")


class Deck:
    def __init__(self, template):
        with zipfile.ZipFile(template) as z:
            self.parts = {n: z.read(n) for n in z.namelist()}
        self.media_n = 0
        self.slides = []

    def add_media(self, data):
        self.media_n += 1
        name = f"deck{self.media_n}.png"
        self.parts[f"ppt/media/{name}"] = data
        return name

    def slide(self, src):
        s = Slide(self, src)
        self.slides.append(s)
        return s

    def save(self, out):
        parts = dict(self.parts)
        old_slides = [n for n in parts if re.match(r"ppt/(slides|notesSlides)/(_rels/)?(slide|notesSlide)\d+\.xml(\.rels)?$", n)]
        for n in old_slides:
            del parts[n]
        # presentation.xml + rels
        pres = etree.fromstring(parts["ppt/presentation.xml"])
        prels = etree.fromstring(parts["ppt/_rels/presentation.xml.rels"])
        for r_ in list(prels):
            if r_.get("Type") == RT + "slide":
                prels.remove(r_)
        lst = pres.find("p:sldIdLst", NS)
        for c in list(lst):
            lst.remove(c)
        ct = etree.fromstring(parts["[Content_Types].xml"])
        for o in list(ct):
            pn = o.get("PartName") or ""
            if pn.startswith("/ppt/slides/") or pn.startswith("/ppt/notesSlides/"):
                ct.remove(o)
        CTNS = "http://schemas.openxmlformats.org/package/2006/content-types"
        for k, s in enumerate(self.slides, 1):
            # notes: the template's notes part for this layout, with our speaker notes
            for r_ in s.rels:
                if r_.get("Type") == RT + "notesSlide":
                    r_.set("Target", f"../notesSlides/notesSlide{k}.xml")
            notes = etree.fromstring(self.parts[f"ppt/notesSlides/notesSlide{s.src}.xml"])
            for sp in notes.iter(f"{{{NS['p']}}}sp"):
                ph = sp.find(".//p:ph", NS)
                if ph is not None and ph.get("type") == "body":
                    body = sp.find("p:txBody", NS)
                    for p_ in body.findall("a:p", NS):
                        body.remove(p_)
                    for line in (s.notes or " ").split("\n"):
                        body.append(etree.fromstring(f'<a:p {NSDECL}><a:pPr rtl="1" algn="r"/><a:r><a:rPr lang="ar-SA" sz="1200"/><a:t>{escape(line)}</a:t></a:r></a:p>'))
            parts[f"ppt/notesSlides/notesSlide{k}.xml"] = etree.tostring(notes, xml_declaration=True, encoding="UTF-8", standalone=True)
            parts[f"ppt/notesSlides/_rels/notesSlide{k}.xml.rels"] = self.parts[f"ppt/notesSlides/_rels/notesSlide{s.src}.xml.rels"]
            parts[f"ppt/slides/slide{k}.xml"] = etree.tostring(s.xml, xml_declaration=True, encoding="UTF-8", standalone=True)
            parts[f"ppt/slides/_rels/slide{k}.xml.rels"] = etree.tostring(s.rels, xml_declaration=True, encoding="UTF-8", standalone=True)
            rid = f"rIdDeck{k}"
            rel = etree.SubElement(prels, f"{{{REL_NS}}}Relationship")
            rel.set("Id", rid)
            rel.set("Type", RT + "slide")
            rel.set("Target", f"slides/slide{k}.xml")
            sid = etree.SubElement(lst, f"{{{NS['p']}}}sldId")
            sid.set("id", str(255 + k))
            sid.set(f"{{{NS['r']}}}id", rid)
            for pn, ctype in ((f"/ppt/slides/slide{k}.xml", CT_SLIDE), (f"/ppt/notesSlides/notesSlide{k}.xml", CT_NOTES)):
                o = etree.SubElement(ct, f"{{{CTNS}}}Override")
                o.set("ContentType", ctype)
                o.set("PartName", pn)
        parts["ppt/presentation.xml"] = etree.tostring(pres, xml_declaration=True, encoding="UTF-8", standalone=True)
        parts["ppt/_rels/presentation.xml.rels"] = etree.tostring(prels, xml_declaration=True, encoding="UTF-8", standalone=True)
        parts["[Content_Types].xml"] = etree.tostring(ct, xml_declaration=True, encoding="UTF-8", standalone=True)
        # drop media no longer referenced by any part
        used = set()
        for n, data in parts.items():
            if n.endswith(".rels"):
                base = n.replace("_rels/", "").rsplit(".rels", 1)[0]
                folder = base.rsplit("/", 1)[0] if "/" in base else ""
                for r_ in etree.fromstring(data):
                    t = r_.get("Target")
                    if r_.get("TargetMode") == "External" or t is None:
                        continue
                    path = (Path(folder) / t).as_posix() if not t.startswith("/") else t[1:]
                    parts_norm = []
                    for seg in path.split("/"):
                        if seg == "..":
                            parts_norm.pop()
                        elif seg not in (".", ""):
                            parts_norm.append(seg)
                    used.add("/".join(parts_norm))
        for n in [n for n in parts if n.startswith("ppt/media/") and n not in used]:
            del parts[n]
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", parts.pop("[Content_Types].xml"))
            for n, data in parts.items():
                z.writestr(n, data)


def screenshot(key, width_px):
    fname, box = SCREENS[key]
    im = Image.open(SHOTS / fname).convert("RGB").crop(box)
    w = int(width_px * 2)  # 2x the frame width in canvas px is plenty for projection
    im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue(), box


# ---------------------------------------------------------------------------------------------
# Reusable compositions
# ---------------------------------------------------------------------------------------------
def dark_card(s, x, y, w, h, paras, inset=22, anchor="t"):
    s.add(shape(s.ids(), x, y, w, h, paras, fill="FFFFFF", alpha=4, line=TURQ, line_alpha=18, line_w=1,
                geom="roundRect", adj=6000, inset=inset, anchor=anchor))


def light_card(s, x, y, w, h, paras, inset=24, anchor="t"):
    s.add(shape(s.ids(), x, y, w, h, paras, fill=L_CARD, line=L_LINE, line_w=1.5, geom="roundRect", adj=6000,
                inset=inset, anchor=anchor))


def callout(s, x, y, w, h, text_runs, dark=True):
    if dark:
        s.add(shape(s.ids(), x, y, w, h, [para(text_runs, ln=110)], fill=VIOLET, alpha=28, line=VIOLET, line_alpha=70,
                    geom="roundRect", adj=18000, inset=18, anchor="ctr"))
    else:
        s.add(shape(s.ids(), x, y, w, h, [para(text_runs, ln=110)], fill=VIOLET, alpha=10, line=VIOLET, line_alpha=40,
                    geom="roundRect", adj=18000, inset=18, anchor="ctr"))


def header(s, label_id, title_id, sub_id, label, title, sub, light=False):
    s.text(label_id, [label])
    s.text(title_id, [title])
    if sub_id:
        s.text(sub_id, [sub])


def arrow_left(s, x, y, w=26, h=26, color=TURQ):
    s.add(shape(s.ids(), x, y, w, h, None, fill=color, alpha=85, geom="leftArrow"))


# ---------------------------------------------------------------------------------------------
# Slides
# ---------------------------------------------------------------------------------------------
def build(template):
    D, P = DATA, DATA["platform"]
    deck = Deck(template)

    # 1 Cover ------------------------------------------------------------------------------------
    s = deck.slide(8)
    s.move(486, 818, 330, 950, 200)
    s.text(486, [[("theislam.chat", {"color": TURQ})], "ما بعد الشهادة"], size=54)
    s.drop(487)
    s.add(shape(s.ids(), 818, 545, 950, 200, [
        para(run("رحلة تعليمية تبدأ لحظة إسلام المستخدم، في المحادثة نفسها وبلغته: دروس من كتاب «الوجيز»، وجواب موثّق بالصفحة، وإنسان عند الحاجة.", 22, LIGHT), ln=125),
        para(run(D["link"], 22, TURQ, True), before=14),
    ]))
    s.move(489, 1166, 957, 600, 36)
    s.text(489, ["جمعية أصول · المسار 03"])
    s.text(490, [D["date"]])
    s.notes = ("(15 ث) نحن جمعية أصول، صاحبة منصة theislam.chat للحوار مع غير المسلمين. "
               "مشروعنا: ما بعد الشهادة. الرابط يعمل الآن ويبدأ من لحظة الشهادة مباشرة.")

    # 2 Problem ----------------------------------------------------------------------------------
    s = deck.slide(15)
    header(s, 604, 605, 606, "المشكلة", "الرحلة تنقطع عند الشهادة",
           f"من تصدير قاعدة بيانات المنصة في {P['export_date']} · أعداد مجمّعة دون نص أي محادثة")
    kpis = [
        (608, 609, 610, P["conversations"], "محادثة على المنصة", f"من {P['countries']} دولة"),
        (611, 612, 613, P["shahada"], "أعلنوا إسلامهم في المحادثة", "تهنئة، ثم طلب وسيلة تواصل"),
        (614, 615, 616, P["ended_within_2"], "انتهت خلال رسالتين", f"{P['ended_within_2_pct']} من {P['shahada']} بعد الشهادة"),
        (617, 618, 619, P["left_contact"], "فقط تركوا وسيلة تواصل", f"{P['left_contact_pct']} من {P['shahada']}"),
    ]
    for v, n, u, val, name, unit in kpis:
        s.text(v, [val])
        s.text(n, [name])
        s.text(u, [unit])
    s.drop(620)
    callout(s, 148, 880, 1620, 76, [
        run(P["asked_pray_wudu"], 24, TURQ, True),
        run(" سألوا: كيف أتوضأ؟ كيف أصلي؟ ماذا أفعل الآن؟ والمنصة ممنوعة عمداً من تعليم العبادة من ذاكرة النموذج.", 20, LIGHT),
    ])
    s.notes = (f"(25 ث) {P['conversations']} محادثة، و{P['shahada']} شخصاً أعلنوا إسلامهم. "
               f"{P['ended_within_2']} محادثة انتهت خلال رسالتين، و{P['left_contact']} فقط تركوا وسيلة تواصل. "
               f"و{P['asked_pray_wudu']} سألوا كيف يتوضؤون أو يصلون، ولا تملك المنصة جواباً موثّقاً لهم.")

    # 3 Beneficiary & current practice (light) ---------------------------------------------------
    s = deck.slide(20)
    dump = {}
    for el in s.tree:
        c = el.find(".//p:cNvPr", NS)
        ph = el.find(".//p:ph", NS)
        if c is not None and ph is not None:
            dump[(ph.get("type"), ph.get("idx"))] = int(c.get("id"))
    s.text(dump[("body", "1")], ["المستفيد والممارسة الحالية"])
    s.text(dump[("title", None)], ["مسلم جديد يحتاج جواباً الآن"])
    s.text(dump[("body", "2")], ["شخص أعلن إسلامه للتو داخل theislam.chat، بلغته، وقد لا يكون حوله مسلمون"])
    for key, sid in dump.items():
        if key[0] == "body" and key[1] not in ("1", "2"):
            s.drop(sid)
    cards = [
        ("المستفيد", "في لحظة حساسة، يكتب بلغته من أي بلد، ويسأل فوراً: ماذا أفعل الآن؟ كيف أتوضأ؟ كيف أصلي؟ كيف أقرأ الفاتحة؟"),
        ("الممارسة الحالية", "تهنئة بسطر أو سطرين، ثم طلب وسيلة تواصل لمتابعة بشرية لاحقة. لا مسار تعليمي داخل المحادثة، وتعليم الوضوء والصلاة من ذاكرة النموذج ممنوع عمداً."),
        ("ما يحدث بعدها", f"من لم يترك وسيلة تواصل انقطعت رحلته: {P['left_contact']} فقط من {P['shahada']} تركوا وسيلة تواصل، و{P['came_back']} عادوا في يوم لاحق. وملف PDF أو روبوت عام لا يضمن مصدراً ولا استمراراً."),
    ]
    w, gap = 513, 40
    for i, (h, body) in enumerate(cards):
        x = 1768 - w - i * (w + gap)
        light_card(s, x, 410, w, 400, [
            para(run(f"0{i + 1}", 30, VIOLET, True)),
            para(run(h, 26, L_TEXT, True), before=8),
            para(run(body, 19, L_MUTED), before=14, ln=125),
        ], inset=30)
    callout(s, 148, 850, 1620, 76, [run("الهدف: ", 21, VIOLET, True),
                                     run("أن تكون الشهادة بداية رحلة تعليم موثّقة ومستمرة في المكان نفسه، لا نهاية المحادثة.", 21, L_TEXT)], dark=False)
    s.notes = "(15 ث) المستفيد مسلم جديد في لحظة حساسة. الممارسة الحالية تهنئة ثم طلب رقم هاتف، ومن لا يترك رقمه تنقطع رحلته."

    # 4 Solution: six-step journey ----------------------------------------------------------------
    s = deck.slide(24)
    header(s, 818, 819, 820, "الحل", "المحادثة نفسها تصبح الفصل الدراسي",
           "ست خطوات من لحظة الشهادة، كلها من كتاب «الوجيز» (مركز أصول) وبلغة المستخدم")
    s.drop(822, 823, 824, 825)
    steps = [
        ("الشهادة", "مع التهنئة يرسل البوت إشارة خفية، فتفتح الوحدة تحت الرسالة نفسها."),
        ("بطاقة البداية", "اللغة والديانة السابقة والبلد وما سأل عنه، كل حقل بجملة المستخدم نفسها. لا يُحفظ شيء قبل موافقته."),
        ("الدرس الأول", "معنى الشهادتين. كل جملة برقم يفتح نص الكتاب وصفحته."),
        ("ماذا أتعلم أولاً؟", "الوضوء أو الصلاة أو الفاتحة أو «لا أعرف». الكود يرتّب المسار بقواعد ثابتة."),
        ("دروس وأسئلة حرة", "درس في اليوم بتذكير بالبريد، وسؤال في أي وقت يُجاب من الكتاب وحده."),
        ("مرشد أو مرشدة", "للفتوى الشخصية أو الأزمة أو الحاجة العملية، ببطاقة يراها ويوافق عليها."),
    ]
    w, gap = 250, 24
    for i, (h, body) in enumerate(steps):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 455, [
            para(run(f"0{i + 1}", 34, TURQ, True)),
            para(run(h, 22, LIGHT, True), before=10, ln=105),
            para(run(body, 18, SOFT), before=12, ln=125),
        ], inset=20)
        if i < 5:
            arrow_left(s, x - gap + 1, 610, w=22, h=24)
    callout(s, 148, 880, 1620, 76, [run("أُضيف أيضاً: ", 19, TURQ, True),
                                     run("مراحل الجواب الحية أثناء الانتظار · «استمع وردّد» بالمصحف المعلّم (المنشاوي) · تمارين تفاعلية من أسئلة الكتاب", 19, LIGHT)])
    s.notes = "(30 ث) ست خطوات: الشهادة، بطاقة البداية، الدرس الأول، ماذا أتعلم أولاً، دروس وأسئلة حرة، ثم إنسان عند الحاجة. كلها في المحادثة نفسها."

    # 5 Screenshots: start → lesson → wudu --------------------------------------------------------
    def gallery(s, items, note):
        w, gap = 520, 30
        s.add(shape(s.ids(), 148, 292, 1620, 40, [para(run(note, 17, SOFT))]))
        for i, (key, cap) in enumerate(items):
            x = 1768 - w - i * (w + gap)
            png, box = screenshot(key, w)
            h = w * (box[3] - box[1]) / (box[2] - box[0])
            rid = s.image(png)
            s.add(picture(s.ids(), rid, x, 345, w, h, line=TURQ, name=f"screenshot {key}", descr=cap))
            s.add(shape(s.ids(), x, 345 + h + 14, w, 90, [para(run(cap, 17.5, SOFT), ln=118)]))

    s = deck.slide(26)
    s.text(843, ["من الواجهة"])
    s.text(844, ["لقطات حقيقية من النسخة العاملة (1)"])
    s.drop(846, 847, 848, 849, 851, 852)
    gallery(s, [
        ("start", "بطاقة البداية: كل حقل بجملة المستخدم نفسها، قابل للتعديل والحذف، ولا يُحفظ قبل «متابعة»"),
        ("lesson", "درس معنى الشهادتين: الرقم يفتح نص «الوجيز» وصفحته في لوحة جانبية"),
        ("wudu", "الوضوء: الخطوات بلفظ الكتاب وترتيبه، ثم تمارين من أسئلة الكتاب"),
    ], f"{D['link']}/ar?demo=shahada · لقطات من نافذة بعرض 1280 بكسل")
    s.notes = "(20 ث) بطاقة البداية بما قاله المستخدم حرفياً، ثم الدرس الأول وكل جملة مربوطة بصفحتها، ثم خطوات الوضوء كما في الكتاب."

    # 6 Screenshots: answer, refusal, referral ----------------------------------------------------
    s = deck.slide(26)
    s.text(843, ["من الواجهة"])
    s.text(844, ["لقطات حقيقية من النسخة العاملة (2)"])
    s.drop(846, 847, 848, 849, 851, 852)
    gallery(s, [
        ("answer", "سؤال بالإنجليزية: خطوات الصلاة من الكتاب حرفياً بأرقام مصادرها"),
        ("refusal", "ليس في الكتاب: امتناع صريح وزر «تحدث إلى إنسان»، لا جواب من ذاكرة النموذج"),
        ("dialog", "الإحالة: يختار مرشداً أو مرشدة، ويرى كل ما سيُرسل قبل أن يوافق"),
    ], "الأسئلة: «Can I pray if I don't know Arabic yet?» · «ما رأيك في العملات الرقمية؟» · «زوجتي مسيحية، هل زواجي صحيح بعد إسلامي؟»")
    s.notes = "(20 ث) سؤال من الكتاب يُجاب بمصادره. سؤال خارج الكتاب يُرفض بوضوح. وسؤال عن حالة شخصية يذهب إلى إنسان بموافقة المستخدم."

    # 7 How it works ------------------------------------------------------------------------------
    s = deck.slide(24)
    header(s, 818, 819, 820, "آلية العمل والذكاء الاصطناعي", "كيف يُصنع الجواب؟ خمس مراحل يحرسها الكود",
           "النموذج يشرح فقط؛ النصوص المقتبسة والآيات يدرجها الكود من مصادرها")
    s.drop(822, 823, 824, 825)
    stages = [
        ("الموجّه", "إشارتان مستقلتان: قائمة ثابتة لعبارات الأزمة بعدة لغات، وتصنيف النموذج: منهج، خارج الكتاب، فتوى شخصية، أزمة، حاجة عملية، خلاف معتبر، غير متأكد. أيّهما أحال، أُحيل.", "gemini-3.5-flash-lite"),
        ("الاسترجاع الهجين", "بحث نصي ودلالي معاً في مقاطع «الوجيز»، مع ترجمة السؤال عند الحاجة. إن لم يبلغ مقطع حد الصلة: «ليس في الكتاب».", "BM25 + gemini-embedding-2"),
        ("التوليد المقيّد", "يكتب النموذج الجواب بلغة المستخدم، وبعد كل جملة معرّف المقطع الذي يسندها، ولا يكتب اقتباساً ولا آية.", "gemini-3.8-flash"),
        ("الفاحص (كود)", "يحذف كل جملة بلا مقطع مسترجَع، ويطابق كل اقتباس بنص الكتاب، ويدرج الآيات من Tanzil. إن حُذف أكثر من الثلث أعاد التوليد مرة، ثم يعتذر ويعرض مرشداً.", "قواعد ثابتة، دون نموذج"),
        ("العرض", "الجواب بمصادره القابلة للنقر، ورابط درسه، ومراحل حية أثناء الانتظار، وزر «أبلغ عن خطأ».", "داخل واجهة theislam.chat"),
    ]
    w, gap = 300, 30
    for i, (h, body, tech) in enumerate(stages):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 465, [
            para([run(f"0{i + 1} ", 26, TURQ, True), run(h, 23, LIGHT, True)]),
            para(run(body, 16.5, SOFT), before=12, ln=122),
        ], inset=20)
        s.add(shape(s.ids(), x + 10, 806, w - 20, 40, [para(run(tech, 13, TURQ), algn="ctr", rtl=True)],
                    fill=TURQ, alpha=10, geom="roundRect", adj=50000, anchor="ctr"))
        if i < 4:
            arrow_left(s, x - gap + 2, 615, w=26, h=26)
    callout(s, 148, 885, 1620, 72, [run("مبدأ حاسم: ", 20, TURQ, True),
                                     run("النموذج لا يكتب اقتباساً ولا آية؛ يخرج معرّف المقطع، والكود يدرج النص الأصلي ويتحقق من مطابقته.", 20, LIGHT)])
    s.notes = ("(35 ث) الموجّه يقرر: يُجاب أم يُحال. الاسترجاع الهجين يجد المقاطع. النموذج يكتب الجواب ويسند كل جملة إلى مقطع. "
               "الفاحص كود لا نموذج: يحذف ما لا سند له ويدرج الاقتباسات والآيات من مصادرها. لا تظهر جملة قبل اجتياز الفاحص.")

    # 8 Reliability: four content levels -----------------------------------------------------------
    s = deck.slide(17)
    header(s, 639, 640, 641, "الموثوقية الشرعية", "أربعة مستويات للمحتوى، ولكل مستوى سلوك ثابت",
           "مستويات الحزمة العلمية للتحدي، مطبّقة في الموجّه والفاحص والنصوص الثابتة")
    s.drop(643)
    hdr = lambda t: {"paras": [para(run(t, 19, TURQ, True))], "fill": "242759"}
    cell = lambda t, c=SOFT, b=False, sz=17: {"paras": [para(run(t, sz, c, b), ln=115)], "fill": "161D48"}
    rows = [
        [hdr("المستوى"), hdr("ما يفعله النظام"), hdr("مثال")],
        [cell("الثوابت وصفة العبادة", LIGHT, True, 19), cell("نص الكتاب: الخطوات بلفظ «الوجيز» وترتيبه دون اختصار، والآية من Tanzil وترجمة معانيها من QuranEnc."), cell("خطوات الوضوء والصلاة")],
        [cell("مسائل الخلاف المعتبر", LIGHT, True, 19), cell("قول «الوجيز» ثم ملاحظة ثابتة: قول معتبر عند أهل العلم، ولبعضهم قول آخر، وما تراه في مسجدك قد يكون صحيحاً أيضاً."), cell("صفة في الصلاة تختلف عما يراه في مسجده")],
        [cell("ما ليس في الكتاب", LIGHT, True, 19), cell("امتناع صريح: «لم أجد جواب هذا السؤال في الوجيز» مع زر «تحدث إلى إنسان». لا جواب من ذاكرة النموذج."), cell("أنصبة الميراث")],
        [cell("فتوى شخصية أو أزمة", LIGHT, True, 19), cell("لا يولَّد حكم؛ إحالة إلى مرشد أو مرشدة. عند إيذاء النفس يظهر رقم الطوارئ في بلده أولاً (988 في أمريكا)."), cell("«زوجتي مسيحية، هل زواجنا صحيح؟»")],
    ]
    s.add(table(s.ids(), 148, 400, [400, 880, 340], rows, [58, 112, 112, 112, 112], name="content levels"))
    s.text(644, ["وكل درس وجواب عليه «أبلغ عن خطأ»، والدروس التي لم يعتمدها المختص تُعرض بنص الكتاب وصفحته فقط."])
    s.notes = "(25 ث) الثوابت تُعرض بنص الكتاب، والخلاف بقول الكتاب مع سعة، وما ليس في الكتاب امتناع وإحالة، والفتوى الشخصية والأزمة إلى إنسان، والطوارئ أولاً."

    # 9 Results (light table) ----------------------------------------------------------------------
    s = deck.slide(21)
    header(s, 732, 733, 734, "النتائج", "النتائج على أسئلة ثُبّتت ببصمة قبل البناء",
           f"{D['results_label']} · مقارنة بالنموذج نفسه والمقاطع نفسها، بلا فاحص ولا موجّه")
    s.drop(731, 735)
    lh = lambda t: {"paras": [para(run(t, 16, "FFFFFF", True), algn="ctr")], "fill": VIOLET, "line": L_LINE}
    rows = [[{"paras": [para(run("المقياس", 16, "FFFFFF", True))], "fill": VIOLET, "line": L_LINE},
             lh("مع الفاحص والموجّه"), lh("النموذج نفسه بلا فاحص ولا موجّه")]]
    for i, (m, a, b) in enumerate(D["results_rows"]):
        bg = "FAF9FF" if i % 2 else "FFFFFF"
        rows.append([
            {"paras": [para(run(m, 15.5, L_TEXT))], "fill": bg, "line": L_LINE},
            {"paras": [para(run(a, 16, VIOLET, True), algn="ctr", rtl=False)], "fill": bg, "line": L_LINE},
            {"paras": [para(run(b, 15.5, L_MUTED), algn="ctr", rtl=False)], "fill": bg, "line": L_LINE},
        ])
    s.add(table(s.ids(), 628, 385, [540, 290, 310], rows, [46] + [38] * len(D["results_rows"]), name="results"))
    tiles = [
        (D["journeys_order"], f"ترتيب الدروس صحيح في كل الرحلات المحاكاة: 30 مستخدماً يعودون في 4 أيام"),
        (D["journeys_strict"], f"رحلات صحيحة بالمرجع المثبّت، أي {D['journeys_strict_pct']}؛ وتصبح {D['journeys_by_page']} حين يُربط السؤال بالدرس الذي في صفحاته الجواب"),
        (f"{D['latency_median_s']} ث", f"الوسيط لزمن الجواب؛ ومتوسط التكلفة {D['cost_per_question_usd']}$ للسؤال"),
    ]
    for i, (v, t) in enumerate(tiles):
        light_card(s, 148, 385 + i * 160, 440, 145, [
            para(run(v, 30, VIOLET, True), rtl=True),
            para(run(t, 14.5, L_MUTED), before=4, ln=115),
        ], inset=18, anchor="ctr")
    callout(s, 148, 880, 1620, 80, [run(D["results_missed"], 16.5, L_TEXT)], dark=False)
    s.notes = (f"(35 ث) على {D['results_label']}: الاقتباسات مطابقة {D['quotes_ours']} مقابل {D['quotes_base']} بلا فاحص. "
               "الحالات الحرجة: لم يُعطَ حكم في 98.9% مع عرض مرشد. ونقول بوضوح ما لم نبلغه: الإحالة المباشرة 81% مقابل هدف 100%.")

    # 10 Originality vs alternatives -------------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "الأصالة والقيمة المضافة", "ما الذي لا تقدمه البدائل؟",
           "مقارنة بما يجده المسلم الجديد اليوم")
    s.drop(887, 888, 889, 890, 891, 892)
    alts = [
        ("المنصة اليوم", "تهنئة ثم طلب وسيلة تواصل؛ وتعليم العبادة من ذاكرة النموذج ممنوع.",
         "أول درس موثّق يبدأ فوراً في المحادثة نفسها، بلغة المستخدم."),
        ("ملف PDF أو بحث نصي", "لا يعرف أين توقف المستخدم، ولا يجيب بلغته حوارياً، ولا يذكّره.",
         "منهج يحفظ التقدم، ودرس في اليوم بتذكير، وجواب سياقي برقم الصفحة."),
        ("نموذج عام مع الكتاب مرفقاً", "قد ينسب إلى الكتاب ما ليس فيه، ويفتي في الحالات الشخصية.",
         f"فاحص بالكود: اقتباسات مطابقة {D['quotes_ours']} مقابل {D['quotes_base']}، وموجّه يمتنع ويحيل، و«الوجيز» هو المنهج."),
    ]
    w, gap = 513, 40
    for i, (h, lim, add) in enumerate(alts):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 450, [
            para(run(h, 25, LIGHT, True)),
            para(run("حدوده", 16, MUTED, True), before=18),
            para(run(lim, 18, SOFT), before=4, ln=125),
            para(run("ما يضيفه المشروع", 16, TURQ, True), before=22),
            para(run(add, 18, LIGHT), before=4, ln=125),
        ], inset=28)
    callout(s, 148, 880, 1620, 76, [run("الجديد: ", 20, TURQ, True),
                                     run("الشهادة تتحول من نهاية محادثة إلى بداية منهج، داخل منصة قائمة تصل فعلاً إلى غير المسلمين.", 20, LIGHT)])
    s.notes = "(15 ث) الفرق عن البدائل: يبدأ التعليم فوراً في المكان نفسه، ويستمر، ولا ينسب إلى الكتاب ما ليس فيه."

    # 11 Content & languages -----------------------------------------------------------------------
    s = deck.slide(27)
    header(s, 860, 861, 862, "المحتوى واللغات", "مصدر واحد موثوق، بلغات المستخدمين",
           "لا نص ديني يولّده النموذج: الكتاب والمصحف والترجمات تُعرض من مصادرها")
    book, cap, target, robot = s.rel_of(870), s.rel_of(867), s.rel_of(873), s.rel_of(864)
    for pic_id, rid in ((864, book), (867, cap), (870, target), (873, robot)):
        s.find(pic_id).find(".//a:blip", NS).set(f"{{{NS['r']}}}embed", rid)
    elems = [
        (865, 866, f"«الوجيز»: {D['book_editions']} طبعات", ["حُوّلت إلى نص، كل مقطع بصفحته وبصمته", D["book_languages"]]),
        (868, 869, f"{D['lessons']} درساً في {D['units']} وحدات", "ملخص بجمل مرقّمة، وأسئلة فهم وتمارين من أسئلة الكتاب؛ وغير المعتمد يُعرض بنصه فقط"),
        (871, 872, "القرآن الكريم", f"نص Tanzil وترجمة المعاني من QuranEnc ب{D['quranenc_languages']}، و«استمع وردّد» بالمصحف المعلّم"),
        (874, 875, "بقية اللغات", "جواب من النص العربي أو الإنجليزي بوسم «شرح مترجم آلياً، والأصل مرفق»"),
    ]
    for t_id, b_id, t, b in elems:
        s.text(t_id, [t])
        el = s.find(b_id).find(".//a:off", NS)
        s.move(b_id, int(el.get("x")) / EMU, 745, 370, 220)
        s.text(b_id, b if isinstance(b, list) else [b], size=19)
    s.notes = "(15 ث) المصدر واحد: الوجيز بعشر طبعات. والقرآن من Tanzil وترجمات QuranEnc. وبقية اللغات ترى الأصل مع شرح مترجم بوسم واضح."

    # 12 Operations & continuation -----------------------------------------------------------------
    s = deck.slide(11)
    header(s, 537, 538, 539, "التشغيل والاستمرار", "جاهز للتشغيل من اليوم التالي للتحدي",
           "تكلفة منخفضة، ومراجعة بشرية دورية، وقياس مجمّع لا يمس الخصوصية")
    s.drop(541, 542, 543, 544, 545, 546, 547, 548)
    for i, (v, t) in enumerate([
        (f"{D['cost_per_question_usd']}$", "متوسط تكلفة السؤال على المجموعة المثبتة"),
        (f"{D['latency_median_s']} ث", "الوسيط لزمن الجواب، مع مراحل حية أثناء الانتظار"),
    ]):
        dark_card(s, 148, 400 + i * 245, 470, 225, [
            para(run(v, 46, TURQ, True), algn="ctr", rtl=False),
            para(run(t, 18, SOFT), algn="ctr", before=6, ln=115),
        ], anchor="ctr")
    ops = [
        ("مراجعة أسبوعية", "بلاغات «أبلغ عن خطأ» والإحالات تصل إلى لوحة المرشد، ويراجعها المختص كل أسبوع."),
        ("اعتماد تدريجي للدروس", "يعتمد المختص الشرعي بقية الدروس واللغات؛ وما لم يُعتمد يُعرض بنص الكتاب وصفحته فقط."),
        (f"قياس مجمّع من {D['metrics_from']}", "من فتحوا المنهج، ومن أكملوا درس الصلاة، ومن عادوا في يوم لاحق، وصحة أسئلة الفهم، والإحالات. أعداد فقط."),
        ("مزوّد احتياطي بإعداد واحد", "LLM_PROVIDER=openai يبدّل مزوّد التوليد؛ والخدمة حاوية واحدة خلف nginx وCloudflare."),
    ]
    icons = ["image15.png", "image16.png", "image24.png", "image23.png"]
    for i, (h, t) in enumerate(ops):
        y = 395 + i * 128
        rid = s.template_image(icons[i])
        s.add(picture(s.ids(), rid, 1690, y + 8, 78, 78, name=f"icon {i + 1}", descr=""))
        s.add(shape(s.ids(), 660, y, 1005, 110, [
            para(run(h, 22, LIGHT, True)),
            para(run(t, 17.5, SOFT), before=4, ln=118),
        ]))
    s.notes = "(20 ث) السؤال بأقل من عُشر سنت. مراجعة أسبوعية للبلاغات، واعتماد تدريجي للدروس، وقياس مجمّع من 7 أكتوبر، ومزوّد احتياطي بإعداد واحد."

    # 13 Disclosure: built vs existing -----------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "الإفصاح", "ما بُني خلال التحدي، وما كان قائماً قبله",
           "قابل للتحقق: وسم Git سابق للتحدي، وسجل الالتزامات، وملف فرق المنصة")
    s.text(887, [f"بُني خلال {D['built_dates']} (يُقيَّم)"])
    s.text(888, [f"كل ما في المستودع، ورقعة دمج من {D['patch_lines']} سطراً على نسخة المنصة الموسومة"], size=19)
    s.drop(891, 892)
    s.add(shape(s.ids(), 1018, 620, 750, 240, [para(run(t, 18, SOFT), after=14, ln=115) for t in [
        "الوحدة: بطاقة البداية، المنهج والدروس، الأسئلة، الإحالة ولوحة المرشد، الحساب والتذكير",
        f"الموجّه والاسترجاع الهجين والفاحص، وتحويل {D['book_editions']} طبعات من «الوجيز» إلى نص",
        "مجموعات التقييم المثبّتة ببصمة قبل البناء، وأداة محاكاة الرحلات",
    ]]))
    s.text(889, ["قائم قبل التحدي (لا نطلب تقييمه)"])
    s.text(890, ["منصة theislam.chat لجمعية أصول، تعمل منذ أكتوبر 2024، موسومة pre-challenge-2026-10-03"], size=19)
    s.add(shape(s.ids(), 148, 620, 750, 240, [para(run(t, 18, SOFT), after=14, ln=115) for t in [
        "الواجهة، والمحادثة الصوتية، وزر «تحدث إلى إنسان»",
        "تعليمات الحوار الدعوي قبل الشهادة",
        "لم يُستخدم نص أي محادثة حقيقية في الكود أو الاختبار أو العرض",
    ]]))
    callout(s, 148, 880, 1620, 80, [run("لا ندّعي: ", 17, TURQ, True),
                                     run("تحسّن الفهم لدى مسلمين جدد حقيقيين خلال مدة التحدي. والحالات الحرجة الثلاثون كتبها عضو الفريق الذي بنى الموجّه، وجُمّدت في أول التزام.", 17, LIGHT)])
    s.notes = "(20 ث) الجديد هو الوحدة كلها ورقعة دمج من 181 سطراً. المنصة نفسها قائمة قبل التحدي ولا نطلب تقييمها."

    # 14 Team --------------------------------------------------------------------------------------
    s = deck.slide(19)
    header(s, 688, 689, 690, "الفريق", "فريق العمل", "جمعية أصول · theislam.chat")
    s.drop(692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703)
    w, gap = 300, 30
    for i, (name, role, does) in enumerate(TEAM):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 460, None)
        s.add(shape(s.ids(), x + (w - 150) / 2, 425, 150, 150, [para(run(f"0{i + 1}", 34, TURQ, True), algn="ctr")],
                    fill=VIOLET, alpha=35, line=TURQ, line_alpha=60, line_w=1.5, geom="ellipse", anchor="ctr"))
        s.add(shape(s.ids(), x + 20, 600, w - 40, 300, [
            para(run("الاسم", 15, MUTED), algn="ctr"),
            para(run(name, 23, LIGHT, True), algn="ctr", before=2),
            para(run(role, 19, TURQ, True), algn="ctr", before=16, ln=110),
            para(run(does, 16, SOFT), algn="ctr", before=8, ln=120),
        ]))
    s.notes = "(10 ث) الفريق: قائد، ومهندس ذكاء اصطناعي، ومطوّر خلفية، ومطوّر واجهات، ومختص شرعي."

    # 15 Thanks ------------------------------------------------------------------------------------
    s = deck.slide(31)
    s.text(915, ["theislam.chat | ما بعد الشهادة · جمعية أصول"])
    s.text(916, [f"{D['link']}  ·  {D['repo']}"])
    s.notes = "شكراً. التجربة الحية على الرابط، والمستودع والتقرير الكامل متاحان."

    deck.save(OUT)
    print(f"wrote {OUT} ({len(deck.slides)} slides)")


if __name__ == "__main__":
    build(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TEMPLATE)
