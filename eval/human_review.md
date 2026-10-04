# Blind review of 60 answers

60 answers from the first run of the locked set (Arabic and English, answerable and scholarly-difference questions) were shuffled
and labelled R01–R60: 30 from the module (checker and router) and 30 from the same model without them. The key
(`eval/human_review_key.json`) was kept out of the repository until the review was done.

**Reviewer:** an independent AI reviewer instance (Claude), instructed to judge each answer by the methodology of Ahl al-Sunnah
wal-Jama'ah and with no access to the key or to any run file. It is **not** a human specialist review; the team's specialist may
add their own verdicts to `eval/blind_review_result.json`.

| | Sound (✓) | Correct but incomplete or ambiguous (⚠) | Error (✗) |
|---|---|---|---|
| With checker and router (30) | **23** | 7 | **0** |
| Same model, no checker/router (30) | 14 | 15 | 1 |

- The one error (R46, baseline): "men are forbidden silver jewellery" without the agreed exception of a silver ring.
- Three baseline warnings (R26, R28, R42) are partly due to the evaluation file storing at most 1,500 characters of each answer, which cut long answers; we count them as reported.
- The module's warnings are mostly matters of difference where the answer gives the book's view without naming the other views, and the fixed "room" note sometimes reads as generic. Notes per item: `eval/blind_review_result.json`.
