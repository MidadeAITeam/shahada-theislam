# Sources, models, tools and licences (Challenge terms §9)

## Content

| Source | What we use | Where | Licence / terms |
|---|---|---|---|
| **Al-Wajeez: A Classroom Curriculum for New Muslims** (Osoul Center, 1443 AH) | The only teaching and answering source. 10 editions converted to text: ar, en, fr, es, id, pt, ru, bs, vi, th | PDFs: [islamicfiqh.net/wageez](https://islamicfiqh.net/wageez/) (media.rasoulallah.net, islamicfiqh.net) | © Osoul Center. The applicant (Osoul Association) holds the rights. The book text is **not** committed; `content/manifest/*.json` lists every passage id, page and SHA-256, and `scripts/` rebuilds the text from the public PDFs |
| **Qur'an text** — Tanzil, Uthmani script, Hafs | Verse text inserted by code wherever a cited passage cites a verse | [tanzil.net](https://tanzil.net/download/) | Tanzil terms: verbatim copies with attribution, no modification |
| **Translations of the meanings** — QuranEnc (King Fahd Complex / Rowwad Translation Center and others) | Meaning shown under each verse in the learner's language (English when none) | [quranenc.com API](https://quranenc.com/en/home/api/) | Used unmodified with attribution (per-language translator in `data/quran/translations/*.json` → `key`) |
| Challenge scientific package (المرجعية والحزمة العلمية) | The four content levels, the glossary rule (approved equivalents over free translation), the test examples | Provided by the organisers | — |
| Fixed table of prior-belief passages | `content/backgrounds.json` (pages of Al-Wajeez chosen by a person, never generated) | this repo | MIT |
| Emergency numbers | `service/src/messages.ts` (public national numbers) | public | — |

## Models (all calls are server-side; keys are never in the repo)

| Role | Model | Provider |
|---|---|---|
| Page transcription of the PDFs (once, build time) | `gemini-3.8-flash` (vision) | Google Gemini API |
| Answer and lesson generation (constrained) | `gemini-3.8-flash` | Google Gemini API |
| Router, start-card extraction, query translation | `gemini-3.5-flash-lite` | Google Gemini API |
| Embeddings | `gemini-embedding-2` (768 dims) | Google Gemini API |
| Evaluation judge, test-question drafting | `gemini-3.1-pro-preview` | Google Gemini API |
| Pre-Shahada da'wah chat (the platform's existing role) | `gpt-5.4-mini` | OpenAI Responses API |
| Fallback for generation (one setting: `LLM_PROVIDER=openai`) | `gpt-5.4-mini` | OpenAI |

## Software

| Component | Licence |
|---|---|
| Node.js, Fastify, @fastify/cookie, @fastify/static, better-sqlite3, google-auth-library, tsx, TypeScript | MIT / Apache-2.0 |
| Vue 3, Vite (frontend, via the theislam.chat interface) | MIT |
| poppler (`pdftotext`, `pdftoppm`) for PDF page rendering | GPL-2.0 (used as a command-line tool, not linked) |
| Python 3 standard library (build scripts) | PSF |

## Data and privacy

- No real user conversation is used anywhere in this repository, its tests or its demo. All test questions and the 30 simulated learners are synthetic (`eval/`).
- The platform statistics quoted in the presentation are aggregate counts computed from the 8 Sept 2026 database export by `stats/db_stats.py` and `stats/post_shahada_stats.py`; no text from any conversation is included.
- Stored per learner: lesson progress, lesson language, chosen first topic, the country only if the learner keeps it on the start card, and e-mail if they sign in. The stated former religion stays in the browser session only. Router labels are never stored on the learner.
