# theislam.chat — After the Shahada · ما بعد الشهادة

**Live:** https://shahada.theislam.chat — open [`/en?demo=shahada`](https://shahada.theislam.chat/en?demo=shahada) or [`/ar?demo=shahada`](https://shahada.theislam.chat/ar?demo=shahada) to start at the moment of the Shahada.
**Track 03** — Interactive experiences and the learning journey · AI in the Service of Islamic Content Challenge 2026 · applicant: Osoul Association.

> **عربي باختصار:** حين يعلن المستخدم إسلامه في محادثة theislam.chat، تبدأ في المحادثة نفسها رحلة تعليمية من كتاب «الوجيز: منهج تعليم صفي للمسلم الجديد» (مركز أصول) بلغته: درس أول عن معنى الشهادتين، ثم منهج يحفظ تقدمه، وجواب عن كل سؤال تُسند كل جملة فيه إلى صفحة من الكتاب، ويُدرج الكود الاقتباسات والآيات ولا يكتبها النموذج، ويُحال إلى مرشد أو مرشدة عند الفتوى الشخصية أو الأزمة أو الحاجة العملية.

## The problem

In the platform's export of 8 Sept 2026, the assistant congratulated a user on entering Islam in **166** conversations; only **11** users left any way to be contacted, **89** conversations ended within two messages, and **22** users asked how to make wudu, how to pray, or what to do now — which the platform is deliberately forbidden to teach from model memory. (`stats/` recomputes these numbers from the export; no conversation text is included.)

## What was built on 4–6 October 2026

| Part | What it does | Code |
|---|---|---|
| Integration patch | After the congratulation the assistant emits `<shahada/>`; the theislam.chat interface opens the module under that message, in the same conversation | `platform-patch/bot-chat-guide.diff` (181 lines against the tagged pre-challenge version), `content/prompts/dawah.md` |
| Start card | Language, former religion, country and topic — each only if the user said it, shown with the user's own sentence (verified by code), editable, nothing stored until confirmed | `service/src/profile.ts`, `web-module/src/StartCard.vue` |
| Curriculum | Al-Wajeez's 4 units / 19 lessons; first the Shahada lesson, then the user's choice (wudu, prayer, Al-Fatiha, not sure), purification and prayer, then the book in order — fixed rules in code, unit-tested | `content/structure.json`, `service/src/curriculum.ts`, `service/test/` |
| Lessons | Summary sentences each linked to their passage and page; the steps of wudu, ghusl and prayer shown **verbatim** from the book; verses from Tanzil with QuranEnc meanings; a comprehension question; lessons not yet reviewed show only the book text | `service/tools/build_lessons.ts`, `service/src/lessons.ts`, `content/review.json` |
| Questions | Hybrid retrieval (BM25 + gemini-embedding-2) → constrained generation where **every sentence must name a retrieved passage** → a **code-only checker** that drops unsupported sentences, rejects text quoted from nowhere, inserts quotes and verses from the sources, regenerates once if more than a third is dropped, otherwise apologises and offers a mentor | `service/src/answer.ts`, `service/src/checker.ts`, `service/src/book.ts` |
| Router | Two independent signals — a fixed multilingual list of crisis/self-harm phrases and a model label (curriculum, beyond the book, personal fatwa, crisis, practical need, scholarly difference, unsure). Either one refers. Self-harm shows the country's emergency number first. Labels are never stored on the user | `service/src/router.ts`, `service/src/messages.ts` |
| Human referral | Brother or sister mentor, a short card the user sees and consents to (language, stated country, lesson, reason, question), queue + mentor panel, reply delivered in the chat when the user returns | `service/src/server.ts`, `service/public/mentor.html`, `web-module/src/HandoffDialog.vue` |
| Account | Google sign-in or e-mail link; the next lesson by e-mail at the hour the user picks; "delete my data" | `service/src/server.ts`, `service/src/mail.ts` |
| Languages | 10 editions converted to text (ar, en, fr, es, id, pt, ru, bs, vi, th); other languages get a "machine-translated explanation — original attached" answer from the English/Arabic text | `scripts/extract_book.py`, `scripts/build_chunks.py` |
| Evaluation | 200 locked questions + 100 dev + 120 simulated journeys, hashed before building; two systems (ours vs. the same model and passages without checker/router); independent judge | `eval/`, `service/tools/run_eval.ts`, `service/tools/run_journeys.ts`, `service/tools/score.ts` |

Results: see [`docs/evaluation.md`](docs/evaluation.md) and the blind review in [`eval/human_review.md`](eval/human_review.md).

Since the locked run, also built (disclosed in the report): live answer stages, a 24-hour answer cache, listen-and-repeat recitation (Al-Minshawi's teaching Mushaf and Alafasy, mp3quran.net) for Al-Fatiha, the short surahs and prayer, interactive exercises from the book's own assessment questions, and a fallback that shows the book's verbatim steps for "how do I perform…" questions on wudu, ghusl and prayer.

## Submission materials

| Deliverable | Where |
|---|---|
| Live demo | https://shahada.theislam.chat (`/ar?demo=shahada`, `/en?demo=shahada`); mentor panel at `/mentor` (demo account) |
| Presentation (challenge template) | [`docs/deck/`](docs/deck/) — PPTX + PDF, rebuilt by `docs/deck/build_deck.py` |
| Video (≤ 2 min) | built by the pipeline in [`video/`](video/), documented in [`docs/video.md`](docs/video.md) |
| Evaluation | [`docs/evaluation.md`](docs/evaluation.md), raw rows in `eval/results/` |
| Sources and licences | [`SOURCES.md`](SOURCES.md) |
| Sharia review of lessons | `content/review.json` (who approved what, and how) |
| API | [`docs/api.md`](docs/api.md) |

## Run it

```bash
# 1. Rebuild the book text and indexes (needs GEMINI_API_KEY; PDFs are public)
python3 scripts/extract_book.py en && python3 scripts/build_chunks.py en && python3 scripts/build_index.py en
python3 scripts/fetch_quranenc.py   # translations of meanings; Tanzil text goes to data/quran/quran-uthmani.txt
cd service && npm install && npx tsx tools/build_lessons.ts en

# 2. Start the service (http://localhost:8080)
cp ../deploy/.env.example ../.env   # fill the keys
npm run dev

# 3. Tests and evaluation
npm test
npx tsx tools/run_eval.ts dev && npx tsx tools/score.ts ../eval/runs/<file>.jsonl
npx tsx tools/run_journeys.ts --base http://localhost:8080
```

Production: `deploy/docker-compose.yml` (one container behind nginx/Cloudflare on midade-vps).
The frontend is the theislam.chat interface (`bot-chat-guide`, private) at tag `pre-challenge-2026-10-03` plus `platform-patch/bot-chat-guide.diff`, with the module components from `web-module/src/`.

## Disclosure (terms §8 and §9)

- **Existing before the challenge, not submitted for evaluation:** the theislam.chat platform (Osoul Association, live since October 2024): its interface, voice chat, "talk to a human" button, and its da'wah prompt. The versions are tagged `pre-challenge-2026-10-03` in the platform repositories.
- **Built during 4–6 October 2026:** everything in this repository (see the commit history) and the integration patch.
- **Prepared on 4 October before writing code:** the book's conversion to text and the frozen evaluation sets (`eval/LOCK.sha256`, first commit). The 30 critical test cases were written by the team member who also built the router, which we state openly; they were frozen in the first commit and not changed after.
- **Sources, models, tools and licences:** [`SOURCES.md`](SOURCES.md). No real user conversation is used in the code, tests, demo or repository.
- **Not covered by our claims:** we measure the curriculum's order, sourcing, abstention and referral with simulations and fixed sets; we do not claim improved understanding among real new Muslims within the challenge period.
