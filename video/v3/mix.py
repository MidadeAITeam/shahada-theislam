"""Sound mix for v3 (numpy): narration + testimonial + ElevenLabs SFX + hum beds, placed from timeline.json.
  python3 mix.py  -> seg/mix.wav ; then mux + loudnorm (-16 LUFS) -> ../out/after-the-shahada-v3.mp4"""
import json, subprocess, pathlib, numpy as np
R = pathlib.Path(__file__).parent
FF = "/opt/anaconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
SR = 48000
TL = json.load(open(R / "timeline.json")); BT = {b["id"]: b for b in TL["beats"]}; TOT = TL["total"]
def load(p, ss=None, t=None, af=None):
    a = [FF, "-loglevel", "error"] + (["-ss", str(ss)] if ss is not None else []) + (["-t", str(t)] if t else []) + ["-i", str(R / p)]
    a += (["-af", af] if af else []) + ["-f", "f32le", "-ac", "1", "-ar", str(SR), "-"]
    return np.frombuffer(subprocess.run(a, capture_output=True, check=True).stdout, np.float32).copy()
db = lambda x: 10 ** (x / 20)
mix = np.zeros(int((TOT + 1) * SR), np.float32)
def put(x, t, g=0.0):
    i = int(t * SR); x = x[: max(0, len(mix) - i)]; mix[i:i + len(x)] += x * db(g)
def loop(x, dur, xf=1.0):
    n = int(dur * SR); f = int(xf * SR); out = np.zeros(n + len(x), np.float32); i = 0
    ramp = np.linspace(0, 1, f, dtype=np.float32)
    while i < n:
        y = x.copy(); y[:f] *= ramp; y[-f:] *= ramp[::-1]; out[i:i + len(y)] += y; i += len(x) - f
    return out[:n]
def env(x, fi=0.5, fo=0.5):
    n = len(x); a = int(fi * SR); b = int(fo * SR)
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)
    return x
S = lambda b: BT[b]["start"]; E = lambda b: BT[b]["end"]
sent = lambda b, k=0: BT[b]["sent"][k]

# narration
for b in TL["beats"]:
    for s in b["sent"]: put(load(s["file"]), s["start"], 0)
# testimonial (his voice), level-matched
put(env(load("raw/brown.mp4", 44, 7.9, "highpass=f=80,loudnorm=I=-19:TP=-2"), 0.24, 0.6), S("b05"), 0)  # ends on "actually", fades before his next word

# (owner: no background drone) room = load("sfx/room.mp3"); put(env(loop(room, TOT), 1.0, 0.6), 0, -14)
put(load("sfx/keys.mp3")[: int(1.9 * SR)], 0.0, -8)
put(load("sfx/pop.mp3"), 1.85, -6); put(load("sfx/pop.mp3"), 2.40, -4)
put(load("sfx/breath.mp3"), 2.55, -12)
whoosh = load("sfx/whoosh.mp3")
for t in [S("b03") - 0.25, S("b05") - 0.3, S("b06") - 0.3, S("b14") - 0.3, S("b17") - 0.3]: put(whoosh, t, -10)
# numbers: boom on 16,653, hits on 150 and 52
s4 = sent("b04"); boom = load("sfx/boom.mp3"); hit = load("sfx/hit.mp3")
put(boom, s4["start"] + s4["dur"] * 0.5 - 0.05, -6); put(hit, s4["start"] + s4["dur"] * 0.79 - 0.03, -6); put(hit, s4["start"] + s4["dur"] * 0.97 - 0.03, -6)
put(boom, S("b06") + 0.3, -12)
# the problem: sub drop before "and then?", cursor ticks, question pops
put(load("sfx/subdrop.mp3"), S("b07") - 0.15, -4)
tick = load("sfx/tick.mp3")
t = S("b08") + 0.4
while t < E("b08") - 0.2: put(tick, t, -20); t += 1.0
s9 = sent("b09")
for f in [0.40, 0.60, 0.78]: put(load("sfx/pop.mp3"), s9["start"] + s9["dur"] * f - 0.1, -6)
# hum beds (human voices, no instruments)
hum = load("sfx/hum.mp3"); dark = load("sfx/humdark.mp3"); warm = load("sfx/hum.mp3", af="asetrate=44100*1.06,aresample=48000")
# (owner: no background hum) put(env(loop(hum, S("b05") - S("b03") + 0.2), 1.2, 0.5), S("b03"), -28)
# (owner: no background hum) put(env(loop(hum, S("b06q") - S("b06")), 0.6, 0.05), S("b06"), -24)
nahnu = sent("b12", 1)["start"] + sent("b12", 1)["dur"]
# (owner: no background hum) put(env(loop(dark, nahnu - S("b10")), 1.5, 0.02), S("b10"), -26)
s13 = sent("b13"); put(load("sfx/breath.mp3"), s13["start"] + 0.55, -12)
# (owner: no background hum) put(env(loop(warm, (TOT - 0.5) - (S("b13") + 1.0)), 1.5, 1.0), S("b13") + 1.0, -26)
# the answer: riser + vocal "mm" on the card, page turn, test card hit, last line
s14 = sent("b14"); card = s14["start"] + s14["dur"] * 0.38
r = load("sfx/riser.mp3"); put(env(r, 0.5, 0.05), card - len(r) / SR, -14)
# (owner: no background hum) put(load("sfx/mm.mp3"), card - 0.1, -10)
put(load("sfx/page.mp3"), S("b15") + 0.1, -8)
put(hit, E("b16") - 3.5, -10)
put(boom, sent("b18", 1)["start"] - 0.05, -10)
mix[int((TOT - 0.5) * SR):] *= 0
mix = mix[: int(TOT * SR)]
peak = np.abs(mix).max(); mix = mix / max(1.0, peak / 0.98)
import wave
w = wave.open(str(R / "seg/mix.wav"), "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
out = R / "../out/after-the-shahada-v3.mp4"
subprocess.run([FF, "-y", "-loglevel", "error", "-i", str(R / "seg/film_v.mp4"), "-i", str(R / "seg/mix.wav"),
                "-filter_complex", "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,pan=stereo|c0=c0|c1=c0[a]", "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{TOT:.3f}", "-movflags", "+faststart", str(out)], check=True)
print("wrote", out)
