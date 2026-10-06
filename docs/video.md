# The 2-minute video: how it is made

Everything is generated from the repository, so a new version is a matter of editing a script and rerunning.

## Versions

| Version | Style | Length | Status |
|---|---|---|---|
| v1 | Plain walkthrough: problem card → demo scenes → results card | 1:55 | superseded |
| v2 | Keynote style: silent cold open on the Shahada, "and then… silence", the numbers counting one by one, the reveal, a fast captioned demo montage, proof, closing line | 1:45 | draft, under review (notes pending) |
| v3 | "The First Lesson" (locked script `video/script3/v2.txt`): demo-only footage, the Shahada loop shot, numbers as kinetic type, the 166 dots, Dr. Brown's testimonial, the learning space, mentors, the emergency number | 1:58.8 | `video/out/after-the-shahada-v3.mp4` |

## Pipeline (`video/`)

| Step | File | What it does |
|---|---|---|
| Script | `script.json` (v1), `script2.json` (v2) | Arabic narration, English subtitle and visual for each beat. Every number comes from `docs/evaluation.md` and `stats/` |
| Narration | `tts_local.py` | Gemini TTS (`gemini-3.8-flash-tts`, voice Charon), one sentence at a time. A style prompt was dropped because the model sometimes read it aloud |
| Live demo footage | `record.mjs` | Playwright drives https://shahada.theislam.chat in Arabic (Shahada → start card → lesson → wudu → questions → mentor) and logs scene marks |
| Animated beats (v2) | `anim.mjs` | HTML/CSS animations (typed Shahada, counting numbers, word-by-word lines, the reveal, proof, close) recorded at 1280×720; Arabic captions rendered as transparent overlays |
| Cards (v1) | `cards.mjs` | Static title, results and closing cards in the challenge template colours |
| Assembly | `compose.py` (v1), `compose2.py` (v2) | ffmpeg: fits each demo clip to its narration, overlays captions, burns English subtitles, adds held silences for drama, mixes a quiet generated ambient pad (no third-party music), concatenates |

Rebuild v2:

```bash
cd video
python3 tts_local.py audio4          # narration (needs GEMINI_API_KEY)
MENTOR_PASSWORD=… node record.mjs    # demo footage
python3 compose2.py audio && node anim.mjs durations.json && python3 compose2.py video
```

Output: `video/out/theislam-chat-after-shahada-v2.mp4` (not committed).

## Rules the video follows

- Only synthetic conversations appear on screen; no real user data.
- Every claim is one we can show: the platform numbers are aggregate counts from the 8 Sept 2026 export, and the results come from the locked evaluation (`docs/evaluation.md`).
- The narration is AI-generated. If a human voice is preferred for v3, the same script is read and dropped into `audio4/`.

## v3 (`video/v3/`)

| Step | File | What it does |
|---|---|---|
| Narration text | `beats.json` | The script's narration, one sentence per entry, with its English subtitle. Runtime cuts applied from the script's cut order: «كتابةً وصوتًا» (B3) and «بلغته» (B15) |
| Voice | `tts.py` | `python3 tts.py elevenlabs JBFqnCBsd6RMkjVDRZzb eleven_multilingual_v2` (George, the voice used; chosen from 5 voices × 2 models) or `python3 tts.py gemini` (Charon). Add beat ids to regenerate only those, e.g. `python3 tts.py elevenlabs b06` |
| Timeline | `plan.py` | Trims each read, caps internal pauses, applies `TEMPO` (default 1.03), adds the script's silences, writes `timeline.json` and `vo/`. The whole edit follows this file, so a new read re-times the film |
| Footage | `rec_phone.mjs`, `rec_ls.mjs`, `rec_safety.mjs`, `rec_crisis.mjs`, `rec_mentor.mjs`, `shots_lang.mjs` | Playwright against https://shahada.theislam.chat, recorded HiDPI (`--force-device-scale-factor`). Phone (EN) for the Shahada loop, desktop (AR) for the learning space. `rec_safety.mjs` sends ONE real handoff tagged [VIDEO] (rate-limited, 5/hour): do not rerun it casually. The crisis take blurs the test message. `rec_mentor.mjs` records a local run of the service (`PORT=8799 WEB_DIR=<dir with mentor-app/dist as mentor/> DB_PATH=<scratch> npx tsx src/server.ts`, built-in demo cases and the default demo password) |
| Graphics | `gfx.mjs` | Renders every super, subtitle, the numbers stack, kinetic questions, the 166 dots, the title, the ayah (28:56, sliced from `data/quran/quran-uthmani.txt`), the test card and the end card frame by frame (Readex Pro, Amiri) |
| Sound | `sfx.py`, `mix.py` | ElevenLabs sound effects (cached in `sfx/`; hum of voices, booms, whooshes, keys, pops; no instruments), mixed under the narration and the testimonial, loudness normalised to -16 LUFS |
| Assembly | `build.py` | Cuts, Ken Burns moves, the phone panel, overlays and subtitles → `seg/film_v.mp4` |

Rebuild:

```bash
cd video/v3
python3 tts.py elevenlabs JBFqnCBsd6RMkjVDRZzb eleven_multilingual_v2   # or: python3 tts.py gemini
python3 plan.py && node gfx.mjs && python3 sfx.py
python3 build.py video && python3 mix.py      # -> video/out/after-the-shahada-v3.mp4
```

Footage only needs re-recording if the site changes (`node rec_phone.mjs`, `node rec_ls.mjs`, ...).
