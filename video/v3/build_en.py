"""English learning-space variant of build.py: python3 build_en.py video -> seg/film_v_en.mp4 (rebuilds b15,b16 only).
Assemble v3: python3 build.py  ->  ../out/after-the-shahada-v3.mp4
Needs: timeline.json (plan.py), vo/ (plan.py), gfx/ (gfx.mjs), raw/ (rec_*.mjs, shots_lang.mjs), sfx/ (sfx.py)."""
import json, subprocess, pathlib, sys, os
R = pathlib.Path(__file__).parent
FF = "/opt/anaconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
TL = json.load(open(R / "timeline.json")); BT = {b["id"]: b for b in TL["beats"]}
D = lambda i: BT[i]["end"] - BT[i]["start"]
M = {n: json.load(open(R / f"raw/{n}.json")) for n in ["phone", "ls", "ls_en", "learner", "crisis", "mentor"]}
SEG = R / "seg"; SEG.mkdir(exist_ok=True)
FPS = 25
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
def run(*a): subprocess.run([FF, "-y", "-loglevel", "error", *a], check=True)

# ---------- pieces: each makes a 1920x1080 clip of exact duration ----------
def desk(out, src, t0, t1, dur, z0=1.0, z1=1.08, cx=0.5, cy=0.5, extra=""):
    pre = "crop=1600:900:0:0," if ("learner" in src or "old/" in src) else ""
    """Desktop recording (1600x900 content in a 1920x1080 frame): crop, upscale, time-fit, slow zoom toward (cx,cy)."""
    n = round(dur * FPS); sp = dur / (t1 - t0)
    z = f"{z0}+({z1}-{z0})*on/{max(1, n - 1)}"
    vf = (f"{pre}scale=2880:1620:flags=lanczos,setpts={sp:.5f}*(PTS-STARTPTS),fps={FPS},"
          f"zoompan=z='{z}':x='(iw-iw/zoom)*{cx}':y='(ih-ih/zoom)*{cy}':d=1:s=1920x1080:fps={FPS}{extra},trim=end_frame={n}")
    run("-ss", f"{t0:.3f}", "-t", f"{(t1 - t0) + 0.5:.3f}", "-i", str(R / src), "-vf", vf, "-frames:v", str(n), *ENC, str(out))

def phone(out, src, t0, t1, dur, y0=760, h=1104, z0=1.0, z1=1.02, sat=1.0, desat_ramp=0, still=None):
    """Phone recording (860x1864) cropped to the locked frame, as a rounded panel on the brand background."""
    n = round(dur * FPS); sp = dur / max(0.04, (t1 - t0))
    inp = ["-loop", "1", "-i", str(R / still)] if still else ["-ss", f"{t0:.3f}", "-t", f"{(t1 - t0) + 0.5:.3f}", "-i", str(R / src)]
    sat_f = f",hue=s='1-{desat_ramp}*min(t\\,1)'" if desat_ramp else (f",hue=s={sat}" if sat != 1 else "")
    tm = "" if still else f",setpts={sp:.5f}*(PTS-STARTPTS)"
    fc = (f"[0:v]crop=860:{h}:0:{y0},scale=780:1000:force_original_aspect_ratio=increase:flags=lanczos,crop=780:1000:(iw-780)/2:0{tm},fps={FPS}{sat_f},format=rgba[p];"
          f"[2:v]format=gray,scale=780:1000[m];[p][m]alphamerge[pm];"
          f"[1:v][pm]overlay=170:40:shortest=0[a];[a][3:v]overlay=170:40[b];"
          f"[b]zoompan=z='{z0}+({z1}-{z0})*on/{max(1, n - 1)}':x='(iw-iw/zoom)*0.3':y='(ih-ih/zoom)*0.5':d=1:s=1920x1080:fps={FPS},trim=end_frame={n}[v]")
    run(*inp, "-loop", "1", "-i", str(R / "gfx/bg.png"), "-loop", "1", "-i", str(R / "gfx/phonemask.png"), "-loop", "1", "-i", str(R / "gfx/phoneframe.png"),
        "-filter_complex", fc.replace("[2:v]format=gray,scale=780:1000", "[2:v]crop=780:1000:0:0,format=gray"), "-map", "[v]", "-frames:v", str(n), *ENC, str(out))

def phone_png(out, png, dur, y0=0, h=1864, **kw):
    phone(out, None, 0, dur, dur, y0=y0, h=h, still=png, **kw)

def seq(out, folder, dur):
    n = round(dur * FPS)
    run("-framerate", str(FPS), "-i", str(R / folder / "%05d.png"), "-vf", f"format=yuv420p,tpad=stop_mode=clone:stop_duration=2,trim=end_frame={n}", "-frames:v", str(n), *ENC, str(out))

def still(out, png, dur, fade_in=0.3):
    n = round(dur * FPS)
    run("-loop", "1", "-i", str(R / png), "-vf", f"fps={FPS},format=yuv420p,fade=t=in:st=0:d={fade_in}", "-frames:v", str(n), *ENC, str(out))

def testimonial(out, dur):
    n = round(dur * FPS)
    fc = ("[0:v]split[a][b];[a]scale=1920:-2,crop=1920:1080,boxblur=40:2,eq=brightness=-0.25:saturation=0.8[bg];"
          "[b]crop=480:640:0:0,scale=-2:900:flags=lanczos[fg];[fg]pad=iw+6:ih+6:3:3:color=white@0.25[fgp];"
          f"[bg][fgp]overlay=(W-w)/2+180:24,fps={FPS},fade=t=in:st=0:d=0.24,fade=t=out:st={dur - 0.24:.2f}:d=0.24[v]")
    run("-ss", "44", "-t", f"{dur + 0.3:.2f}", "-i", str(R / "raw/brown.mp4"), "-filter_complex", fc, "-map", "[v]", "-frames:v", str(n), *ENC, str(out))

def concat(out, parts):
    lst = out.with_suffix(".txt"); lst.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
    run("-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out))

def track(items, total, tag):
    """Pre-composite transparent stills (png, start, end) into one ffconcat track."""
    from PIL import Image
    cuts = sorted({0.0, round(total, 3)} | {round(min(max(x, 0), total), 3) for it in items for x in it[1:3]})
    d = SEG / f"ov_{tag}"; d.mkdir(exist_ok=True); lines = ["ffconcat version 1.0"]; cache = {}; f = None
    for k in range(len(cuts) - 1):
        a, b = cuts[k], cuts[k + 1]
        if b - a < 0.01: continue
        act = tuple(it[0] for it in items if it[1] <= a + 0.005 and it[2] >= b - 0.005)
        if act not in cache:
            im = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
            for p in act: im.alpha_composite(Image.open(R / p).convert("RGBA"))
            cache[act] = d / f"{len(cache):03d}.png"; im.save(cache[act])
        f = cache[act]; lines += [f"file '{f}'", f"duration {b - a:.3f}"]
    lines.append(f"file '{f}'")
    p = d / "track.ffconcat"; p.write_text("\n".join(lines) + "\n"); return p

def dur_of(p):
    r = subprocess.run([FF, "-i", str(p)], capture_output=True, text=True).stderr
    h, m, s_ = r.split("Duration: ")[1].split(",")[0].split(":"); return int(h) * 3600 + int(m) * 60 + float(s_)

def overlays(out, base, items):
    """items: (png, start, end[, fade]) stills, or a gfx/<seq> folder (starts at its start time)."""
    total = dur_of(base); cur = base
    for k, (src, a, b, *_) in enumerate([i for i in items if (R / i[0]).is_dir()]):
        tmp = out.with_name(out.stem + f"_s{k}.mp4")
        run("-i", str(cur), "-framerate", str(FPS), "-i", str(R / src / "%05d.png"),
            "-filter_complex", f"[1:v]format=rgba,setpts=PTS+{a:.3f}/TB[o];[0:v][o]overlay=0:0:eof_action=pass,format=yuv420p[v]", "-map", "[v]", *ENC, str(tmp)); cur = tmp
    st = [i for i in items if not (R / i[0]).is_dir()]
    if not st:
        run("-i", str(cur), "-c", "copy", str(out)); return
    tr = track(st, total, out.stem); mov = tr.with_suffix(".mov")
    run("-f", "concat", "-safe", "0", "-i", str(tr), "-vf", f"fps={FPS},format=rgba", "-t", f"{total:.3f}", "-c:v", "qtrle", str(mov))
    run("-i", str(cur), "-i", str(mov),
        "-filter_complex", f"[0:v][1:v]overlay=0:0:eof_action=repeat,format=yuv420p[v]", "-map", "[v]", "-t", f"{total:.3f}", *ENC, str(out))

# ---------- beats ----------
P, LS, LE, CR, MT = "raw/phone.webm", "raw/ls_en.webm", "raw/learner.webm", "raw/crisis.webm", "raw/mentor.webm"
pm, lm = M["phone"], M["ls_en"]
def S(name):
    # English variant: b15/b16 and the joined film get *_en names; every other beat reuses the existing segments.
    if name.startswith(("b15", "b16", "joined", "film_v")):
        p = pathlib.Path(name); name = p.stem + "_en" + p.suffix
    return SEG / name
build = {}

def b01():
    d = D("b01"); a = S("b01_raw.mp4")
    phone(a, P, pm["type_start"] - 0.1, pm["congrat"] + 0.7, d - 0.24)
    run("-i", str(a), "-vf", "tpad=stop_mode=clone:stop_duration=0.24", *ENC, str(S("b01_p.mp4")))
    overlays(S("b01.mp4"), S("b01_p.mp4"), [("gfx/b01_a.png", 0.3, 2.0, 0.15), ("gfx/b01_b.png", 2.0, d + 0.1, 0.01)])
def b02():
    d = D("b02"); phone(S("b02_p.mp4"), P, pm["congrat"] + 1.2, pm["silence_start"] - 0.2, d, z0=1.0, z1=1.02)
    overlays(S("b02.mp4"), S("b02_p.mp4"), [("gfx/b02.png", 0.4, d - 0.1)])
def b03():
    d = D("b03"); v = 1.7
    desk(S("b03_a.mp4"), LS, lm["chat"] + 0.2, lm["chat"] + 4.0, d - v, z0=1.0, z1=1.1, cx=0.6, cy=0.45)
    phone(S("b03_b.mp4"), P, pm["voice"] + 0.2, pm["voice"] + 2.2, v, y0=300, h=1300)
    concat(S("b03_p.mp4"), [S("b03_a.mp4"), S("b03_b.mp4")])
    overlays(S("b03.mp4"), S("b03_p.mp4"), [("gfx/b03_name.png", 0.4, d - 0.1)])
def b04():
    d = D("b04"); q = d / 4
    phone_png(S("b04_1.mp4"), "raw/lang_sw.png", q, y0=300, h=1300, z1=1.03)
    phone_png(S("b04_2.mp4"), "raw/lang_ja.png", q, y0=0, h=1300, z1=1.03)
    phone(S("b04_3.mp4"), P, pm["voice"] + 0.3, pm["voice"] + 2.0, q, y0=300, h=1300)
    desk(S("b04_4a.mp4"), LS, lm["lesson1"] + 0.5, lm["lesson1"] + 2.5, q, z0=1.05, z1=1.12, cx=0.6, cy=0.3)
    overlays(S("b04_4.mp4"), S("b04_4a.mp4"), [("gfx/shade_right.png", 0, q + 1, 0.01)])
    concat(S("b04_p.mp4"), [S(f"b04_{i}.mp4") for i in range(1, 5)])
    overlays(S("b04.mp4"), S("b04_p.mp4"), [("gfx/b04_tag_sw.png", 0, q, 0.1), ("gfx/b04_tag_ja.png", q, 2 * q, 0.1), ("gfx/b04_tag_fi.png", 2 * q, 3 * q, 0.1),
                                            ("gfx/b04_tag_ar.png", 3 * q, d, 0.1), ("gfx/b04_num", 0, d)])
def b05():
    d = D("b05"); testimonial(S("b05_p.mp4"), d)
    overlays(S("b05.mp4"), S("b05_p.mp4"), [("gfx/b05_name.png", 0.4, d - 0.3)])
def b06():
    d = D("b06"); phone(S("b06_p.mp4"), P, pm["congrat"] + 1.5, pm["silence_start"] - 0.1, d, y0=560, h=1304, z0=1.0, z1=1.03)
    overlays(S("b06.mp4"), S("b06_p.mp4"), [("gfx/b06.png", 0.3, d - 0.15)])
def b06q(): still(S("b06q.mp4"), "gfx/b06q.png", D("b06q"), 0.35)
def b07():
    d = D("b07"); phone(S("b07_p.mp4"), P, pm["silence_start"] + 0.3, pm["silence_start"] + 0.3 + d, d, desat_ramp=0.3)
    overlays(S("b07.mp4"), S("b07_p.mp4"), [("gfx/b07.png", 0.15, d - 0.05)])
def b08():
    d = D("b08"); t = pm["silence_start"] + 0.3 + D("b07")
    phone(S("b08_p.mp4"), P, t, min(t + d, pm["card"] - 0.1), d, sat=0.7)
    overlays(S("b08.mp4"), S("b08_p.mp4"), [("gfx/b08.png", 0.2, d - 1.0)])
def b09(): seq(S("b09.mp4"), "gfx/b09", D("b09") + D("b10"))
def b11(): seq(S("b11.mp4"), "gfx/b11", D("b11") + D("b12"))
def b13(): seq(S("b13.mp4"), "gfx/b13", D("b13"))
def b14():
    d = D("b14"); s = BT["b14"]["sent"][0]; card_at = (s["start"] - BT["b14"]["start"]) + s["dur"] * 0.38
    a = max(0.6, card_at - 0.2); b = 1.9; c = 1.0; e = d - a - b - c
    phone(S("b14_1.mp4"), P, pm["card"] - a - 0.1, pm["card"] - 0.1, a)
    phone(S("b14_2.mp4"), P, pm["card"] - 0.1, pm["card"] + 2.6, b)
    phone(S("b14_3.mp4"), P, pm["ls_open"] - 3.4, pm["ls_open"] - 2.0, c, y0=0, h=1300)
    phone(S("b14_4.mp4"), P, pm["signin"] + 0.4, pm["signin"] + 0.4 + e, e, y0=0, h=1300)
    concat(S("b14_p.mp4"), [S(f"b14_{i}.mp4") for i in range(1, 5)])
    overlays(S("b14.mp4"), S("b14_p.mp4"), [("gfx/b14_a.png", a, a + b + c - 0.05), ("gfx/b14_b.png", a + b + c, d - 0.05)])
def b15():
    d = D("b15"); w = [2.4, 2.0, 2.4, 1.0, 1.0]; k = d / sum(w); w = [x * k for x in w]
    desk(S("b15_1.mp4"), LS, lm["book"] + 0.5, lm["book"] + 4.0, w[0], z0=1.0, z1=1.12, cx=0.55, cy=0.2)
    desk(S("b15_2.mp4"), LS, lm["lesson1"] + 0.3, lm["lesson1"] + 2.6, w[1], z0=1.1, z1=1.18, cx=0.75, cy=0.15)
    desk(S("b15_3.mp4"), LS, lm["choices"] + 0.3, lm["chose_wudu"] + 1.6, w[2], z0=1.0, z1=1.06, cx=0.4, cy=0.4)
    desk(S("b15_4.mp4"), LE, M["learner"]["listen"] + 74, M["learner"]["listen"] + 75.5, w[3], z0=1.5, z1=1.6, cx=0.45, cy=0.6)
    desk(S("b15_5.mp4"), LS, lm["exercises"] - 0.2, lm["exercises"] + 1.8, w[4], z0=1.3, z1=1.38, cx=0.5, cy=0.45)
    concat(S("b15_p.mp4"), [S(f"b15_{i}.mp4") for i in range(1, 6)])
    c = [0]; [c.append(c[-1] + x) for x in w]
    overlays(S("b15.mp4"), S("b15_p.mp4"), [("gfx/b15_1.png", 0.15, c[1]), ("gfx/b15_2.png", c[1] + 0.05, c[2]), ("gfx/b15_3.png", c[2] + 0.05, c[3]),
                                            ("gfx/b15_4.png", c[3] + 0.05, d - 0.05)])
def b16():
    d = D("b16"); card = 3.5; avail = d - card; w = [avail * f for f in (0.17, 0.17, 0.17, 0.24)]; rest = avail - sum(w)
    st = 110.08  # stage labels are legible in the first (older) take: raw/old/ls.webm
    OLD = "raw/old/ls.webm"
    desk(S("b16_1.mp4"), OLD, st + 0.4, st + 1.4, w[0], z0=2.6, z1=2.65, cx=0.0, cy=0.05)
    desk(S("b16_2.mp4"), OLD, st + 2.6, st + 3.6, w[1], z0=2.6, z1=2.65, cx=0.0, cy=0.05)
    desk(S("b16_3.mp4"), OLD, st + 4.6, st + 5.6, w[2], z0=2.6, z1=2.65, cx=0.0, cy=0.05)
    desk(S("b16_4.mp4"), LS, lm["ask1_answer"] - 6, lm["ask1_answer"] - 3, w[3], z0=2.3, z1=2.4, cx=0.0, cy=0.15)
    desk(S("b16_5.mp4"), LS, lm["verse"] + 0.3, lm["verse"] + 2.0, rest, z0=1.6, z1=1.7, cx=0.55, cy=0.62)
    desk(S("b16_6.mp4"), LS, lm["ask2_answer"] - 2, lm["ask2_answer"] + 2, card, z0=2.2, z1=2.3, cx=0.0, cy=0.3)
    concat(S("b16_p.mp4"), [S(f"b16_{i}.mp4") for i in range(1, 7)])
    t5 = sum(w)
    overlays(S("b16.mp4"), S("b16_p.mp4"), [("gfx/b16_a.png", 0.2, t5 - 0.05), ("gfx/b16_tag.png", t5, t5 + rest - 0.05), ("gfx/b16_card.png", d - card, d, 0.3)])
def b17():
    d = D("b17"); x = d / 3; L = M["learner"]
    desk(S("b17_1.mp4"), LE, L["personal"] + 0.2, L["personal"] + 3.0, x * 0.4, z0=2.2, z1=2.25, cx=0.0, cy=1.0)
    desk(S("b17_2.mp4"), LE, 127.5, 131.0, x * 0.6, z0=2.3, z1=2.35, cx=0.0, cy=0.1)
    desk(S("b17_3.mp4"), MT, M["mentor"]["inbox"] - 0.5, M["mentor"]["inbox"] + 3, x * 0.5, z0=1.15, z1=1.22, cx=0.7, cy=0.2)
    desk(S("b17_4.mp4"), MT, M["mentor"]["case"] + 0.1, M["mentor"]["case"] + 2.0, x * 0.5, z0=1.2, z1=1.28, cx=0.6, cy=0.1)
    desk(S("b17_5.mp4"), CR, M["crisis"]["ask"] + 0.6, M["crisis"]["ask"] + 2.0, x * 0.3, z0=2.3, z1=2.35, cx=0.0, cy=0.08)
    desk(S("b17_6.mp4"), CR, M["crisis"]["banner"] - 3, M["crisis"]["banner"] + 1, x * 0.7, z0=2.3, z1=2.4, cx=0.0, cy=0.12)
    concat(S("b17_p.mp4"), [S(f"b17_{i}.mp4") for i in range(1, 7)])
    overlays(S("b17.mp4"), S("b17_p.mp4"), [("gfx/b17_1.png", 0.2, x - 0.05), ("gfx/b17_2.png", x + 0.05, 2 * x - 0.05), ("gfx/b17_3.png", 2 * x + 0.05, d - 0.05)])
def b18():
    d = D("b18"); s1 = BT["b18"]["sent"][1]["start"] - BT["b18"]["start"]; url = max(0.5, 113.0 - BT["b18"]["start"])
    phone(S("b18_p.mp4"), P, pm["card_held"] - 0.4, pm["card_held"] - 0.3, d, z0=1.0, z1=1.06)
    overlays(S("b18.mp4"), S("b18_p.mp4"), [("gfx/b18_a.png", 0.3, s1, 0.2), ("gfx/b18_b.png", s1, d - 0.05, 0.01), ("gfx/b18_url.png", url, d)])
def b19(): seq(S("b19.mp4"), "gfx/b19", D("b19"))

ORDER = ["b01", "b02", "b03", "b04", "b05", "b06", "b06q", "b07", "b08", "b09", "b11", "b13", "b14", "b15", "b16", "b17", "b18", "b19"]
DEMO = ["b01", "b02", "b03", "b04", "b06", "b07", "b08", "b14", "b15", "b16", "b17", "b18"]

def video():
    only = [a for a in sys.argv[2:]] or ["b15", "b16"]
    for b in ORDER:
        if not only or b in only:
            globals()[b](); print("seg", b, flush=True)
    concat(S("joined.mp4"), [S(f"{b}.mp4") for b in ORDER])
    # subtitles + demo corner label over the whole film
    subs = json.load(open(R / "gfx/subs.json"))
    items = [(s["png"], s["start"], min(s["end"], TL["total"]), 0.12) for s in subs]
    for b in DEMO:
        bb = BT[b]; items.append(("gfx/corner.png", bb["start"] + 0.02, bb["end"] - 0.02, 0.01))
    overlays(S("film_v.mp4"), S("joined.mp4"), items)

if __name__ == "__main__":
    {"video": video}[sys.argv[1]]()
