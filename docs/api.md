# After-Shahada API (service/)

Base path: `/api/shahada`. JSON in and out. Session: an anonymous learner id is issued on first call as the
`learner` cookie (httpOnly, 1 year); signing in with Google or an email link attaches it to an account so
progress follows the user across devices.

## Start (right after the congratulation)

`POST /api/shahada/start`
```json
{ "lang": "en", "conversation": [{"role": "user", "text": "..."}, {"role": "assistant", "text": "..."}] }
```
Returns the **start card** (fields filled ONLY from the user's own explicit sentences, verified by code to appear
in the user's messages) and the first lesson. Nothing is stored until `/profile` is confirmed.
```json
{
  "card": {
    "language": {"value": "en", "evidence": "..."},
    "previous_religion": {"value": "Christian", "evidence": "I'm Christian from the US"} | null,
    "country": {"value": "US", "label": "United States", "evidence": "..."} | null,
    "asked_about": {"value": "Jesus", "evidence": "..."} | null
  },
  "first_lesson": <Lesson>
}
```

`POST /api/shahada/profile` — the user confirms/edits/deletes card fields and picks what to learn first.
```json
{ "lang": "en", "choice": "wudu|prayer|fatiha|unsure|null", "card": { ...edited card, null for deleted fields... }, "background_passages": true }
```
Stores lesson language + choice (+ country only if the user keeps it, used for referral cards and emergency
numbers). `previous_religion` is kept in the session only and is never written to the database.
Returns `<Progress>`.

## Lessons

`GET /api/shahada/lessons?lang=en` — index: units → lessons with `done` flags and the learner's path order.

`GET /api/shahada/lessons/:id?lang=en` → `<Lesson>`
```json
{
  "id": "u3l3", "unit": {"id": "u3", "index": 3, "title": "..."}, "index": 9, "position": {"done": 3, "total": 19},
  "title": "Ablution (Wudu)", "reviewed": true, "translated_explanation": false,
  "summary": [{"text": "...", "sources": ["wajeez:en:p63:c3"]}],      // empty when not reviewed
  "steps": [{"text": "<verbatim book sentence>", "source": "wajeez:en:p63:c3"}] | null, // worship steps, verbatim
  "background_note": {"text": "...", "sources": [...]} | null,         // from the fixed background table
  "check_question": {"question": "...", "options": ["..."], "answer_index": 1, "source": "..."} | null,
  "verses": [<Verse>],
  "sources": [<SourceRef>],   // book name + page + original text for every cited passage
  "next": {"id": "u3l6", "title": "..."} | null
}
```

`POST /api/shahada/lessons/:id/complete` `{ "lang": "en", "check_answer": 1 | null }` → `<Progress>`

`GET /api/shahada/progress` → `{ "lang", "choice", "completed": [...], "next": {...}|null, "position": {...}, "account": {"email"?, "name"?}|null, "reminder": {"hour": 20, "tz": "Europe/London"}|null }`

## Questions

`POST /api/shahada/ask` `{ "question": "...", "lang": "en", "lesson_id": "u3l3" | null }` → `<Answer>` (see
`service/src/answer.ts` `AnswerResult`). `status`: `answered | not_in_book | referred | social | failed`.
When `route.emergency` is true the UI shows the emergency text (already first in `text`) before anything else.
`lesson_id` set = "ask about this lesson" (the tutor is restricted to that lesson's passages).

## Human referral

`POST /api/shahada/handoff` `{ "reason": "fatwa_personal|crisis|practical_need|not_in_book|user_request|unsure", "mentor": "brother|sister", "question": "...", "lesson_id": "...", "lang": "en", "consent": true }`
The card sent to the mentor holds only: language, the country the user stated (if kept), current lesson,
reason, and the question. `lesson_id` must be a lesson of `content/structure.json` (otherwise it is dropped).
→ `{ "id": "h_...", "status": "new" }`. The question is also the first message of the case's thread.

`GET /api/shahada/handoff/messages?after=<message id>` → `{ "handoffs": [{ id, mentor, reason, status, created_at,
first_reply_at, last_message_id }], "messages": [{ id, handoff_id, author: "learner|mentor", text, created_at, mentor_name }] }`:
the learner's cases and every message of their threads (both sides) with an id above `after` (0 = all). Ids only grow, so
polling with the last id seen never misses a message.
`POST /api/shahada/handoff/:id/messages` `{ "text": "..." }` → `{ "ok": true, "id": <message id> }` — learner writes to the
team (400 when empty). A case waiting for the learner goes back to `in_progress`; a closed case reopens (logged on its timeline).

Limits (per learner cookie and per address, `429` with `Retry-After`): 5 referrals an hour, 30 messages in 10 minutes,
20 error reports an hour.

## Account and reminders

`POST /api/shahada/auth/google` `{ "credential": "<Google ID token>" }`
`POST /api/shahada/auth/email` `{ "email": "...", "lang": "en" }` → sends a sign-in link (`/api/shahada/auth/verify?token=...`).
`POST /api/shahada/reminder` `{ "hour": 20, "tz": "Asia/Manila", "enabled": true }`
`POST /api/shahada/forget` — deletes the account, progress and referral cards with their messages, internal notes and timelines.

## Error report

`POST /api/shahada/report` `{ "target": "lesson:u3l3" | "answer:<id>", "note": "...", "lang": "en" }` (400 when the target or the note is empty)

## Follow-up platform (mentors)

`/mentor` (the app in `mentor-app/`, served with `X-Frame-Options: DENY`). All routes below need the session cookie
set by the login, else `401 { "error": "login" }`. A session is a random token stored server-side: it ends after
12 hours without activity, after 7 days in any case, and on logout.

| Route | |
|---|---|
| `POST /api/mentor/login` `{ email, password }` | → the mentor `{ id, name, email, gender, role }`. 5 failed attempts per address and email in 15 minutes → `429`. |
| `POST /api/mentor/logout` | Ends the session on the server. |
| `GET /api/mentor/me` | The signed-in mentor. |
| `GET /api/mentor/mentors` | Active mentors (for assignment). |
| `GET /api/mentor/cases` | `{ counts, crisis_unassigned, cases }`. A mentor sees every case of their group (brother/sister); a supervisor sees all. Each case has `overdue`, `awaiting_reply` (the learner wrote after the last reply) and `awaiting_minutes`. |
| `GET /api/mentor/cases/:id` | `{ case, messages, notes, events }` |
| `POST /api/mentor/cases/:id/reply` `{ text }` | Up to 4000 characters. Sets the case to `waiting_user`. |
| `POST /api/mentor/cases/:id/assign` `{ mentor_id }` | Supervisor, or a mentor taking the case. Never across groups (`400 cross_gender`). |
| `POST /api/mentor/cases/:id/status` `{ status, reason? }` | `new`, `in_progress`, `waiting_user` or `closed` |
| `POST /api/mentor/cases/:id/notes` `{ text }` | Internal note. |
| `GET /api/mentor/canned?lang=xx` | Canned replies in that language, English and Arabic. |
| `GET /api/mentor/reports` | Error reports, with the lesson title when the target is a lesson. |
| `POST /api/mentor/reports/:id` `{ status }` | Supervisor only. `new`, `reviewing`, `fixed` or `not_an_error`; `404` for an unknown id. |
| `GET /api/mentor/stats` | Supervisor only. Aggregate numbers, per-mentor workload, SLA breaches. |

## Platform compatibility (for the theislam.chat interface)

The demo serves the theislam.chat frontend with the integration patch. The service also answers the few
platform endpoints that frontend calls, scoped to the demo tenant:
`GET /general/tenants/tenant-data`, `POST /general/chats`, `POST /general/chats/messages`, `POST /api/chat/no-auth`
(the pre-Shahada da'wah chat, OpenAI, same SSE format as the platform:
`data: {"text": "<cumulative>", "final": bool, "response_id": "...", "suggested_questions": [...]}`), plus
`POST /general/site-chat/handoff|send`, `GET /general/site-chat/poll` mapped onto the mentor queue.
The Shahada signal is a `<shahada/>` tag appended by the model after the congratulation; the patched frontend
strips it from the text and opens the module (`"shahada": true` is also set on the final SSE event).
