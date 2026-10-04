"""Version 2 (keynote style). Steps:
  python3 compose2.py audio      -> builds audio5/<beat>.wav (sentences + pauses) and durations.json
  node anim.mjs durations.json   -> records the animated beats (raw2/)
  python3 compose2.py video      -> out/theislam-chat-after-shahada-v2.mp4
"""
import json, subprocess, sys, textwrap, pathlib, glob

FF = "/opt/anaconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
R = pathlib.Path(__file__).parent
S = json.load(open(R / "script2.json"))
GAP, TAIL, OPEN = 0.55, 0.65, 7.0
# Extra held silence after a beat, for drama (seconds).
HOLD = {"b02": 0.6, "b03": 1.8, "b06": 1.2, "b08": 0.6, "b09": 1.8, "b15": 0.6, "b16": 2.5}
run = lambda *a: subprocess.run([FF, "-y", "-loglevel", "error", *a], check=True)


def dur(f):
    r = subprocess.run([FF, "-i", str(f)], capture_output=True, text=True).stderr
    h, m, s = r.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def audio():
    (R / "audio5").mkdir(exist_ok=True)
    D = {}
    for b in S["beats"]:
        out = R / f"audio5/{b['id']}.wav"
        if not b["ar"]:
            run("-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(OPEN), str(out))
        else:
            parts = sorted(glob.glob(str(R / f"audio4/{b['id']}_*.wav")), key=lambda p: int(p.rsplit("_", 1)[1][:-4]))
            ins, filt = [], ""
            for i, p in enumerate(parts):
                ins += ["-i", p]
                filt += f"[{i}:a]aresample=24000,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur={GAP if i < len(parts) - 1 else TAIL + HOLD.get(b["id"], 0)}[a{i}];"
            filt += "".join(f"[a{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[o]"
            run(*ins, "-filter_complex", filt, "-map", "[o]", "-ac", "1", "-ar", "24000", str(out))
        D[b["id"]] = round(dur(out), 2)
    json.dump(D, open(R / "durations.json", "w"), indent=1)
    print(D, "total", round(sum(D.values()), 1))


def esc(t):
    return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")


def video():
    D = json.load(open(R / "durations.json"))
    M = json.load(open(R / "raw/marks.json"))
    out = R / "out"; out.mkdir(exist_ok=True)
    segs = []
    for b in S["beats"]:
        bid, T = b["id"], D[b["id"]]
        a = R / f"audio5/{bid}.wav"
        sub = "\n".join(textwrap.wrap(b["en"], 80)) if b["en"] else ""
        draw = (f",drawtext=fontfile={FONT}:expansion=none:text='{esc(sub)}':fontsize=22:fontcolor=white@0.92:line_spacing=6:"
                f"box=1:boxcolor=black@0.55:boxborderw=12:x=(w-text_w)/2:y=h-text_h-30") if sub else ""
        seg = out / f"v2_{bid}.mp4"
        if b["visual"] == "screen":
            s0, s1 = M["marks"][b["scene"]]["start"], M["marks"][b["scene"]]["end"]
            clip = s1 - s0
            vin = ["-ss", f"{s0:.2f}", "-t", f"{clip:.2f}", "-i", str(R / M["video"]), "-loop", "1", "-i", str(R / f"raw2/{bid}_cap.png")]
            vf = (f"[0:v]setpts={T / clip:.4f}*PTS,fps=30,scale=1280:720[s];[1:v]format=rgba,fade=in:st=0.2:d=0.5:alpha=1[c];"
                  f"[s][c]overlay=0:0:shortest=0,format=yuv420p{draw}[v]")
            ai = "2"
        else:
            vin = ["-ss", "0.3", "-i", str(R / f"raw2/{bid}.webm")]
            vf = f"[0:v]fps=30,scale=1280:720,format=yuv420p{draw}[v]"
            ai = "1"
        run(*vin, "-i", str(a), "-filter_complex", vf + f";[{ai}:a]aresample=48000,apad[a]", "-map", "[v]", "-map", "[a]",
            "-t", f"{T:.2f}", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", str(seg))
        segs.append(seg)
        print(bid, T)
    (out / "list2.txt").write_text("".join(f"file '{p.name}'\n" for p in segs))
    joined = out / "v2_joined.mp4"
    run("-f", "concat", "-safe", "0", "-i", str(out / "list2.txt"), "-c", "copy", str(joined))
    total = dur(joined)
    # A quiet generated ambient pad under the voice (no third-party music).
    pad = out / "pad.wav"
    run("-f", "lavfi", "-i", f"sine=f=110:d={total}", "-f", "lavfi", "-i", f"sine=f=164.8:d={total}", "-f", "lavfi", "-i", f"sine=f=220:d={total}",
        "-filter_complex", f"[0][1][2]amix=inputs=3,lowpass=f=900,tremolo=f=0.15:d=0.4,volume=0.05,afade=t=in:d=4,afade=t=out:st={total - 5:.1f}:d=5[p]",
        "-map", "[p]", "-ar", "48000", str(pad))
    final = out / "theislam-chat-after-shahada-v2.mp4"
    run("-i", str(joined), "-i", str(pad), "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[a]", "-map", "0:v",
        "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", str(final))
    print("final", round(dur(final), 1), final)


if __name__ == "__main__":
    {"audio": audio, "video": video}[sys.argv[1]]()
