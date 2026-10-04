# The 2-minute video: how it is made

Everything is generated from the repository, so a new version is a matter of editing a script and rerunning.

## Versions

| Version | Style | Length | Status |
|---|---|---|---|
| v1 | Plain walkthrough: problem card → demo scenes → results card | 1:55 | superseded |
| v2 | Keynote style: silent cold open on the Shahada, "and then… silence", the numbers counting one by one, the reveal, a fast captioned demo montage, proof, closing line | 1:45 | draft, under review (notes pending) |
| v3 | To be designed after all other deliverables are finished, from the team's notes on v2 | — | planned |

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
