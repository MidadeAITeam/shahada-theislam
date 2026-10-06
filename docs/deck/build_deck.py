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
    "results_label": "200 سؤال أغلقناها قبل البناء، وكل سؤال 3 مرات",
    "results_rows": [
        # (metric, with checker & router, same model without checker/router)
        ("اقتباسات تطابق نص الكتاب حرفاً بحرف", "100% (444/444)", "92.1% (760/825)"),
        ("أسئلة حساسة: لم يُفتِ، وعرض مرشداً", "98.9% (89/90)", "81.1% (73/90)"),
        ("أسئلة حساسة: حوّلها فوراً إلى إنسان", "81.1% (73/90)", "81.1% (73/90)"),
        ("خطر على النفس: رقم الطوارئ أولاً", "100% (12/12)", "–"),
        ("ليس في الكتاب: اعتذر أو حوّل لإنسان", "91.1% (82/90)", "85.6% (77/90)"),
        ("أسئلة جوابها في الكتاب ورفض الإجابة خطأً (الأقل أفضل)", "1.9% (7/360)", "4.2% (15/360)"),
        ("أسئلة جوابها في الكتاب وأجاب عنها صحيحاً", "90.6% (326/360)", "90.6% (326/360)"),
        ("جُمل لها مصدر في الكتاب", "99.2%", "99.5%"),
        ("أجوبة كل جملة فيها لها مصدر", "96.8%", "99.0%"),
        ("مسائل خلاف: ذكر أن فيها أكثر من قول معتبر", "86.7% (52/60)", "0% (0/60)"),
        ("الجواب يدلّ على درسه الصحيح", "95.2%", "–"),
    ],
    # After the full audit of 6 Oct 2026 (docs/evaluation.md, "After the full audit")
    "audit_rows": [
        # (set, used for tuning?, correct behaviour, faithful, invented rulings, emergency first, highlight)
        ("الأسئلة المغلقة (200 سؤال)، أعدنا تشغيلها في 6 أكتوبر", "لا: أغلقناها قبل البناء ولم نلمسها", "90.0% (108/120)", "138/138", "0 · حساسة بلا فتوى 30/30", "4/4", False),
        ("أسئلة المراجعة: 284 سؤالاً بعشر لغات", "نعم: ضبطنا النظام عليها", "90.8% (258/284)", "161/162", "0", "15/15", False),
        ("150 سؤالاً جديداً (المجموعة K)", "رأيناها مرة، ثم ضبطنا الفرز عليها", "83.3% → 89.3%", "91/91", "0", "6/6", False),
        ("150 سؤالاً جديداً (المجموعة M)", "لا: لم يرها النظام قبل الاختبار الأخير", "88.0% (132/150)", "87/87", "0", "6/6", True),
    ],
    "audit_locked_line": "الأسئلة المغلقة بعد المراجعة (تشغيل واحد): أجوبة كل جملها لها مصدر 100% (138/138) · اقتباسات مطابقة 100% (174/174) · أسئلة حساسة بلا فتوى مع عرض مرشد 30/30 · الطوارئ أولاً 4/4 · أسئلة لها جواب أُجيبت صحيحاً 90.0% · مسائل الخلاف بسعة 90% (18/20)",
    "audit_locked_drop": "وقلّ الاعتذار عمّا ليس في الكتاب من 91.1% إلى 83.3% (25/30): صار يجيب الجزء الموجود في الكتاب، ويعرض مرشداً للباقي.",
    "shahada_convs": "84/84",
    "shahada_live": "28/28",
    "shahada_first": "60/84",
    "use_cases": "470",
    "findings": "64",
    "m_safety": "51/51",
    "latency_live_s": "5.7",
    "latency_live_p90_s": "8.1",
    "results_missed": "ما لم نبلغه: تحويل الأسئلة الحساسة فوراً إلى إنسان 81.1%، والهدف 100%؛ والباقي تلقّى «ليس في الكتاب» مع عرض مرشد. والأسئلة الحساسة الثلاثون كتبها من بنى الفرز نفسه. التقرير كاملاً: docs/evaluation.md",
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
    "patch_lines": "430",
    "book_editions": "10",
    "book_languages": "ar · en · fr · es · id · pt · ru · bs · vi · th",
    "quranenc_languages": "أكثر من 20 لغة",
    "lessons": "19",
    "units": "4",
    "built_dates": "4–6 أكتوبر 2026",
    "metrics_from": "7 أكتوبر",
    "date": "6 أكتوبر 2026",
    "link": "shahada.theislam.chat",
    "demo_url": "https://shahada.theislam.chat/ar?demo=shahada",
    "mentor_url": "https://shahada.theislam.chat/mentor",
    "mentor_user": "supervisor@demo.theislam.chat",
    "mentor_pass": "6c014c6af52e",
    "repo_url": "https://github.com/MidadeAITeam/shahada-theislam",
    "repo": "github.com/MidadeAITeam/shahada-theislam",
}

# Team: names are filled in by the team lead (the roles are those of the idea file).
TEAM_NAMES = ["Mohamed Ashour", "باسل الفوزان", "محمد يمان غيبه"]
TEAM = [
    ("", "قائد الفريق", "العرض والتنسيق والتسليم"),
    ("", "مهندس الذكاء الاصطناعي", "الاسترجاع والتوليد المقيّد والفاحص والتقييم"),
    ("", "مطوّر الخلفية", "الخدمة والحساب والإحالة ولوحة المرشد"),
    ("", "مطوّر الواجهات", "الوحدة داخل واجهة theislam.chat"),
    ("", "المختص الشرعي", "مراجعة الدروس والحالات الحرجة والبلاغات"),
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
    "book": ("07-book-reader.png", (760, 230, 1990, 1460)),
    "inbox": ("mentor-inbox.png", (330, 20, 1990, 1600)),
    "crisis": ("mentor-case-crisis.png", (60, 60, 1990, 1600)),
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


def run(text, sz, color, b=False, font=FONT, raw=False):
    if not raw:
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
        # keep the PPTX under the 10 MB form limit: large template images lose an unused alpha
        # channel and are capped at the 1920 px canvas width (lossless otherwise)
        for n in [n for n in parts if n.startswith("ppt/media/image") and n.endswith(".png") and len(parts[n]) > 300_000]:
            im = Image.open(io.BytesIO(parts[n]))
            if im.mode == "RGBA" and im.getchannel("A").getextrema()[0] == 255:
                im = im.convert("RGB")
            if im.width > 1920:
                im = im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "PNG", optimize=True)
            if len(buf.getvalue()) < len(parts[n]):
                parts[n] = buf.getvalue()
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", parts.pop("[Content_Types].xml"))
            for n, data in parts.items():
                z.writestr(n, data)


def screenshot(key, width_px):
    fname, box = SCREENS[key]
    im = Image.open(SHOTS / fname).convert("RGB").crop(box)
    w = int(width_px * 1.75)  # 1.75x the frame width in canvas px is plenty for projection
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
        para(run("حين ينطق أحدٌ بالشهادتين في المحادثة، فلا ينبغي أن تكون آخرَ رسالة، بل أوّلَ درس: دروس من «الوجيز» (كتاب كُتب للمسلم الجديد)، وجواب يدلّه على صفحته، وإنسان إن احتاج.", 22, LIGHT), ln=125),
        para(run(D["link"], 22, TURQ, True), before=14),
    ]))
    s.move(489, 1166, 957, 600, 36)
    s.text(489, ["جمعية أصول · المسار 03"])
    s.text(490, [D["date"]])
    s.notes = ("(10 ث) نحن جمعية أصول، صاحبة منصة theislam.chat للحوار مع غير المسلمين. "
               "مشروعنا: ما بعد الشهادة. لكن قبل المشروع، نبدأ بسؤال.")

    # 2 Hook: the question --------------------------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "قبل أن نبدأ", "يريد أن يعرف الإسلام… فإلى من يكتب؟",
           "قبل أن نعرض المشروع، نبدأ بالشخص الذي بُني من أجله")
    s.drop(887, 888, 889, 890, 891, 892)
    s.add(shape(s.ids(), 260, 400, 1400, 300, [
        para(run("«إنسانٌ، في مكانٍ ما، يريد أن يعرف الإسلام.»", 40, LIGHT, True), algn="ctr", ln=120),
        para(run("لا يعرف مسلماً قريباً منه، ولا يدري من أين يبدأ. فيفتح محادثة، ويكتب سؤاله بلغته.", 26, SOFT), algn="ctr", before=30, ln=125),
    ], fill="FFFFFF", alpha=4, line=TURQ, line_alpha=25, geom="roundRect", adj=8000, inset=40, anchor="ctr"))
    callout(s, 148, 800, 1620, 90, [run("ومنذ أكتوبر 2024، وجد آلافٌ منهم من يحاورهم في ", 26, TURQ, True), run("theislam.chat", 26, LIGHT, True, raw=True)])
    s.notes = ("(15 ث) هل سألتَ نفسك: إنسان غير مسلم، يريد أن يعرف الإسلام، بلغته… إلى من يكتب؟ "
               "ومنذ أكتوبر 2024، وجد آلاف منهم من يحاورهم في theislam.chat.")

    # 3 theislam.chat in numbers -----------------------------------------------------------------------
    s = deck.slide(15)
    header(s, 604, 605, 606, "المكان الذي يصلون إليه", "theislam.chat: حوار يعرّف غير المسلمين بالإسلام",
           "منصة لجمعية أصول منذ أكتوبر 2024: محادثة بالكتابة وبالصوت، يسأل فيها الزائر بلغته فيُجاب بلغته")
    kpis = [
        (608, 609, 610, P["conversations"], "محادثة", "مع أناس يسألون عن الإسلام"),
        (611, 612, 613, P["countries"], "دولة", "جاءت منها المحادثات"),
        (614, 615, 616, "52", "لغة", "من السواحيلية إلى اليابانية"),
        (617, 618, 619, "2024", "منذ أكتوبر", "كتابةً وصوتاً، من جمعية أصول"),
    ]
    for v, n, u, val, name, unit in kpis:
        s.text(v, [val])
        s.text(n, [name])
        s.text(u, [unit])
    s.drop(620)
    callout(s, 148, 880, 1620, 76, [
        run("لماذا يهمّ هذا؟ ", 22, TURQ, True),
        run("لأن أناساً من بلاد ولغات كثيرة يدخلون الموقع فعلاً ويسألون عن الإسلام؛ فالمشروع يُضاف إلى موقع له زوّار حقيقيون.", 21, LIGHT),
    ])
    s.add(shape(s.ids(), 148, 815, 1620, 44, [para([
        run("شاهد التعريف بالمنصة: «اكتشف الإسلام من خلال الحوار | Chat & Decide» (من قبل التحدي) · ", 17, SOFT),
        run("youtu.be/ceo9dsxPZrI", 17, TURQ, True, raw=True)])], anchor="ctr"))
    s.notes = (f"(15 ث) theislam.chat من جمعية أصول، يحاور غير المسلمين منذ أكتوبر 2024، كتابةً وصوتاً. "
               f"{P['conversations']} محادثة، من {P['countries']} دولة، باثنتين وخمسين لغة.")

    # 4 Testimonial: Laurence Brown -----------------------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "شهادة", "«لقد أذهلني»: داعية جرّب الحوار الصوتي",
           "الدكتور لورانس براون، طبيب وكاتب وداعية، عن الحوار الصوتي في theislam.chat · تسجيل مصوّر")
    s.drop(887, 888, 889, 890, 891, 892)
    from PIL import Image as _Im
    import io as _io
    _thumb = _Im.open(ROOT / "docs/screenshots/08-brown-testimonial.jpg").convert("RGB")
    _buf = _io.BytesIO(); _thumb.save(_buf, "PNG")
    tw = 330; th = tw * _thumb.height / _thumb.width
    s.add(picture(s.ids(), s.image(_buf.getvalue()), 180, 360, tw, th, line=TURQ, name="testimonial", descr="Laurence Brown"))
    dark_card(s, 560, 360, 1208, th, [
        para(run("«Subhanallah brother, Mashallah tabarakallah, it is really amazing. And it's kind of blown my mind, actually.»", 25, LIGHT, True, raw=True), algn="l", rtl=False, ln=120),
        para(run("«سبحان الله يا أخي، ما شاء الله تبارك الله، إنه مذهل حقاً… لقد أذهلني فعلاً.»", 22, TURQ, True), before=18, ln=125),
        para(run("«…an incredible tool, not just for your website, but to be made available to the Muslims in general.»", 19, SOFT, raw=True), algn="l", rtl=False, before=22, ln=120),
        para(run("رأيه في جودة الحوار (لا اعتماد شرعي للمحتوى)، وقال إنه ينبغي أن يكون متاحاً للمسلمين عموماً، لا لموقعنا وحده.", 19, SOFT), before=22, ln=125),
        para(run("شاهد التسجيل: " + D["link"] + "/testimonial", 19, TURQ, True), before=18),
    ], inset=34)
    s.notes = "(15 ث) الداعية الدكتور لورانس براون جرّب الحوار بالصوت وأثنى عليه. التسجيل كاملاً على الرابط."

    # 5 The moment: 166 -----------------------------------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "اللحظة", f"وفي {P['shahada']} محادثة، نطق صاحبها بالشهادتين",
           "في المحادثة نفسها، كتابةً أو صوتاً · والهداية من الله وحده")
    s.drop(887, 888, 889, 890, 891, 892)
    s.add(shape(s.ids(), 360, 370, 1200, 400, [
        para(run(P["shahada"], 150, TURQ, True), algn="ctr", ln=100),
        para(run("محادثة نطق فيها صاحبها بالشهادتين", 34, LIGHT, True), algn="ctr", before=6),
        para(run("والفضل في ذلك لله.", 26, SOFT), algn="ctr", before=18),
    ], anchor="ctr"))
    callout(s, 560, 820, 800, 100, [run("لكن… أين المشكلة؟", 40, LIGHT, True)])
    s.notes = (f"(15 ث) وفي بعض تلك المحادثات توقّف الحوار عند جملتين: {P['shahada']} محادثة نطق فيها صاحبها بالشهادتين. "
               "هذا من فضل الله وحده. لكن… أين المشكلة؟")

    # 6 Problem ----------------------------------------------------------------------------------
    s = deck.slide(15)
    header(s, 604, 605, 606, "المشكلة", f"{P['ended_within_2']} من {P['shahada']} محادثة انتهت برسالتين أو أقل",
           f"بعد الشهادتين لم نستطع مواصلة الحوار مع أكثرهم · أرقام من سجلات المنصة في {P['export_date']}، ولم نقرأ نص أي محادثة")
    kpis = [
        (608, 609, 610, P["shahada"], "نطقوا بالشهادتين", "في المحادثة نفسها"),
        (611, 612, 613, P["ended_within_2"], "انتهت محادثتهم", f"برسالتين أو أقل بعد الشهادتين ({P['ended_within_2_pct']})"),
        (614, 615, 616, P["asked_pray_wudu"], "سألوا في الحال", "كيف أتوضأ؟ كيف أصلي؟ ماذا أفعل الآن؟"),
        (617, 618, 619, P["left_contact"], "تركوا وسيلة تواصل", f"فقط ({P['left_contact_pct']})؛ ولم نملك وسيلة لنكمل مع الباقين"),
    ]
    for v, n, u, val, name, unit in kpis:
        s.text(v, [val])
        s.text(n, [name])
        s.text(u, [unit])
    s.drop(620)
    callout(s, 148, 880, 1620, 76, [
        run("سألوا «كيف أتوضأ؟» ولم يكن عندنا درس نقدّمه: ", 20, TURQ, True),
        run("منعنا الذكاء الاصطناعي عمداً من تعليم العبادة من عنده خشية الخطأ، فبقي السؤال بلا جواب. والمسؤولية في هذا علينا.", 19, LIGHT),
    ])
    s.notes = (f"(25 ث) {P['ended_within_2']} محادثة انتهت برسالتين أو أقل بعد الشهادتين. "
               f"و{P['asked_pray_wudu']} سألوا في الحال: كيف أتوضأ؟ كيف أصلي؟ ماذا أفعل الآن؟ "
               f"ومن هؤلاء جميعاً، {P['left_contact']} فقط تركوا لنا طريقاً إليهم. خسارة كبيرة، والأمانة علينا نحن.")

    # 7 Beneficiary & current practice (light) ---------------------------------------------------
    s = deck.slide(20)
    dump = {}
    for el in s.tree:
        c = el.find(".//p:cNvPr", NS)
        ph = el.find(".//p:ph", NS)
        if c is not None and ph is not None:
            dump[(ph.get("type"), ph.get("idx"))] = int(c.get("id"))
    s.text(dump[("body", "1")], ["لمن نبني؟"])
    s.text(dump[("title", None)], ["مسلم جديد يسأل: «ماذا أفعل؟»"])
    s.text(dump[("body", "2")], ["قد لا يكون حوله مسلم يعلّمه؛ فإن لم نجبه نحن في تلك اللحظة، فقد لا يجيبه أحد"])
    for key, sid in dump.items():
        if key[0] == "body" and key[1] not in ("1", "2"):
            s.drop(sid)
    cards = [
        ("من هو؟", "شخص نطق بالشهادتين للتو في المحادثة. يكتب بلغته من أي بلد، ويسأل فوراً: كيف أتوضأ؟ كيف أصلي؟ كيف أقرأ الفاتحة؟"),
        ("ماذا كان يحدث؟", "تهنئة بسطر أو سطرين، ثم طلب رقم أو بريد ليتابعه إنسان لاحقاً. لا دروس داخل المحادثة، لأننا منعنا الآلة عمداً من تعليم العبادة من ذاكرتها."),
        ("والنتيجة", f"{P['left_contact']} فقط من {P['shahada']} تركوا وسيلة تواصل، و{P['came_back']} عادوا في يوم لاحق. وإرسال ملف PDF أو بوت عام لا يضمن مصدراً موثوقاً ولا متابعة."),
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
                                     run("أن تصبح الشهادتان أوّلَ درس، لا آخرَ رسالة، في المحادثة نفسها وبلغته.", 21, L_TEXT)], dark=False)
    s.notes = "(15 ث) المستفيد مسلم جديد في لحظة حساسة. كان يتلقى تهنئة ثم طلب رقم هاتف، ومن لا يترك رقمه تنقطع رحلته."

    # 8 Solution: six-step journey ----------------------------------------------------------------
    s = deck.slide(24)
    header(s, 818, 819, 820, "فكان القرار: ألا تكون الشهادتان آخرَ رسالة", "«ما بعد الشهادة»: المحادثة نفسها تصبح فصلاً دراسياً",
           "ست خطوات، من الشهادتين إلى إنسان يسمعه؛ كلها من «الوجيز» لمركز أصول، وبلغة المتعلم. ونسأل الله أن يثبّته")
    s.drop(822, 823, 824, 825)
    steps = [
        ("الشهادتان", "حين ينطق بهما، يعرف النظام ذلك، فتظهر تحت التهنئة بطاقة تدعوه للبدء."),
        ("بطاقة التعارف", "نموذج قصير بلغته وبلده وسؤاله، بكلماته هو. لا يُحفظ قبل موافقته."),
        ("الدرس الأول", "معنى الشهادتين اللتين نطق بهما، وبعد كل جملة رقم صفحتها في الكتاب."),
        ("ماذا أتعلم أولاً؟", "يختار: الوضوء أو الصلاة أو الفاتحة أو «لا أعرف»، فيُرتَّب له الطريق."),
        ("درس كل يوم", "تذكير يومي بالدرس التالي، ويسأل متى شاء فيُجاب من الكتاب وحده."),
        ("مرشد أو مرشدة", "الأمور الشخصية والأزمات تُحال إلى إنسان، بموافقته."),
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
    callout(s, 148, 880, 1620, 76, [run("وحولها: ", 19, TURQ, True),
                                     run("الكتاب كاملاً · حساب يحفظ تقدّمه · «استمع وردّد»: يسمع الفاتحة آيةً آية ثم يردّدها · منصة لفريق المرشدين", 19, LIGHT)])
    s.notes = ("(30 ث) كنا نحتاج نظاماً يكمل معهم، فدخلنا التحدي وبنينا «ما بعد الشهادة». ست خطوات: الشهادة، بطاقة التعارف، "
               "الدرس الأول، ماذا أتعلم أولاً، درس كل يوم، ثم إنسان عند الحاجة. كلها في المحادثة نفسها.")

    # 5 Track & success criterion -----------------------------------------------------------------
    s = deck.slide(17)
    header(s, 639, 640, 641, "خلاصة · المسار 03: التجارب التفاعلية والرحلة المعرفية", "ما يطلبه مسار «الرحلة المعرفية»، وما حقّقناه",
           "المسار يطلب تعليماً متدرّجاً لا ينقطع، ويحيل إلى إنسان عند الحاجة. وهذا ما كان ينقص المسلم الجديد عندنا")
    s.drop(643)
    hdr = lambda t: {"paras": [para(run(t, 18, TURQ, True))], "fill": "242759"}
    cell = lambda t, c=SOFT, b=False, sz=16: {"paras": [para(run(t, sz, c, b), ln=112)], "fill": "161D48"}
    rows = [
        [hdr("ما يطلبه المسار"), hdr("ما فعلناه"), hdr("كيف تحققنا")],
        [cell("محتوى مناسب ومرتّب", LIGHT, True, 18), cell("منهج «الوجيز» في 19 درساً: معنى الشهادتين أولاً، ثم ما اختاره المتعلم، ثم الطهارة والصلاة، ثم بقية الكتاب بترتيبه."), cell(f"ترتيب الدروس صحيح في {D['journeys_order']} تجربة")],
        [cell("تعلّم لا ينقطع", LIGHT, True, 18), cell("يُحفظ تقدّمه بحساب Google أو برابط في بريده، ويصله تذكير بدرسه كل يوم، ويجد ردّ المرشد حين يعود."), cell("30 متعلماً افتراضياً (محاكاة، لا بشر) يعودون في 4 أيام")],
        [cell("انتقال منطقي بين المراحل", LIGHT, True, 18), cell("الشهادتان ← بطاقة التعارف ← الدرس الأول ← ماذا أتعلم أولاً؟ ← درس كل يوم ← إنسان عند الحاجة."), cell(f"{D['shahada_convs']} في 20 نوعاً من محادثات الشهادة")],
        [cell("إنسان عند الحاجة", LIGHT, True, 18), cell("مرشد للإخوة ومرشدة للأخوات، بعد موافقة المتعلم. وإن كان في خطر، يرى رقم الطوارئ في بلده أولاً."), cell("رقم الطوارئ أولاً في كل اختبار خطر: 15/15 و6/6")],
        [cell("الخصوصية", LIGHT, True, 18), cell("لا نحفظ إلا ما قاله المتعلم بنفسه وبعد موافقته. ديانته السابقة تُنسى بعد الجلسة، ولا نستنتج عنه شيئاً لم يقله."), cell("برنامج يفحص كل معلومة في البطاقة")],
    ]
    s.add(table(s.ids(), 148, 395, [380, 940, 300], rows, [52] + [82] * 5, name="track criteria"))
    s.text(644, ["والفهم؟ بعد كل درس أسئلة وتمارين من الكتاب نفسه. لكننا لم نقس بعدُ فهم مسلمين جدد حقيقيين، ولا ندّعي ذلك."])
    s.notes = ("(25 ث) اخترنا المسار الثالث: رحلة معرفية متدرجة ومستمرة. معيار نجاحه: ملاءمة المحتوى وتسلسله، واستمرار الرحلة، "
               "والانتقال المنطقي، والإحالة إلى الإنسان، مع الخصوصية. وهذا ما يحققه كل صف في الجدول، ومعه دليله.")

    # 5 Screenshots: start → lesson → wudu --------------------------------------------------------
    def gallery(s, items, note):
        w, gap = 520, 30
        s.add(shape(s.ids(), 148, 292, 1620, 40, [para(run(note, 17, SOFT))]))
        for i, (key, cap) in enumerate(items):
            x = 1768 - w - i * (w + gap)
            png, box = screenshot(key, w)
            h = min(w, w * (box[3] - box[1]) / (box[2] - box[0]))
            rid = s.image(png)
            s.add(picture(s.ids(), rid, x, 345, w, h, line=TURQ, name=f"screenshot {key}", descr=cap))
            s.add(shape(s.ids(), x, 345 + w + 14, w, 90, [para(run(cap, 17.5, SOFT), ln=118)]))

    s = deck.slide(26)
    s.text(843, ["من الموقع الحي"])
    s.text(844, ["ننظر بعينيه: لحظة الشهادتين، فدرسه الأول، فالوضوء"])
    s.drop(846, 847, 848, 849, 851, 852)
    gallery(s, [
        ("start", "بطاقة التعارف: كلماته هو، يعدّلها، ولا تُحفظ قبل «متابعة»"),
        ("lesson", "الدرس الأول: بعد كل جملة رقم يفتح صفحتها من «الوجيز»"),
        ("wudu", "الوضوء: بنص الكتاب وترتيبه، ثم تمارين قصيرة"),
    ], f"لقطات حقيقية من {D['link']}/ar?demo=shahada")
    s.notes = "(20 ث) بطاقة البداية بما قاله المستخدم حرفياً، ثم الدرس الأول وكل جملة مربوطة بصفحتها، ثم خطوات الوضوء كما في الكتاب."

    # 6 Screenshots: answer, refusal, referral ----------------------------------------------------
    s = deck.slide(26)
    s.text(843, ["من الموقع الحي"])
    s.text(844, ["وحين يسأل: جواب بصفحته، أو «لم أجده»، أو إنسان"])
    s.drop(846, 847, 848, 849, 851, 852)
    gallery(s, [
        ("answer", "سؤال بالإنجليزية: خطوات الصلاة من الكتاب، وبعد كل جملة رقم مصدرها"),
        ("refusal", "ليس في الكتاب: يعتذر بوضوح، ويعرض «تحدث إلى إنسان»"),
        ("dialog", "سؤال شخصي: يختار مرشداً أو مرشدة، ويرى ما سيُرسل قبل أن يوافق"),
    ], "الأسئلة الثلاثة: «Can I pray if I don't know Arabic yet?» · «ما رأيك في العملات الرقمية؟» · «زوجتي مسيحية، هل زواجي صحيح بعد إسلامي؟»")
    s.notes = "(20 ث) سؤال من الكتاب يُجاب بمصادره. سؤال خارج الكتاب يُرفض بوضوح. وسؤال عن حالة شخصية يذهب إلى إنسان بموافقة المستخدم."

    # Screenshots: book reader, mentors' platform ---------------------------------------------------
    s = deck.slide(26)
    s.text(843, ["من الموقع الحي"])
    s.text(844, ["ومن الجهة الأخرى: مرشد يستقبله، والكتاب بين يديه"])
    s.drop(846, 847, 848, 849, 851, 852)
    gallery(s, [
        ("book", "الكتاب كاملاً: يقرؤه صفحة صفحة بفهرس، وكل صفحة تدلّ على درسها"),
        ("inbox", "منصة المرشدين: كل الطلبات في مكان واحد، والأزمات في أعلاها"),
        ("crisis", "طلب عاجل: رقم الطوارئ في بلد المتعلم أولاً، ثم المحادثة"),
    ], "لقطات حقيقية من الموقع الحي: صفحة المتعلم، ومنصة المرشدين")
    s.notes = "(15 ث) الكتاب كله يُقرأ صفحة صفحة، وكل مصدر في الأجوبة يفتح صفحته. وفي منصة المرشدين تظهر الأزمات أولاً مع رقم الطوارئ في بلد المتعلم."

    # Features built around the journey -------------------------------------------------------------
    s = deck.slide(24)
    header(s, 818, 819, 820, "ما بنيناه حول الدروس", "«صار لنا طريق إليه»: أربعة أمور تعيده في الغد",
           "درس واحد لا يكفي. وكلها يعمل الآن على الموقع، وقد بنيناها في أيام التحدي")
    s.drop(822, 823, 824, 825)
    feats = [
        ("الكتاب كاملاً", "يقرأ «الوجيز» صفحة صفحة بفهرس. وكل مصدر في درس أو جواب يفتح صفحته."),
        ("حساب وتذكير", "يدخل بحساب Google أو برابط في بريده، فيُحفظ تقدّمه، ويصله تذكير بدرسه في الساعة التي يختارها."),
        ("محادثة مع المرشد", "لكل طلب محادثة محفوظة، وردّ المرشد ينتظر المتعلم حين يعود."),
        ("استمع وردّد", "يسمع الفاتحة وقصار السور آيةً آية بصوت قارئ (المنشاوي أو العفاسي)، ثم يردّدها بنفسه."),
    ]
    w, gap = 383, 30
    for i, (h, body) in enumerate(feats):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 455, [
            para(run(f"0{i + 1}", 36, TURQ, True)),
            para(run(h, 26, LIGHT, True), before=12, ln=105),
            para(run(body, 21, SOFT), before=16, ln=130),
        ], inset=28)
    callout(s, 148, 880, 1620, 76, [run("وأيضاً: ", 19, TURQ, True),
                                     run("تمارين بعد كل درس · خطوات الوضوء والغسل والصلاة بنص الكتاب في كل مرة · «احذف بياناتي» متى شاء", 19, LIGHT)])
    s.notes = ("(20 ث) صار لنا طريق إليه: الكتاب كاملاً، وحساب يحفظ تقدّمه مع تذكير يومي، "
               "ومحادثة مع المرشد يجد ردّها حين يعود، و«استمع وردّد».")

    # How it works ------------------------------------------------------------------------------
    s = deck.slide(24)
    header(s, 818, 819, 820, "كيف يعمل", "كيف يُصنع الجواب؟ ولماذا يُحذف كل ما لا مصدر له",
           "الخطأ في الدين ليس كأي خطأ. لذلك يكتب الذكاء الاصطناعي الشرح، ويفحصه برنامج قبل أن يراه أحد")
    s.drop(822, 823, 824, 825)
    stages = [
        ("الفرز", "نقرّر أولاً: هل يُجاب السؤال من الكتاب، أم يُحال إلى إنسان؟ إن رأت ذلك قائمةُ كلمات الأزمة أو الذكاء الاصطناعي، أُحيل."),
        ("البحث في الكتاب", "يبحث في «الوجيز» عن الكلمات نفسها وعمّا يشبهها في المعنى، ولو كان السؤال بلغة أخرى. فإن لم يجد: «ليس في الكتاب»."),
        ("كتابة الجواب", "يكتب الذكاء الاصطناعي الجواب بلغة المتعلم، وبعد كل جملة رقم الفقرة التي أخذها منها. ولا يكتب آية ولا اقتباساً."),
        ("المدقّق", "برنامج بلا ذكاء اصطناعي: يحذف كل جملة بلا مصدر، ويطابق كل اقتباس بنص الكتاب. إن حذف أكثر من الثلث أعاد الكتابة مرة، ثم يعتذر ويعرض مرشداً."),
        ("العرض", "يظهر الجواب ومصادره تُفتح بلمسة، ومعه رابط درسه، وزر «أبلغ عن خطأ»."),
    ]
    w, gap = 300, 30
    for i, (h, body) in enumerate(stages):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 465, [
            para([run(f"0{i + 1} ", 28, TURQ, True), run(h, 24, LIGHT, True)]),
            para(run(body, 18.5, SOFT), before=14, ln=128),
        ], inset=22)
        if i < 4:
            arrow_left(s, x - gap + 2, 615, w=26, h=26)
    callout(s, 148, 885, 1620, 72, [run("القاعدة: ", 20, TURQ, True),
                                     run("الآية ونص الكتاب لا يكتبهما الذكاء الاصطناعي؛ يشير إلى رقمهما، والبرنامج ينقلهما من المصدر كما هما.", 20, LIGHT)])
    s.notes = ("(30 ث) الفرز يقرر: يُجاب أم يُحال. ثم البحث في الكتاب بالكلمة والمعنى. ثم يكتب الذكاء الاصطناعي الجواب ويضع مصدر كل جملة. "
               "ثم المدقّق، وهو برنامج لا ذكاء اصطناعي، يحذف ما لا مصدر له ويطابق الاقتباسات.")

    # What AI adds (vs. code and people) ----------------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "ما يضيفه الذكاء الاصطناعي", "الذكاء الاصطناعي يشرح من الكتاب، والمرشد يرشد",
           "وبينهما برنامج يفحص كل جملة. أما المسائل الشخصية فلأهل العلم، لا للآلة")
    s.drop(887, 888, 889, 890, 891, 892)
    cols = [
        ("الذكاء الاصطناعي", TURQ, [
            "يلاحظ لحظة الشهادتين في المحادثة، بأي لغة",
            "يفهم السؤال، ويجد جوابه في الكتاب بالمعنى",
            "يشرح بلغة المتعلم، ويذكر مصدر كل جملة",
            "يساعد في تقرير: كتاب أم إنسان؟",
        ]),
        ("البرنامج (قواعد ثابتة)", LIGHT, [
            "يرتّب الدروس ويحفظ التقدّم",
            "يحذف كل جملة بلا مصدر، ويطابق الاقتباسات",
            "ينقل الآيات ومعانيها من مصادرها",
            "يُظهر رقم الطوارئ أولاً عند الخطر",
        ]),
        ("الإنسان", LIGHT, [
            "مركز أصول: كتاب «الوجيز»، مصدرنا الوحيد",
            "المختص الشرعي: يراجع الدروس؛ وما لم يُراجع بعدُ يُعرض بنص الكتاب فقط",
            "المرشد والمرشدة: الأسئلة الشخصية والأزمات",
        ]),
    ]
    w, gap = 513, 40
    for i, (h, col, items) in enumerate(cols):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 465, [para(run(h, 26, col, True), after=14)] +
                  [para(run(t, 19.5, SOFT), bullet=True, after=12, ln=120) for t in items], inset=28)
    callout(s, 148, 885, 1620, 72, [run("القاعدة: ", 20, TURQ, True),
                                     run("الذكاء الاصطناعي مصمَّم ألا يكتب آية، ولا ينقل من الكتاب بنفسه، ولا يفتي: يحيل إلى مرشد، والفتوى لأهلها.", 20, LIGHT)])
    s.notes = ("(20 ث) الذكاء الاصطناعي يفهم المتعلم بلغته ويشرح من الكتاب. البرنامج يفحص وينقل النصوص. "
               "والمسائل الشخصية لأهل العلم.")

    # Algorithms, models and tools -----------------------------------------------------------------------
    s = deck.slide(17)
    header(s, 639, 640, 641, "التقنيات المستخدمة", "الخوارزميات والنماذج والأدوات، وماذا يفعل كلٌّ منها",
           "هذه الشريحة وحدها تحمل المصطلحات التقنية، وبجانب كل مصطلح شرح موجز · الإصدارات والتراخيص في SOURCES.md")
    s.drop(643)
    hdr = lambda t: {"paras": [para(run(t, 18, TURQ, True))], "fill": "242759"}
    cell = lambda t, c=SOFT, b=False, sz=17: {"paras": [para(run(t, sz, c, b), ln=110)], "fill": "161D48"}
    ltr = lambda t: {"paras": [para(run(t, 16, TURQ, raw=True), algn="r", rtl=False, ln=108)], "fill": "161D48"}
    algos = [
        ("لحظة الشهادتين", "علامة خفية يضعها بوت الحوار مع التهنئة", "gpt-5.4-mini (OpenAI)"),
        ("بطاقة التعارف", "استخراج منظّم: يملأ البطاقة من كلام المتعلم، ثم يفحصها برنامج", "gemini-3.5-flash-lite"),
        ("الفرز (router)", "يفهم السؤال ويترجمه، ثم: قائمة كلمات أزمة + تصنيف إلى 7 أنواع", "gemini-3.5-flash-lite"),
        ("البحث الهجين", "BM25 (بحث بالكلمة) + متجهات 768 بُعداً (بحث بالمعنى)", "BM25 · gemini-embedding-2"),
        ("التوليد المقيّد", "كتابة الجواب بشرط: رقم المصدر بعد كل جملة", "gemini-3.8-flash · fallback: gpt-5.4-mini"),
        ("المدقّق (checker)", "قواعد مكتوبة بلا نموذج: يحذف ما لا مصدر له، ويطابق الاقتباسات", "TypeScript rules · no model"),
        ("التقييم", "نموذج مصحّح يحكم على كل جملة؛ وبصمة SHA-256 تكشف أي تغيير في أسئلة الامتحان", "gemini-3.1-pro-preview"),
    ]
    rows = [[hdr("المهمة"), hdr("الخوارزمية، بكلمات بسيطة"), hdr("النموذج أو الأداة")]]
    for comp, algo, tool in algos:
        rows.append([cell(comp, LIGHT, True, 18), cell(algo), ltr(tool)])
    s.add(table(s.ids(), 148, 385, [300, 900, 420], rows, [50] + [58] * len(algos), name="algorithms"))
    s.text(644, ["البرمجيات: Node.js وTypeScript (الخادم) · SQLite (البيانات) · Vue 3 (الواجهة) · Docker (التشغيل) · Python وpoppler (تحويل الكتاب إلى نص)"])
    s.notes = ("(25 ث) فرز بإشارتين، وبحث هجين بالكلمة والمعنى، وتوليد مقيّد بمصدر لكل جملة، ومدقّق برمجي بلا نموذج، "
               "وتقييم بنموذج مصحّح. النماذج: gemini-3.8-flash للكتابة، وflash-lite للفرز، وgemini-embedding-2 للبحث، وgemini-3.1-pro للتصحيح، وgpt-5.4-mini للحوار.")

    # Reliability: four content levels -----------------------------------------------------------
    s = deck.slide(17)
    header(s, 639, 640, 641, "الموثوقية الشرعية", "أربعة أنواع من الأسئلة، ولكل نوع تصرّف ثابت",
           "سؤال الوضوء غير سؤال الزواج الشخصي، فقسّمنا الأسئلة كما في المواد العلمية التي زوّدنا بها منظّمو التحدي")
    s.drop(643)
    hdr = lambda t: {"paras": [para(run(t, 19, TURQ, True))], "fill": "242759"}
    cell = lambda t, c=SOFT, b=False, sz=18: {"paras": [para(run(t, sz, c, b), ln=115)], "fill": "161D48"}
    rows = [
        [hdr("نوع السؤال"), hdr("ماذا يفعل النظام"), hdr("مثال")],
        [cell("العبادات والثوابت", LIGHT, True, 19), cell("ينقل نص الكتاب كما هو: الخطوات بلفظ «الوجيز» وترتيبه، والآية من مصحف Tanzil، ومعناها من QuranEnc."), cell("خطوات الوضوء والصلاة")],
        [cell("مسألة اختلف فيها العلماء", LIGHT, True, 19), cell("يذكر قول «الوجيز»، ثم: لبعض العلماء قول آخر، وما تراه في مسجدك قد يكون قولاً معتبراً عند العلماء."), cell("صفة في الصلاة تختلف عما يراه في مسجده")],
        [cell("ما ليس في الكتاب", LIGHT, True, 19), cell("يعتذر بوضوح: «لم أجد جواب هذا السؤال في الوجيز»، ويعرض زر «تحدث إلى إنسان». ومصمَّم ألا يخمّن."), cell("أنصبة الميراث")],
        [cell("سؤال شخصي أو أزمة", LIGHT, True, 19), cell("مصمَّم ألا يفتي؛ يحوّله إلى مرشد أو مرشدة. وإن كان في خطر على نفسه، يرى رقم الطوارئ في بلده أولاً (988 في أمريكا)."), cell("«زوجتي مسيحية، هل زواجنا صحيح؟»")],
    ]
    s.add(table(s.ids(), 148, 400, [400, 880, 340], rows, [58, 112, 112, 112, 112], name="content levels"))
    s.text(644, ["وتحت كل درس وجواب زر «أبلغ عن خطأ». والدرس الذي لم يراجعه المختص الشرعي بعدُ يُعرض بنص الكتاب وصفحته فقط."])
    s.notes = "(20 ث) العبادات بنص الكتاب، والخلاف بقول الكتاب مع سعة، وما ليس في الكتاب اعتذار وإحالة، والمسائل الشخصية والأزمات إلى إنسان، والطوارئ أولاً."

    # References ---------------------------------------------------------------
    s = deck.slide(17)
    header(s, 639, 640, 641, "المراجع العلمية والشرعية", "كل نص يراه المتعلم له مصدر معتمد نفحصه",
           "في الدين لا يكفي جواب جميل؛ يجب أن يُعرف من أين جاء")
    s.drop(643)
    hdr = lambda t: {"paras": [para(run(t, 18, TURQ, True))], "fill": "242759"}
    cell = lambda t, c=SOFT, b=False, sz=17: {"paras": [para(run(t, sz, c, b), ln=112)], "fill": "161D48"}
    refs = [
        ("«الوجيز: منهج تعليم صفي للمسلم الجديد» (مركز أصول)", "المصدر الوحيد للدروس والأجوبة؛ 10 طبعات بلغات مختلفة، حوّلناها إلى نص بأرقام صفحاته",
         "لكل فقرة رقم صفحتها وبصمة رقمية تكشف أي تغيير؛ والمدقّق يطابق كل اقتباس بنص الكتاب"),
        ("نص المصحف: Tanzil (الرسم العثماني، رواية حفص)", "يضعه البرنامج حين تذكر الفقرة آية",
         "الذكاء الاصطناعي لا يكتب آية؛ تُنقل حرفياً مع ذكر مصدرها"),
        ("ترجمات المعاني: QuranEnc (مجمع الملك فهد، مركز رواد الترجمة)", "تحت كل آية بلغة المتعلم، أو بالإنجليزية",
         "بلا تعديل، مع اسم المترجم لكل لغة"),
        ("سجل مراجعة الدروس (content/review.json)", "من راجع كل درس، ومتى، وكيف",
         "الدروس الحساسة تنتظر توقيع المختص الشرعي؛ وما لم يُراجع يُعرض بنص الكتاب وصفحته فقط"),
    ]
    rows = [[hdr("المرجع"), hdr("أين نستعمله"), hdr("كيف نتحقق منه")]]
    for a, b, c in refs:
        rows.append([cell(a, LIGHT, True, 17.5), cell(b), cell(c)])
    s.add(table(s.ids(), 148, 380, [520, 480, 620], rows, [52] + [88] * len(refs), name="references"))
    callout(s, 148, 830, 1620, 100, [
        run("مراجعة عمياء مستقلة لـ60 جواباً، 30 لكل نظام (أجراها مراجع بالذكاء الاصطناعي على منهج أهل السنة): ", 18, TURQ, True),
        run("نظامنا 23 سليماً، و7 ناقصة، و0 خطأ؛ والنموذج نفسه دون المدقّق 14 سليماً، و15 ناقصة، وخطأ واحد.", 18, LIGHT)])
    s.drop(644)
    s.notes = ("(20 ث) المرجع الوحيد كتاب «الوجيز» لمركز أصول. الآيات من Tanzil والمعاني من QuranEnc ينقلها البرنامج. "
               "ومراجعة عمياء لستين جواباً: نظامنا بلا خطأ، والنموذج نفسه دون المدقّق فيه خطأ واحد و15 ناقصة.")

    # Results (1) (light table) ----------------------------------------------------------------------
    s = deck.slide(21)
    header(s, 732, 733, 734, "النتائج (1): امتحان أغلقناه قبل البناء · 4 أكتوبر", "اقتباسات مطابقة للكتاب: 100% مقابل 92.1%",
           "أغلقنا 200 سؤال قبل البناء، وشغّلنا كلاً منها 3 مرات · وقارنّا بالنموذج نفسه والمقاطع نفسها دون المدقّق والفرز")
    s.drop(731, 735)
    lh = lambda t: {"paras": [para(run(t, 16, "FFFFFF", True), algn="ctr", ln=105)], "fill": VIOLET, "line": L_LINE}
    rows = [[{"paras": [para(run("المقياس", 17, "FFFFFF", True))], "fill": VIOLET, "line": L_LINE},
             lh("نظامنا"), lh("النموذج نفسه والمقاطع نفسها دون المدقّق والفرز")]]
    pick = [0, 1, 9, 3, 4, 5, 6]
    for i, k in enumerate(pick):
        m, a, b = D["results_rows"][k]
        bg = "FAF9FF" if i % 2 else "FFFFFF"
        rows.append([
            {"paras": [para(run(m, 17, L_TEXT))], "fill": bg, "line": L_LINE},
            {"paras": [para(run(a, 18, VIOLET, True), algn="ctr", rtl=False)], "fill": bg, "line": L_LINE},
            {"paras": [para(run(b, 17, L_MUTED), algn="ctr", rtl=False)], "fill": bg, "line": L_LINE},
        ])
    s.add(table(s.ids(), 628, 385, [560, 260, 320], rows, [56] + [56] * len(pick), name="results"))
    tiles = [
        (D["journeys_order"], "ترتيب الدروس صحيح في كل التجارب: 30 متعلماً افتراضياً (محاكاة بالذكاء الاصطناعي، لا بشر) يعودون في 4 أيام"),
        (D["journeys_strict"], f"تجربة صحيحة تماماً ({D['journeys_strict_pct']})؛ وتصبح {D['journeys_by_page']} إن قبلنا أي درس تقع الإجابة في صفحاته"),
        (f"{D['latency_median_s']} ث", f"زمن الجواب المعتاد في امتحان 4 أكتوبر؛ وتكلفة السؤال {D['cost_per_question_usd']}$ في المتوسط"),
    ]
    for i, (v, t) in enumerate(tiles):
        light_card(s, 148, 385 + i * 160, 440, 145, [
            para(run(v, 30, VIOLET, True), rtl=True),
            para(run(t, 15, L_MUTED), before=4, ln=115),
        ], inset=18, anchor="ctr")
    callout(s, 148, 880, 1620, 80, [run(D["results_missed"], 16.5, L_TEXT)], dark=False)
    s.notes = (f"(30 ث) على 200 سؤال أغلقناها قبل البناء: الاقتباسات مطابقة {D['quotes_ours']} مقابل {D['quotes_base']} للنموذج نفسه دون المدقّق. "
               "والأسئلة الحساسة بلا فتوى مع عرض مرشد 98.9% مقابل 81.1%. ومسائل الخلاف بسعة 86.7% مقابل صفر. ونقول ما لم نبلغه: التحويل الفوري 81%.")

    # Results (2) after the full audit (light) ------------------------------------------------------------
    s = deck.slide(21)
    header(s, 732, 733, 734, "النتائج (2): بعد مراجعة شاملة · 6 أكتوبر", "على 150 سؤالاً لم يرها النظام قط: 88.0%",
           "جرّبناه كمستخدمين وأصلحنا ما وجدناه، ثم امتحنّاه · المصحّح gemini-3.1-pro-preview يقارن كل جواب بنص الكتاب")
    s.drop(731, 735)
    hcell = lambda t: {"paras": [para(run(t, 16, "FFFFFF", True), algn="ctr", ln=105)], "fill": VIOLET, "line": L_LINE}
    rows = [[{"paras": [para(run("الأسئلة", 16, "FFFFFF", True))], "fill": VIOLET, "line": L_LINE},
             hcell("هل ضبطنا النظام عليها؟"), hcell("تصرّف صحيح"), hcell("الجواب من الكتاب فقط")]]
    for i, (name, tuned, corr, faith, inv, emerg, hi) in enumerate(D["audit_rows"]):
        bg = "EFEBFF" if hi else ("FAF9FF" if i % 2 else "FFFFFF")
        if name.startswith("أسئلة المراجعة"):
            corr = "83% ← 88% ← 90.8% (258/284)"
        rows.append([
            {"paras": [para(run(name, 16, L_TEXT, True), ln=108)], "fill": bg, "line": L_LINE},
            {"paras": [para(run(tuned, 15, VIOLET if hi else L_MUTED, hi), ln=108)], "fill": bg, "line": L_LINE},
            {"paras": [para(run(corr, 17 if hi else 16, VIOLET, True), algn="ctr", rtl=False, ln=105)], "fill": bg, "line": L_LINE},
            {"paras": [para(run(faith, 16, L_TEXT), algn="ctr", rtl=False)], "fill": bg, "line": L_LINE},
        ])
    s.add(table(s.ids(), 628, 385, [400, 300, 260, 180], rows, [50] + [62] * len(D["audit_rows"]), name="audit results"))
    light_card(s, 628, 715, 1140, 145, [
        para([run("في كل المجموعات: ", 15, VIOLET, True), run("0 أحكام ليست في الكتاب، ورقم الطوارئ أولاً في كل حالة خطر (4/4، 15/15، 6/6، 6/6) · أسئلة المراجعة: الأخطاء الجسيمة 17 ← 9", 15, L_TEXT)], ln=118),
        para([run("لم نبلغه: ", 15, VIOLET, True), run("في الأسئلة المغلقة صار التحويل الفوري للحساسة 86.7% (26/30)، والهدف 100%؛ وقلّ الاعتذار عمّا ليس في الكتاب من 91.1% إلى 83.3%، لأنه صار يجيب الجزء الموجود في الكتاب.", 15, L_TEXT)], before=6, ln=118),
    ], inset=16, anchor="ctr")
    tiles = [
        (D["shahada_convs"], f"محادثة شهادة من 20 نوعاً: تظهر الدروس حين يجب ولا تظهر حين لا يجب؛ و{D['shahada_live']} على الموقع الحي"),
        (D["use_cases"], f"تجربة كما يجرّب مستخدم حقيقي (284 سؤالاً، ونحو 125 في صفحة المتعلم، و68 في منصة المرشدين)؛ و{D['findings']} ملاحظة أصلحناها كلها"),
        (D["m_safety"], "في أسئلة M التي لم يرها قط: كل أسئلة الإحالة والأزمة والطوارئ وما ليس في الكتاب"),
    ]
    for i, (v, t) in enumerate(tiles):
        light_card(s, 148, 385 + i * 160, 440, 145, [
            para(run(v, 28, VIOLET, True), rtl=True),
            para(run(t, 14.5, L_MUTED), before=4, ln=112),
        ], inset=16, anchor="ctr")
    callout(s, 148, 880, 1620, 80, [run("بصراحة: ", 16, VIOLET, True), run(
        "ضبطنا النظام على أسئلة التطوير والمراجعة وK (K وM مجموعتان من الأسئلة الجديدة). الأسئلة المغلقة لم نلمسها، وM لم نرها قبل تشغيلها الوحيد. "
        "ومن 18 خطأً في M، كانت 10 اعتذارات عن أسئلة جوابها في الكتاب. لم نخفّف المعيار لنرفع الرقم.", 15.5, L_TEXT)], dark=False)
    s.notes = ("(30 ث) بعد المراجعة الشاملة: على 150 سؤالاً لم يرها النظام قط، 88% تصرّف صحيح، وصفر أحكام ليست في الكتاب، و51 من 51 في الإحالة والأزمات. "
               "وأسئلة المراجعة من 83% إلى 90.8%، والأخطاء الجسيمة من 17 إلى 9. ونقول بصراحة ما ضبطنا عليه النظام وما لم يره.")

    # Originality vs alternatives -------------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "الأصالة والقيمة المضافة", "لماذا لا يكفي ملف PDF أو بوت عام؟",
           "هذه هي البدائل التي يجدها المسلم الجديد اليوم، وما ينقصها")
    s.drop(887, 888, 889, 890, 891, 892)
    alts = [
        ("المنصة قبل المشروع", "لا درس داخل المحادثة، لأن الذكاء الاصطناعي ممنوع من تعليم العبادة من عنده.",
         "أول درس موثّق يبدأ فوراً، في المحادثة نفسها، بلغة المتعلم."),
        ("ملف PDF أو بحث نصي", "لا يعرف أين توقف القارئ، ولا يحاوره بلغته، ولا يذكّره بشيء.",
         "منهج يحفظ تقدّمه، ودرس كل يوم بتذكير، وجواب على سؤاله برقم الصفحة."),
        ("النموذج نفسه دون المدقّق والفرز", "قد ينسب إلى الكتاب ما ليس فيه، وقد يفتي في أمر شخصي.",
         f"مقيس على 200 سؤال: اقتباسات مطابقة {D['quotes_ours']} مقابل {D['quotes_base']}، وحساسة بلا فتوى 98.9% مقابل 81.1%، والخلاف بسعة 86.7% مقابل 0%."),
    ]
    w, gap = 513, 40
    for i, (h, lim, add) in enumerate(alts):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 450, [
            para(run(h, 24, LIGHT, True)),
            para(run("ما ينقصه", 16, MUTED, True), before=18),
            para(run(lim, 18, SOFT), before=4, ln=125),
            para(run("ما نقدّمه", 16, TURQ, True), before=22),
            para(run(add, 18, LIGHT), before=4, ln=125),
        ], inset=28)
    callout(s, 148, 880, 1620, 76, [run("الجديد: ", 20, TURQ, True),
                                     run("الشهادتان بداية منهج لا نهاية محادثة، في منصة يزورها غير المسلمين فعلاً، لا في تطبيق جديد ينتظر زواره.", 20, LIGHT)])
    s.notes = "(15 ث) الفرق عن البدائل: يبدأ التعليم فوراً في المكان نفسه، ويستمر، ولا ينسب إلى الكتاب ما ليس فيه، والفرق مقيس."

    # 11 Content & languages -----------------------------------------------------------------------
    s = deck.slide(27)
    header(s, 860, 861, 862, "المحتوى واللغات", "كتاب واحد موثوق، يصل إلى المتعلم بلغته",
           "الدروس من «الوجيز»، والقرآن ومعانيه من مصادرها، ولا يخترع الذكاء الاصطناعي نصاً دينياً")
    book, cap, target, robot = s.rel_of(870), s.rel_of(867), s.rel_of(873), s.rel_of(864)
    for pic_id, rid in ((864, book), (867, cap), (870, target), (873, robot)):
        s.find(pic_id).find(".//a:blip", NS).set(f"{{{NS['r']}}}embed", rid)
    elems = [
        (865, 866, f"«الوجيز»: {D['book_editions']} طبعات", ["نص بأرقام صفحاته، يُقرأ كاملاً، بعشر لغات"]),
        (868, 869, f"{D['lessons']} درساً في {D['units']} وحدات", "جمل قصيرة مرقّمة، وأسئلة وتمارين من الكتاب نفسه"),
        (871, 872, "القرآن الكريم", f"نص مصحف Tanzil، ومعانيه من QuranEnc ب{D['quranenc_languages']}، و«استمع وردّد»"),
        (874, 875, "بقية اللغات", "يُجاب من النص العربي أو الإنجليزي، مع تنبيه: «شرح مترجم آلياً، والأصل مرفق»"),
    ]
    for t_id, b_id, t, b in elems:
        s.text(t_id, [t])
        el = s.find(b_id).find(".//a:off", NS)
        s.move(b_id, int(el.get("x")) / EMU, 745, 370, 220)
        s.text(b_id, b if isinstance(b, list) else [b], size=19)
    s.notes = "(15 ث) المصدر واحد: الوجيز بعشر طبعات. والقرآن من Tanzil وترجمات QuranEnc. وبقية اللغات ترى الأصل مع شرح مترجم بوسم واضح."

    # 12 Operations & continuation -----------------------------------------------------------------
    s = deck.slide(11)
    header(s, 537, 538, 539, "التشغيل", f"يعمل الآن، والسؤال الواحد بـ{D['cost_per_question_usd']}$",
           "مشروع يُراد به نفع الناس ينبغي أن يبقى حياً بعد التحدي، دون أن يرهق الجمعية")
    s.drop(541, 542, 543, 544, 545, 546, 547, 548)
    for i, (v, t) in enumerate([
        (f"{D['cost_per_question_usd']}$", "متوسط تكلفة السؤال الواحد"),
        (f"{D['latency_live_s']} ث", f"زمن الجواب المعتاد على الموقع الحي (150 سؤالاً لم يرها)؛ و90% في {D['latency_live_p90_s']} ث أو أقل"),
    ]):
        dark_card(s, 148, 400 + i * 245, 470, 225, [
            para(run(v, 46, TURQ, True), algn="ctr", rtl=False),
            para(run(t, 18, SOFT), algn="ctr", before=6, ln=115),
        ], anchor="ctr")
    now = [
        "الدروس كاملة: 19 درساً، والأسئلة، والإحالة، والكتاب كاملاً",
        "الحساب بـ Google أو برابط البريد، والتذكير اليومي",
        "منصة المرشدين: الطلبات، وتنبيه الأزمات، وتذكير المرشد بالرد",
        "الدرس الذي لم يُراجع بعدُ يُعرض بنص الكتاب وصفحته فقط",
        "إن تعطّل مزوّد الذكاء الاصطناعي، حلّ محلّه مزوّد احتياطي",
    ]
    dark_card(s, 660, 400, 1108, 465, [para(run("يعمل الآن على الموقع", 26, TURQ, True), after=14)] +
              [para(run(t, 20, LIGHT), bullet=True, after=12, ln=115) for t in now], inset=30)
    callout(s, 148, 890, 1620, 66, [run("بعد التحدي: ", 19, TURQ, True),
                                     run("يراجع المختص الشرعي بقية الدروس، ويتسلّم فريق أصول منصة المرشدين.", 19, LIGHT)])
    s.notes = ("(15 ث) يعمل الآن: الدروس كاملة، والحساب والتذكير، ومنصة المرشدين، ومزوّد احتياطي. "
               "وبعد التحدي: مراجعة بقية الدروس، وتشغيل فريق المرشدين من أصول.")

    # 13 Disclosure: built vs existing -----------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "الإفصاح", "ما بنيناه في أيام التحدي، وما كان موجوداً قبله",
           "ليُقيَّم الجديد وحده. والتحقق ممكن: نسخة مؤرّخة قبل التحدي (علامة Git)، ولكل تعديل بعدها تاريخه")
    s.text(887, [f"بُني خلال {D['built_dates']} (يُقيَّم)"])
    s.text(888, [f"كل ما في المستودع، وتعديل من {D['patch_lines']} سطراً لربطه بالمنصة"], size=19)
    s.drop(891, 892)
    s.add(shape(s.ids(), 1018, 615, 750, 255, [para(run(t, 16, SOFT), after=7, ln=112) for t in [
        "للمتعلم: البطاقة، الدروس، الكتاب كاملاً، الأسئلة، «استمع وردّد»، الإحالة، التذكير",
        "منصة المرشدين: الطلبات، تنبيه الأزمات، عدّاد الرد، المحادثة، الأرقام، الحماية",
        f"الفرز، والبحث في الكتاب، والمدقّق، وتحويل {D['book_editions']} طبعات من «الوجيز» إلى نص",
            ]]))
    s.text(889, ["موجود قبل التحدي (لا نطلب تقييمه)"])
    s.text(890, ["منصة theislam.chat لجمعية أصول، تعمل منذ أكتوبر 2024 (علامة Git: pre-challenge-2026-10-03)"], size=19)
    s.add(shape(s.ids(), 148, 620, 750, 240, [para(run(t, 18, SOFT), after=14, ln=115) for t in [
        "الواجهة، والمحادثة الصوتية، وزر «تحدث إلى إنسان»",
        "تعليمات الحوار الدعوي قبل الشهادة",
        "ولم نستعمل نص أي محادثة حقيقية في الكود أو الاختبار أو العرض",
    ]]))
    callout(s, 148, 880, 1620, 80, [run("ولا ندّعي ", 17, TURQ, True),
                                     run("أن فهم مسلمين جدد حقيقيين قد تحسّن؛ فلم نقسه بعد. وكل ما سبق من أرقام هو من اختبارات، لا من متعلمين حقيقيين.", 17, LIGHT)])
    s.notes = f"(20 ث) الجديد هو الوحدة كلها ومنصة المرشدين ورقعة دمج من {D['patch_lines']} سطراً. المنصة نفسها قائمة قبل التحدي ولا نطلب تقييمها."

    # 14 Team --------------------------------------------------------------------------------------
    s = deck.slide(19)
    header(s, 688, 689, 690, "الفريق", "الفريق الذي بنى المشروع", "من جمعية أصول، أصحاب theislam.chat")
    s.drop(692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703)
    w, gap = 300, 30
    team = [(TEAM_NAMES[0], "قائد الفريق", "مدير الفريق"),
            (TEAM_NAMES[1], "عضو", "فريق التأسيس"),
            (TEAM_NAMES[2], "عضو", "مبرمج")]
    w, gap = 480, 90
    for i, (name, role, does) in enumerate(team):
        x = 1768 - w - i * (w + gap)
        dark_card(s, x, 395, w, 460, None)
        s.add(shape(s.ids(), x + (w - 150) / 2, 425, 150, 150, [para(run(f"0{i + 1}", 34, TURQ, True), algn="ctr")],
                    fill=VIOLET, alpha=35, line=TURQ, line_alpha=60, line_w=1.5, geom="ellipse", anchor="ctr"))
        s.add(shape(s.ids(), x + 20, 600, w - 40, 300, [
            *([para(run(name, 25, LIGHT, True), algn="ctr", before=10)] if name else []),
            para(run(role, 23 if not name else 19, TURQ, True), algn="ctr", before=16 if name else 4, ln=110),
            para(run(does, 16, SOFT), algn="ctr", before=8, ln=120),
        ]))
    s.notes = "(10 ث) الفريق: محمد عاشور (قائد الفريق)، وباسل الفوزان (فريق التأسيس)، ومحمد يمان غيبه (مبرمج)."

    # Links ----------------------------------------------------------------------------------------
    s = deck.slide(28)
    header(s, 883, 884, 885, "الروابط", "ابدأ من لحظة الشهادتين: ثلاث دقائق تكفي", "كل ما يحتاجه المحكّم ليجرّب ويتحقق، في ثلاثة روابط")
    s.drop(887, 888, 889, 890, 891, 892)
    links = [
        ("التجربة الحية", "تبدأ من لحظة الشهادة؛ وتحتها رابط النسخة الإنجليزية", [D["demo_url"], D["demo_url"].replace("/ar?", "/en?")]),
        ("منصة فريق المتابعة (المرشدين)", "حساب المشرف التجريبي؛ وكلمة المرور نفسها لحسابي المرشد والمرشدة التجريبيين",
         [D["mentor_url"], f"{D['mentor_user']}  /  {D['mentor_pass']}"]),
        ("المستودع على GitHub", "الكود والتقييم الكامل (docs/evaluation.md) والمصادر (SOURCES.md)", [D["repo_url"]]),
    ]
    for i, (h, desc, urls) in enumerate(links):
        y = 390 + i * 160
        dark_card(s, 148, y, 1620, 140, None)
        s.add(shape(s.ids(), 1060, y + 14, 680, 112, [
            para(run(h, 24, LIGHT, True)),
            para(run(desc, 16, SOFT), before=6, ln=115),
        ], anchor="ctr"))
        s.add(shape(s.ids(), 180, y + 14, 860, 112,
                    [para(run(u, 22 if k == 0 else 19, TURQ if k == 0 else LIGHT, k == 0, raw=True), algn="l", rtl=False, before=0 if k == 0 else 6) for k, u in enumerate(urls)],
                    anchor="ctr"))
    callout(s, 148, 880, 1620, 76, [run("في 3 دقائق: ", 18, TURQ, True),
                                     run("«ابدأ رحلتك» ← اسأل «كيف أتوضأ؟» ← اسأل سؤالاً شخصياً فيُحال إلى مرشد ← «تصفّح الكتاب كاملاً» ← افتح الطلب في منصة المرشدين", 18, LIGHT)])
    s.notes = "(10 ث) الروابط: التجربة الحية من لحظة الشهادة، ومنصة المرشدين بحساب المشرف التجريبي، والمستودع العام بالكود والتقييم."

    # 15 Thanks ------------------------------------------------------------------------------------
    s = deck.slide(31)
    s.text(915, ["لا تكون الشهادتان آخرَ رسالة… بل أوّلَ درس. نسأل الله الثبات لمن نطق بهما"])
    s.text(916, [f"{D['link']}  ·  {D['repo']}"])
    s.notes = "شكراً. التجربة الحية على الرابط، والمستودع والتقرير الكامل متاحان."

    order = [0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 20, 13, 14, 15, 16, 17, 18, 19, 8, 21, 22, 23, 24, 25, 26]
    deck.slides = [deck.slides[i] for i in order]
    deck.save(OUT)
    print(f"wrote {OUT} ({len(deck.slides)} slides)")


if __name__ == "__main__":
    build(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TEMPLATE)
