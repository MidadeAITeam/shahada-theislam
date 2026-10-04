"""Assemble the 2-minute video: cards + recorded scenes, Arabic narration, English subtitles.
Run after record.mjs and cards.mjs:  python3 compose.py  ->  out/theislam-chat-after-shahada.mp4
"""
import json, subprocess, textwrap, pathlib

FF = "/opt/anaconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
ROOT = pathlib.Path(__file__).parent
S = json.load(open(ROOT / "script.json"))
M = json.load(open(ROOT / "raw/marks.json"))
out = ROOT / "out"; out.mkdir(exist_ok=True)
PAD = 0.5


def dur(f):
    r = subprocess.run([FF, "-i", str(f)], capture_output=True, text=True).stderr
    h, m, s = r.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def esc(t):
    return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")


parts = []
for sc in S["scenes"]:
    sid = sc["id"]
    audio = ROOT / f"audio/{sid}_t.wav"
    T = dur(audio) + PAD
    sub = "\n".join(textwrap.wrap(sc["en"], 78))
    draw = (f"drawtext=fontfile={FONT}:expansion=none:text='{esc(sub)}':fontsize=24:fontcolor=white:line_spacing=6:"
            f"box=1:boxcolor=black@0.62:boxborderw=14:x=(w-text_w)/2:y=h-text_h-34")
    seg = out / f"{sid}.mp4"
    if sc["kind"] == "card":
        vin = ["-loop", "1", "-t", f"{T:.2f}", "-i", str(ROOT / f"raw/{sid}.png")]
        vf = f"scale=1280:720,format=yuv420p,{draw}"
    else:
        a, b = M["marks"][sid]["start"], M["marks"][sid]["end"]
        clip = b - a
        vin = ["-ss", f"{a:.2f}", "-t", f"{clip:.2f}", "-i", str(ROOT / M["video"])]
        # fit the recorded action to the narration (speed up long waits, slow short clips slightly)
        vf = f"setpts={T / clip:.4f}*PTS,fps=30,scale=1280:720,format=yuv420p,{draw}"
    subprocess.run([FF, "-y", "-loglevel", "error", *vin, "-i", str(audio), "-filter_complex",
                    f"[0:v]{vf}[v];[1:a]apad=pad_dur={PAD},atrim=0:{T:.2f}[a]", "-map", "[v]", "-map", "[a]",
                    "-t", f"{T:.2f}", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k",
                    "-ar", "48000", str(seg)], check=True)
    parts.append(seg)
    print(sid, f"{T:.1f}s")

lst = out / "list.txt"
lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
final = out / "theislam-chat-after-shahada.mp4"
subprocess.run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(final)], check=True)
print("final", f"{dur(final):.1f}s", final)
