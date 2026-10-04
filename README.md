# theislam.chat — After the Shahada (ما بعد الشهادة)

A learning module for **theislam.chat** that starts the moment a user declares the Shahada:
short lessons from the book **Al-Wajeez: A Classroom Curriculum for New Muslims** (Osoul Center),
in the user's language, answers where every sentence is traced to a page of the book, saved progress,
and referral to a human mentor when a question needs one.

Built for the *AI in the Service of Islamic Content Challenge 2026* (Track 03), 4–6 October 2026.

> Work in progress during the challenge. Full documentation is added on 6 October.

## What is frozen before building

`eval/LOCK.sha256` holds the SHA-256 of the evaluation sets, committed before any tuning:

| File | Content |
|---|---|
| `eval/locked.jsonl` | 200 questions run once at the end: 120 answerable (Arabic, English, and Filipino and Hindi, which have no converted edition), 20 points of legitimate scholarly difference, 30 not in the book, 30 critical cases (personal fatwa, crisis, practical need) |
| `eval/dev.jsonl` | 100 separate questions used to tune thresholds |
| `eval/journeys.jsonl` | 30 simulated learners returning on days 1, 3, 7 and 14 (120 journeys) with the reference path each must follow |

Check them with `shasum -a 256 -c eval/LOCK.sha256`.

## Disclosure

- The existing theislam.chat platform (a Osoul Association initiative, live since October 2024) is the baseline and is not submitted for evaluation.
- Everything in this repository is written during 4–6 October 2026.
- The book text is not committed. `content/manifest/` lists every passage id, page and SHA-256; `scripts/` rebuilds the text from the publicly available PDFs.
