"""Sound effects for v3 via ElevenLabs sound-generation, cached in sfx/<name>.mp3 (rerun skips existing files).
  python3 sfx.py"""
import os, json, urllib.request, pathlib, time
R = pathlib.Path(__file__).parent
for l in open(R / "../../.env"):
    if "=" in l and not l.startswith("#"):
        k, v = l.strip().split("=", 1); os.environ.setdefault(k, v.strip().strip('"'))
N = ", no music, no instruments, no melody"
FX = {
 "keys": ("close-mic soft laptop keyboard typing, quick steady keystrokes, quiet room" + N, 3.0),
 "pop": ("single soft UI message sent pop, subtle bubble pop" + N, 0.6),
 "boom": ("deep cinematic trailer boom impact with long low sub tail" + N, 3.0),
 "hit": ("soft deep low thud impact, short, cinematic, muffled" + N, 1.5),
 "whoosh": ("fast smooth cinematic air whoosh transition, airy swish" + N, 1.2),
 "riser": ("rising wind and air noise swell, whooshing breath of air building up, ending abruptly, purely noise based, no synthesizer, no tone" + N, 3.0),
 "subdrop": ("deep low rumble, heavy air pressure thump falling away, like distant thunder, noise based, no synthesizer, no tone" + N, 2.5),
 "room": ("quiet empty room tone, very soft air, subtle hiss, ambience" + N, 10.0),
 "page": ("single paper book page turn, close and soft" + N, 1.0),
 "tick": ("faint soft click tick, very quiet, like a text cursor" + N, 0.5),
 "hum": ("low soft humming of a group of male human voices, sustained mmm drone, one steady pitch, warm, no words" + N, 12.0),
 "humdark": ("very low dark sustained humming of male voices, mmm drone, ominous, steady, no words" + N, 12.0),
 "breath": ("soft human breath in, close mic" + N, 1.0),
 "mm": ("soft rising human vocal mmm hum swell, warm, hopeful, short" + N, 2.0),
}
(R / "sfx").mkdir(exist_ok=True)
for name, (text, dur) in FX.items():
    out = R / f"sfx/{name}.mp3"
    if out.exists(): continue
    body = {"text": text, "duration_seconds": dur, "prompt_influence": 0.6}
    for i in range(3):
        try:
            req = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation", json.dumps(body).encode(), {"Content-Type": "application/json", "xi-api-key": os.environ["ELEVENLABS_API_KEY"]})
            out.write_bytes(urllib.request.urlopen(req, timeout=120).read()); print("ok", name); break
        except Exception as e:
            print("retry", name, e); time.sleep(3)
