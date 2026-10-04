# Evaluation results

All sets were written and hashed **before** the module was built (first commit, `eval/LOCK.sha256`):

```
f25ad55c23586dc1a35b84afc57948a03e56003d7f38215eff4daafbe0f37150  eval/locked.jsonl
93e0b470935b618e389674eb76878b42d4e3878881716343e7cf4acb1a1657c3  eval/dev.jsonl
b2ff2a143aceef696b61d52fb335c04724001c87d20482ca6d413881d0bb9be1  eval/journeys.jsonl
```

Thresholds and prompts were tuned on `eval/dev.jsonl` only. The locked set below was run once, at the end,
**three times per question** to measure consistency, through two systems that share the same model
(`gemini-3.8-flash`), the same retrieval and the same passages:

- **With checker and router** — the module as deployed.
- **Same model, no checker/router** — the model answers from the same passages with page citations, without our router and checker (the comparison promised in the idea file; the current platform is not compared because its instructions forbid teaching acts of worship at all).

Judge: `gemini-3.1-pro-preview` (sentence-level support against the cited passages, correctness against the expected answer points,
abstention/referral). Quote fidelity is checked by code. Raw rows: `eval/results/`.

## Locked set (200 questions × 3 runs)

Set: locked-2026-10-04T17-29-42-157Z.jsonl · 200 questions × 3 run(s) = 600 rows
| Metric | With checker and router | Same model, no checker/router |
|---|---|---|
| Answers fully supported by the cited book passages | 96.8% (395/408) | 99.0% (393/397) |
| Sentences supported by the book | 99.2% (1626/1639) | 99.5% (1898/1907) |
| Quotes that match the book text | 100.0% (444/444) | 92.1% (760/825) |
| Critical cases referred to a human (no personal ruling) | 81.1% (73/90) | 81.1% (73/90) |
| Critical cases: no ruling given and a mentor offered | 98.9% (89/90) | 81.1% (73/90) |
| Self-harm cases with the emergency message first | 100.0% (12/12) | – |
| Not-in-book questions: abstained / referred | 91.1% (82/90) | 85.6% (77/90) |
| Answerable questions wrongly declined (lower is better) | 1.9% (7/360) | 4.2% (15/360) |
| Answerable questions answered correctly | 90.6% (326/360) | 90.6% (326/360) |
| Answer linked to the right lesson | 95.2% (336/353) | – |
| Scholarly-difference questions handled with room | 86.7% (52/60) | 0.0% (0/60) |
| Median latency (s) | 8.3 | – |
| Mean cost per question (USD) | 0.0013 | – |

Targets promised in the idea file: attribution ≥ 95%, quotes 100% identical to the book, critical cases 100% referred,
false abstention ≤ 5%, journeys ≥ 95%.

## Journeys (30 simulated learners × days 1, 3, 7, 14 = 120)

Run against the live HTTP API (real persistence and lesson order). A model plays each learner and asks a free question in the learner's language.

| Measure | Result |
|---|---|
| Lesson offered equals the reference path | 120/120 |
| Journeys correct against the locked reference | 111/120 (92.5%) |
| Free questions answered and linked to the reference lesson | 30/39 |
| Journeys correct when a free question may link to the lesson whose pages hold its answer | 119/120 (99.2%) |

**Limit of the reference, stated openly:** each free question in `eval/journeys.jsonl` was labelled with the lesson being studied,
but some were drafted from the neighbouring pages of the next or previous lesson. In those cases the system linked the question to the
lesson that actually contains the answer. We report both numbers and did not edit the locked file.

## Against the targets, plainly

- Met: quotes identical to the book (100%), sentence-level attribution (99.2% of sentences; 96.8% of answers fully supported, target 95%), false abstention 1.9% (target ≤ 5%), self-harm emergency message first (100%).
- **Missed:** critical cases routed straight to a human: **81.1%** against a 100% target. In the other 17 of 90 attempts the module replied "this is not in the book" with an offer of a mentor and gave no ruling, except one attempt (L177, run 1) that answered from the book. These are reported as they came out of the first locked run.
- **Missed on the strict reading:** journeys 92.5% against 95% (99.2% when a free question may link to the lesson whose pages hold its answer — see above).

## Run history

- 4 Oct 2026, ~17:30–19:00 UTC: this locked run (the results above), after tuning on the dev set only.
- Changes deployed after this run, not reflected above: worship "how do I…" questions fall back to the book's verbatim steps when the model returns nothing; live answer stages; listen-and-repeat recitation; interactive book exercises; two lesson sentences reworded after the Sharia review. None of them was tuned on the locked questions.

## Limits

- The judge is a model. 60 answers were also reviewed blind by an independent AI reviewer following Ahl al-Sunnah methodology (`eval/human_review.md`): module 23 sound / 7 incomplete / 0 errors; same model without checker 14 / 15 / 1.
- The 30 critical cases were written by the same team member who built the router (disclosed in the README).
- Simulations measure order, sourcing, abstention and referral — not learning gains among real new Muslims.
