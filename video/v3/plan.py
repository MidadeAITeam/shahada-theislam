"""Timeline from the real narration: python3 plan.py -> timeline.json (beat starts/ends, sentence starts).
Trims each sentence's silence, shortens long internal pauses, applies TEMPO, writes vo/<beat>_<k>.wav."""
import json, wave, numpy as np, subprocess, pathlib, os
R = pathlib.Path(__file__).parent
FF = "/opt/anaconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
TEMPO = float(os.environ.get("TEMPO", "1.03"))
B = {b["id"]: b for b in json.load(open(R / "beats.json"))["beats"]}
# (id, pre, [gaps between sentences], post, fixed) — seconds of silence around the voice
PAD = {"b02": (0.15, [], 0.35), "b03": (0.1, [], 0.35), "b04": (0.1, [], 0.45), "b06": (0.15, [0.4], 0.3),
       "b07": (0.1, [], 1.0), "b08": (0.1, [], 1.5), "b09": (0.15, [], 0.3), "b10": (0.05, [], 0.35), "b11": (0.05, [], 0.4),
       "b12": (0.05, [0.5], 1.0), "b13": (0.1, [], 0.3), "b14": (0.05, [], 0.3), "b15": (0.05, [0.3], 0.9),
       "b16": (0.05, [0.35], 0.35), "b17": (0.05, [0.45], 0.3), "b18": (0.1, [0.8], 0.6)}
ORDER = ["b01", "b02", "b03", "b04", "b05", "b06", "b06q", "b07", "b08", "b09", "b10", "b11", "b12", "b13", "b14", "b15", "b16", "b17", "b18", "b19"]
FIXED = {"b01": 3.0, "b05": 8.3, "b06q": 2.0, "b19": 3.2}
(R / "vo").mkdir(exist_ok=True)

def proc(src, dst):
    w = wave.open(str(src)); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float)
    h = sr // 100; n = len(x) // h; db = 20 * np.log10(np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(1) / 32768 ** 2) + 1e-9)
    loud = db > -42; loud[:3] = False  # ignore start transient
    i0 = max(0, int(np.argmax(loud)) - 2); i1 = min(n, n - int(np.argmax(loud[::-1])) + 4)
    keep = np.ones(n, bool); keep[:i0] = False; keep[i1:] = False
    k = i0
    while k < i1:  # cap internal pauses at 0.26 s
        if not loud[k]:
            j = k
            while j < i1 and not loud[j]: j += 1
            if j - k > 26: keep[k + 13:j - 13] = False
            k = j
        else: k += 1
    y = np.concatenate([x[i * h:(i + 1) * h] for i in range(n) if keep[i]]).astype(np.int16)
    tmp = R / "vo/_t.wav"; o = wave.open(str(tmp), "wb"); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(y.tobytes()); o.close()
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", str(tmp), "-af", f"atempo={TEMPO},afade=t=in:d=0.02,afade=t=out:st=0:d=0", "-ar", "48000", str(dst)], check=True)
    r = subprocess.run([FF, "-i", str(dst)], capture_output=True, text=True).stderr
    hh, mm, ss = r.split("Duration: ")[1].split(",")[0].split(":"); return float(ss) + 60 * float(mm)

T = []; t = 0.0
for bid in ORDER:
    if bid in FIXED:
        T.append({"id": bid, "start": round(t, 3), "end": round(t + FIXED[bid], 3), "sent": []}); t += FIXED[bid]; continue
    pre, gaps, post = PAD[bid]; s0 = t; t += pre; sent = []
    for k, _ in enumerate(B[bid]["ar"]):
        d = proc(R / f"audio/{bid}_{k}.wav", R / f"vo/{bid}_{k}.wav")
        sent.append({"file": f"vo/{bid}_{k}.wav", "start": round(t, 3), "dur": round(d, 3), "en": B[bid]["en"][k]})
        t += d + (gaps[k] if k < len(gaps) else 0)
    t += post
    T.append({"id": bid, "start": round(s0, 3), "end": round(t, 3), "sent": sent})
json.dump({"tempo": TEMPO, "total": round(t, 3), "beats": T}, open(R / "timeline.json", "w"), indent=1, ensure_ascii=False)
for b in T: print(b["id"], b["start"], b["end"], round(b["end"] - b["start"], 2))
print("TOTAL", round(t, 2))
