"""Narration for v3, one sentence per call -> audio/<beat>_<k>.wav (24 kHz mono).
  python3 tts.py gemini            # Gemini TTS, voice Charon (default)
  python3 tts.py elevenlabs [VOICE_ID] [MODEL]   # ElevenLabs (needs text_to_speech permission on the key)
  python3 tts.py <engine> b06      # only regenerate beats whose id starts with b06
Keys are read from ../../.env. Then rebuild with: python3 build.py
"""
import json, os, sys, base64, time, urllib.request, subprocess, pathlib
R = pathlib.Path(__file__).parent
for l in open(R / "../../.env"):
    if "=" in l and not l.startswith("#"):
        k, v = l.strip().split("=", 1); os.environ.setdefault(k, v.strip().strip('"'))
FF = "/opt/anaconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
eng = sys.argv[1] if len(sys.argv) > 1 else "gemini"
only = [a for a in sys.argv[2:] if a.startswith("b")]
B = json.load(open(R / "beats.json"))["beats"]
(R / "audio").mkdir(exist_ok=True)

def gemini(text):
    body = {"contents": [{"parts": [{"text": text}]}], "generationConfig": {"responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": os.environ.get("VOICE", "Charon")}}}}}
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
                                 json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    d = json.load(urllib.request.urlopen(req, timeout=120))
    pcm = base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
    return pcm, ["-f", "s16le", "-ar", "24000", "-ac", "1"]

def eleven(text):
    vid = next((a for a in sys.argv[2:] if not a.startswith("b") and not a.startswith("eleven")), "JBFqnCBsd6RMkjVDRZzb")
    model = next((a for a in sys.argv[2:] if a.startswith("eleven")), "eleven_multilingual_v2")
    body = {"text": text, "model_id": model, "language_code": "ar",
            "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15}}
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128",
                                 json.dumps(body).encode(), {"Content-Type": "application/json", "xi-api-key": os.environ["ELEVENLABS_API_KEY"]})
    return urllib.request.urlopen(req, timeout=120).read(), ["-f", "mp3"]

fn = {"gemini": gemini, "elevenlabs": eleven}[eng]
for b in B:
    if only and not any(b["id"].startswith(o) for o in only): continue
    for k, s in enumerate(b["ar"]):
        out = R / f"audio/{b['id']}_{k}.wav"
        for i in range(5):
            try:
                data, fmt = fn(s); break
            except Exception as e:
                print("retry", b["id"], k, e); time.sleep(4 + 4 * i)
        else:
            sys.exit(f"failed {b['id']}_{k}")
        subprocess.run([FF, "-y", "-loglevel", "error", *fmt, "-i", "pipe:0", "-ar", "24000", "-ac", "1", str(out)], input=data, check=True)
        print("ok", out.name)
open(R / "audio/ENGINE", "w").write(eng)
