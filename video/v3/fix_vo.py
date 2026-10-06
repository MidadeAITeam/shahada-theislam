"""Re-cut the narration clips more gently (the first cut clipped word endings and pauses), keeping the
existing timeline: each clip must fit before the next sentence; if not, it is sped up just enough."""
import json, wave, numpy as np, subprocess, pathlib
R = pathlib.Path(__file__).parent
FF = "/opt/anaconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
T = json.load(open(R / "timeline.json"))
TEMPO = T["tempo"]
def dur(p):
    r = subprocess.run([FF, "-i", str(p)], capture_output=True, text=True).stderr
    hh, mm, ss = r.split("Duration: ")[1].split(",")[0].split(":"); return float(ss) + 60 * float(mm)
def cut(src):
    w = wave.open(str(src)); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float)
    h = sr // 100; n = len(x) // h; db = 20 * np.log10(np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(1) / 32768 ** 2) + 1e-9)
    loud = db > -50; loud[:3] = False
    i0 = max(0, int(np.argmax(loud)) - 6); i1 = min(n, n - int(np.argmax(loud[::-1])) + 25)
    keep = np.ones(n, bool); keep[:i0] = False; keep[i1:] = False
    k = i0
    while k < i1:  # cap only long internal pauses, at 0.45 s
        if not loud[k]:
            j = k
            while j < i1 and not loud[j]: j += 1
            if j - k > 45: keep[k + 22:j - 22] = False
            k = j
        else: k += 1
    return sr, np.concatenate([x[i * h:(i + 1) * h] for i in range(n) if keep[i]]).astype(np.int16)
sents = [(b, s) for b in T["beats"] for s in b["sent"]]
for idx, (b, s) in enumerate(sents):
    nxt = sents[idx + 1][1]["start"] if idx + 1 < len(sents) and sents[idx + 1][0]["id"] == b["id"] else b["end"]
    room = nxt - s["start"] - 0.05
    bid, k = pathlib.Path(s["file"]).stem.split("_")
    sr, y = cut(R / f"audio/{bid}_{k}.wav")
    tmp = R / "vo/_t.wav"; o = wave.open(str(tmp), "wb"); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(y.tobytes()); o.close()
    natural = len(y) / sr / TEMPO
    tempo = max(TEMPO, natural / room * TEMPO) if natural > room else TEMPO
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", str(tmp), "-af", f"atempo={tempo:.4f},afade=t=in:d=0.03,areverse,afade=t=in:d=0.08,areverse", "-ar", "48000", str(R / s["file"])], check=True)
    print(s["file"], "old", s["dur"], "new", round(dur(R / s["file"]), 2), "room", round(room, 2), "tempo", round(tempo, 3))
