import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import fstatic from "@fastify/static";
import { OAuth2Client } from "google-auth-library";
import { ask, type AnswerResult, type Stage } from "./answer.ts";
import { normalize } from "./text.ts";
import { streamChat } from "./chat.ts";
import { config, ROOT } from "./config.ts";
import { CHOICES, nextLesson, plannedPath, progressOf, type Choice } from "./curriculum.ts";
import { db, event, id } from "./db.ts";
import { getLesson, lessonIndex, lessonTitle } from "./lessons.ts";
import { layout, mailText, sendMail } from "./mail.ts";
import { startCard } from "./profile.ts";
import { createHandoff, learnerMessage, registerMentorRoutes } from "./mentor.ts";
import { clientIp, limiter, tooMany } from "./ratelimit.ts";

const app = Fastify({ logger: { level: "info" }, trustProxy: true, bodyLimit: 512 * 1024 });
await app.register(cookie, { secret: config.sessionSecret });

// ---------------------------------------------------------------- learner identity
interface Learner { id: string; account_id: string | null; lang: string | null; choice: Choice | null; country: string | null }

function learner(req: FastifyRequest, reply: FastifyReply): Learner {
  const raw = req.cookies.learner ? req.unsignCookie(req.cookies.learner) : null;
  let row = raw?.valid ? (db.prepare("SELECT * FROM learners WHERE id = ?").get(raw.value) as Learner | undefined) : undefined;
  if (!row) {
    const lid = id("l");
    db.prepare("INSERT INTO learners (id) VALUES (?)").run(lid);
    row = { id: lid, account_id: null, lang: null, choice: null, country: null };
    reply.setCookie("learner", lid, { path: "/", httpOnly: true, sameSite: "lax", secure: config.publicUrl.startsWith("https"), signed: true, maxAge: 60 * 60 * 24 * 365 });
  }
  return row;
}
const owner = (l: Learner) => l.account_id ?? l.id;
const completedOf = (l: Learner) => (db.prepare("SELECT lesson_id FROM progress WHERE owner = ? ORDER BY completed_at").all(owner(l)) as { lesson_id: string }[]).map((r) => r.lesson_id);

function progress(l: Learner) {
  const completed = completedOf(l);
  const next = nextLesson(l.choice, completed);
  const acct = l.account_id ? (db.prepare("SELECT email, name, reminder_hour, reminder_tz, reminder_enabled FROM accounts WHERE id = ?").get(l.account_id) as Record<string, unknown>) : null;
  return {
    lang: l.lang, choice: l.choice, country: l.country, completed,
    next: next ? { id: next, title: lessonTitle(next, l.lang ?? "en") } : null,
    position: progressOf(l.choice, completed),
    path: plannedPath(l.choice),
    account: acct ? { email: acct.email, name: acct.name } : null,
    reminder: acct?.reminder_enabled ? { hour: acct.reminder_hour, tz: acct.reminder_tz } : null,
  };
}

const lang = (v: unknown, l?: Learner) => (typeof v === "string" && /^[a-z]{2,3}$/.test(v) ? v : l?.lang ?? "en");

// ---------------------------------------------------------------- module API
app.post("/api/shahada/start", async (req, reply) => {
  const l = learner(req, reply);
  const b = req.body as { lang?: string; conversation?: { role: string; text: string }[] };
  const lg = lang(b.lang, l);
  event(l.id, "start");
  const card = await startCard(lg, (b.conversation ?? []).slice(-40));
  return { card, first_lesson: getLesson(lg, "u1l3", { choice: null, completed: [], background: null }) };
});

app.post("/api/shahada/profile", async (req, reply) => {
  const l = learner(req, reply);
  const b = req.body as { lang?: string; choice?: string | null; card?: { country?: { value?: string } | null } };
  const choice = CHOICES.includes(b.choice as Choice) ? (b.choice as Choice) : null;
  const country = b.card?.country?.value && /^[A-Za-z]{2}$/.test(b.card.country.value) ? b.card.country.value.toUpperCase() : null;
  db.prepare("UPDATE learners SET lang = ?, choice = ?, country = ? WHERE id = ?").run(lang(b.lang, l), choice, country, l.id);
  event(l.id, "profile", choice ?? "none");
  return progress({ ...l, lang: lang(b.lang, l), choice, country });
});

app.get("/api/shahada/progress", async (req, reply) => progress(learner(req, reply)));

app.get("/api/shahada/lessons", async (req, reply) => {
  const l = learner(req, reply);
  const q = req.query as { lang?: string };
  return lessonIndex(lang(q.lang, l), l.choice, completedOf(l));
});

app.get("/api/shahada/lessons/:id", async (req, reply) => {
  const l = learner(req, reply);
  const q = req.query as { lang?: string; background?: string };
  const lesson = getLesson(lang(q.lang, l), (req.params as { id: string }).id, { choice: l.choice, completed: completedOf(l), background: q.background ?? null });
  if (!lesson) return reply.code(404).send({ error: "not_found" });
  event(l.id, "lesson_open", lesson.id);
  return lesson;
});

app.post("/api/shahada/lessons/:id/complete", async (req, reply) => {
  const l = learner(req, reply);
  const lid = (req.params as { id: string }).id;
  const b = req.body as { check_answer?: number | null; lang?: string };
  const lesson = getLesson(lang(b.lang, l), lid, { choice: l.choice, completed: [] });
  const correct = lesson?.check_question && typeof b.check_answer === "number" ? Number(b.check_answer === lesson.check_question.answer_index) : null;
  db.prepare("INSERT OR REPLACE INTO progress (owner, lesson_id, check_correct) VALUES (?, ?, ?)").run(owner(l), lid, correct);
  event(l.id, "lesson_complete", lid);
  return progress(l);
});

// Answers to the same question in the same language and lesson are reused for a day: they are
// built only from the book, so they do not depend on who asks. Referrals are never cached.
const answerCache = new Map<string, { at: number; r: AnswerResult }>();
const cacheKey = (q: string, lg: string, lesson: string | null) => `${lg}|${lesson ?? ""}|${normalize(q)}`;

async function answerFor(l: Learner, b: { question?: string; lang?: string; lesson_id?: string | null; history?: string }, onStage?: (s: Stage) => void) {
  const question = (b.question ?? "").trim().slice(0, 2000);
  const lg = lang(b.lang, l);
  const history = typeof b.history === "string" ? b.history.slice(-1500) : "";
  const key = cacheKey(question + (history ? `\u0000${history}` : ""), lg, b.lesson_id ?? null);
  const hit = answerCache.get(key);
  let r: AnswerResult;
  if (hit && Date.now() - hit.at < 24 * 3600 * 1000) r = hit.r;
  else {
    r = await ask({ question, lang: lg, lessonId: b.lesson_id ?? null, history: history || undefined, country: l.country }, onStage);
    if (r.status === "answered" || r.status === "not_in_book") {
      if (answerCache.size > 2000) answerCache.delete(answerCache.keys().next().value!);
      answerCache.set(key, { at: Date.now(), r });
    }
  }
  r = { ...r };
  event(l.id, "ask", `${r.status}:${r.route.label}`);
  const { trace, ...publicPart } = r;
  return { ...publicPart, trace: { ms: trace.ms, attempts: trace.attempts, dropped: trace.dropped.length, cached: Boolean(hit) } };
}

app.post("/api/shahada/ask", async (req, reply) => {
  const l = learner(req, reply);
  const b = req.body as { question?: string; lang?: string; lesson_id?: string | null; history?: string };
  if (!(b.question ?? "").trim()) return reply.code(400).send({ error: "empty" });
  return answerFor(l, b);
});

// Same answer, with live stages (understanding -> found on pages -> checking) so the learner
// sees progress while the checker works; the answer itself is still sent only once it passed.
app.post("/api/shahada/ask/stream", async (req, reply) => {
  const l = learner(req, reply);
  const b = req.body as { question?: string; lang?: string; lesson_id?: string | null; history?: string };
  if (!(b.question ?? "").trim()) return reply.code(400).send({ error: "empty" });
  reply.raw.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no", ...(reply.getHeader("set-cookie") ? { "Set-Cookie": reply.getHeader("set-cookie") as string } : {}) });
  const send = (o: unknown) => reply.raw.write(`data: ${JSON.stringify(o)}\n\n`);
  try {
    send({ type: "answer", data: await answerFor(l, b, (s) => send({ type: "stage", ...s })) });
  } catch {
    send({ type: "error" });
  }
  reply.raw.end();
});

// Anonymous intake is rate limited per learner and per address (the cookie alone is easy to drop).
const limits = {
  report: limiter(20, 60 * 60 * 1000),
  handoff: limiter(5, 60 * 60 * 1000),
  message: limiter(30, 10 * 60 * 1000),
};
const limitKeys = (req: FastifyRequest, l: Learner) => [`l:${l.id}`, `ip:${clientIp(req)}`];

app.post("/api/shahada/report", async (req, reply) => {
  const l = learner(req, reply);
  const b = (req.body ?? {}) as { target?: string; note?: string; lang?: string };
  const target = String(b.target ?? "").trim().slice(0, 200);
  const note = String(b.note ?? "").trim().slice(0, 2000);
  if (!target || !note) return reply.code(400).send({ error: "empty" });
  const lim = limits.report.take(limitKeys(req, l));
  if (!lim.ok) return tooMany(reply, lim.retryAfter);
  db.prepare("INSERT INTO reports (learner_id, target, note, lang) VALUES (?, ?, ?, ?)").run(l.id, target, note, lang(b.lang, l));
  return { ok: true };
});

// ---------------------------------------------------------------- human referral
const REASONS = ["fatwa_personal", "crisis", "practical_need", "not_in_book", "user_request", "unsure", "failed"];
app.post("/api/shahada/handoff", async (req, reply) => {
  const l = learner(req, reply);
  const b = (req.body ?? {}) as { reason?: string; mentor?: string; question?: string; lesson_id?: string; lang?: string; consent?: boolean };
  if (!b.consent) return reply.code(400).send({ error: "consent_required" });
  const lim = limits.handoff.take(limitKeys(req, l));
  if (!lim.ok) return tooMany(reply, lim.retryAfter);
  const reason = REASONS.includes(b.reason ?? "") ? b.reason! : "user_request";
  const hid = createHandoff({
    learnerId: l.id, mentor: b.mentor === "sister" ? "sister" : "brother", reason, lang: lang(b.lang, l), country: l.country,
    lessonId: b.lesson_id ?? null, question: String(b.question ?? "").trim().slice(0, 2000),
  });
  event(l.id, "handoff", reason);
  return { id: hid, status: "new" };
});

// A signed-in learner's cases follow their account to any device (each device has its own learner id).
const MY_CASES = "h.learner_id IN (SELECT id FROM learners WHERE id = @lid OR (account_id IS NOT NULL AND account_id = @acct))";
const mine = (l: Learner) => ({ lid: l.id, acct: l.account_id ?? "" });

// The learner's conversations with the team: every case with its whole thread (both sides).
// `after` is the last message id the page has, so polling never misses two messages in one second.
app.get("/api/shahada/handoff/messages", async (req, reply) => {
  const l = learner(req, reply);
  const after = Math.max(0, Math.floor(Number((req.query as { after?: string }).after ?? 0)) || 0);
  return {
    handoffs: db.prepare(`SELECT h.id, h.mentor, h.reason, h.status, h.created_at, h.first_reply_at,
        (SELECT max(id) FROM handoff_messages WHERE handoff_id = h.id) AS last_message_id
      FROM handoffs h WHERE ${MY_CASES} ORDER BY h.created_at`).all(mine(l)),
    messages: db.prepare(`SELECT m.id, m.handoff_id, m.author, m.text, m.created_at, CASE m.author WHEN 'mentor' THEN mt.name END AS mentor_name
                          FROM handoff_messages m JOIN handoffs h ON h.id = m.handoff_id LEFT JOIN mentors mt ON mt.id = m.mentor_id
                          WHERE ${MY_CASES} AND m.id > @after ORDER BY m.id`).all({ ...mine(l), after }),
  };
});

app.post("/api/shahada/handoff/:id/messages", async (req, reply) => {
  const l = learner(req, reply);
  const hid = (req.params as { id: string }).id;
  const h = db.prepare(`SELECT h.id FROM handoffs h WHERE h.id = @hid AND ${MY_CASES}`).get({ hid, ...mine(l) });
  if (!h) return reply.code(404).send({ error: "not_found" });
  const text = String((req.body as { text?: string } | null)?.text ?? "").trim().slice(0, 2000);
  if (!text) return reply.code(400).send({ error: "empty" });
  const lim = limits.message.take(limitKeys(req, l));
  if (!lim.ok) return tooMany(reply, lim.retryAfter);
  return { ok: true, id: learnerMessage(hid, text) };
});

// ---------------------------------------------------------------- account and reminders
function attachAccount(l: Learner, accountId: string) {
  // Merge what the learner did before signing in into the account.
  db.prepare("INSERT OR IGNORE INTO progress (owner, lesson_id, completed_at, check_correct) SELECT ?, lesson_id, completed_at, check_correct FROM progress WHERE owner = ?").run(accountId, l.id);
  db.prepare("DELETE FROM progress WHERE owner = ?").run(l.id);
  db.prepare("UPDATE learners SET account_id = ? WHERE id = ?").run(accountId, l.id);
  const prev = db.prepare("SELECT lang, choice, country FROM learners WHERE account_id = ? AND id != ? AND choice IS NOT NULL ORDER BY started_at DESC").get(accountId, l.id) as Learner | undefined;
  if (prev && !l.choice) db.prepare("UPDATE learners SET lang = coalesce(lang, ?), choice = ?, country = coalesce(country, ?) WHERE id = ?").run(prev.lang, prev.choice, prev.country, l.id);
}

const google = new OAuth2Client();
app.post("/api/shahada/auth/google", async (req, reply) => {
  const l = learner(req, reply);
  try {
    const ticket = await google.verifyIdToken({ idToken: String((req.body as { credential?: string }).credential ?? ""), audience: config.googleClientId });
    const p = ticket.getPayload()!;
    let acct = db.prepare("SELECT id FROM accounts WHERE google_sub = ? OR email = ?").get(p.sub, p.email) as { id: string } | undefined;
    if (!acct) {
      acct = { id: id("a") };
      db.prepare("INSERT INTO accounts (id, email, google_sub, name) VALUES (?, ?, ?, ?)").run(acct.id, p.email, p.sub, p.name ?? null);
    } else db.prepare("UPDATE accounts SET google_sub = ? WHERE id = ?").run(p.sub, acct.id);
    attachAccount(l, acct.id);
    return progress({ ...l, account_id: acct.id });
  } catch {
    return reply.code(401).send({ error: "invalid_google_token" });
  }
});

app.post("/api/shahada/auth/email", async (req, reply) => {
  const l = learner(req, reply);
  const b = req.body as { email?: string; lang?: string };
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(400).send({ error: "invalid_email" });
  const token = id("t") + id("");
  db.prepare("INSERT INTO login_tokens (token, email, learner_id, expires_at) VALUES (?, ?, ?, datetime('now', '+1 day'))").run(token, email, l.id);
  const t = mailText(lang(b.lang, l));
  const link = `${config.publicUrl}/api/shahada/auth/verify?token=${token}`;
  await sendMail(email, t.signinSubject, layout(lang(b.lang, l), t.signin, link, "theislam.chat"), `${t.signin}\n${link}`);
  return { ok: true };
});

app.get("/api/shahada/auth/verify", async (req, reply) => {
  const token = String((req.query as { token?: string }).token ?? "");
  const row = db.prepare("SELECT * FROM login_tokens WHERE token = ? AND expires_at > datetime('now')").get(token) as { email: string; learner_id: string } | undefined;
  if (!row) return reply.code(400).type("text/html").send("<p>This link has expired. Please request a new one.</p>");
  db.prepare("DELETE FROM login_tokens WHERE token = ?").run(token);
  let acct = db.prepare("SELECT id FROM accounts WHERE email = ?").get(row.email) as { id: string } | undefined;
  if (!acct) {
    acct = { id: id("a") };
    db.prepare("INSERT INTO accounts (id, email) VALUES (?, ?)").run(acct.id, row.email);
  }
  const l = learner(req, reply);
  attachAccount(l, acct.id);
  const from = db.prepare("SELECT * FROM learners WHERE id = ?").get(row.learner_id) as Learner | undefined;
  if (from && from.id !== l.id) attachAccount(from, acct.id);
  return reply.redirect(`/${l.lang ?? "en"}?lesson=${nextLesson(l.choice, completedOf(l)) ?? "u1l3"}`);
});

app.post("/api/shahada/reminder", async (req, reply) => {
  const l = learner(req, reply);
  if (!l.account_id) return reply.code(401).send({ error: "sign_in_first" });
  const b = req.body as { hour?: number; tz?: string; enabled?: boolean };
  const hour = Math.max(0, Math.min(23, Math.floor(Number(b.hour ?? 20))));
  let tz = String(b.tz ?? "UTC");
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { tz = "UTC"; }
  db.prepare("UPDATE accounts SET reminder_hour = ?, reminder_tz = ?, reminder_enabled = ? WHERE id = ?").run(hour, tz, b.enabled === false ? 0 : 1, l.account_id);
  return progress(l);
});

app.post("/api/shahada/forget", async (req, reply) => {
  const l = learner(req, reply);
  db.prepare("DELETE FROM progress WHERE owner IN (?, ?)").run(l.id, l.account_id ?? "-");
  // The conversations with the team go too (from every device of the account): messages, internal
  // notes and the case timeline.
  const cases = `SELECT h.id FROM handoffs h WHERE ${MY_CASES}`;
  for (const t of ["handoff_messages", "handoff_notes", "handoff_events"])
    db.prepare(`DELETE FROM ${t} WHERE handoff_id IN (${cases})`).run(mine(l));
  db.prepare(`DELETE FROM handoffs WHERE id IN (${cases})`).run(mine(l));
  if (l.account_id) {
    db.prepare("UPDATE learners SET account_id = NULL WHERE account_id = ?").run(l.account_id);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(l.account_id);
  }
  db.prepare("DELETE FROM learners WHERE id = ?").run(l.id);
  reply.clearCookie("learner", { path: "/" });
  return { ok: true };
});

// Next-lesson reminders: every 5 minutes, accounts whose local hour matches and who were not reminded today.
async function remind() {
  const rows = db.prepare("SELECT * FROM accounts WHERE reminder_enabled = 1 AND email IS NOT NULL").all() as Record<string, string | number | null>[];
  for (const a of rows) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: String(a.reminder_tz ?? "UTC"), hour: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const localHour = parseInt(get("hour") ?? "0", 10) % 24;
    const today = `${get("year")}-${get("month")}-${get("day")}`;
    if (localHour !== a.reminder_hour || a.last_reminded_on === today) continue;
    const l = db.prepare("SELECT * FROM learners WHERE account_id = ? ORDER BY started_at DESC").get(a.id) as Learner | undefined;
    if (!l) continue;
    const next = nextLesson(l.choice, completedOf(l));
    if (!next) continue;
    const lg = l.lang ?? "en";
    const t = mailText(lg);
    const title = lessonTitle(next, lg);
    const link = `${config.publicUrl}/${lg}?lesson=${next}`;
    const ok = await sendMail(String(a.email), t.remindSubject.replace("{TITLE}", title), layout(lg, t.remind.replace("{TITLE}", title), link, t.open), `${t.remind.replace("{TITLE}", title)}\n${link}`);
    if (ok) db.prepare("UPDATE accounts SET last_reminded_on = ? WHERE id = ?").run(today, a.id);
  }
}
setInterval(() => remind().catch((e) => app.log.error(e)), 5 * 60 * 1000);

// ---------------------------------------------------------------- follow-up platform (mentors)
registerMentorRoutes(app);

app.get("/api/stats", async () => ({
  // Aggregated counts only (no content), as committed in the idea file.
  learners: (db.prepare("SELECT count(*) n FROM learners WHERE choice IS NOT NULL OR id IN (SELECT learner_id FROM events WHERE type='lesson_open')").get() as { n: number }).n,
  opened_curriculum: (db.prepare("SELECT count(DISTINCT learner_id) n FROM events WHERE type='lesson_open'").get() as { n: number }).n,
  completed_prayer: (db.prepare("SELECT count(DISTINCT learner_id) n FROM events WHERE type='lesson_complete' AND detail='u3l6'").get() as { n: number }).n,
  returned_another_day: (db.prepare("SELECT count(*) n FROM (SELECT learner_id FROM events GROUP BY learner_id HAVING count(DISTINCT date(created_at)) > 1)").get() as { n: number }).n,
  handoffs_by_reason: db.prepare("SELECT reason, count(*) n FROM handoffs GROUP BY reason").all(),
  check_answers: db.prepare("SELECT sum(check_correct = 1) correct, count(check_correct) answered FROM progress").get(),
}));

// ---------------------------------------------------------------- platform compatibility (demo tenant)
const tenant = JSON.parse(fs.readFileSync(path.join(ROOT, "content/tenant.json"), "utf8"));
app.get("/general/tenants/tenant-data", async () => tenant);
// The platform saves each chat message as multipart form data; the demo keeps no chat store, so
// the body is accepted and dropped (without this parser Fastify answers 415 on every turn).
app.addContentTypeParser("multipart/form-data", (_req, payload, done) => {
  payload.resume();
  payload.on("end", () => done(null, {}));
});
app.post("/general/chats", async () => ({ ok: true }));
app.post("/general/chats/messages", async () => ({ ok: true }));
app.get("/general/chats", async () => ({ data: [] }));
app.get("/general/auth/me", async (_req, reply) => reply.code(401).send({ message: "Unauthenticated" }));
app.post("/api/chat/no-auth", async (req, reply) => streamChat(req.body as { text: string; previous_response_id?: string }, reply));
// The platform's own "talk to a human" button is mapped onto the same mentor queue. It has no
// mentor choice of its own, so a visitor who asked for a sister in their words is routed to sisters.
const SISTER = /\b(sisters?|wom[ae]n|female|lady|soeur|hermana|mujer|femme|mulher|wanita|perempuan)\b|sœur|irmã|сестр|женщин|(?<![\u0621-\u064A])(?:ال)?(?:أخت|اخت|امرأة|إمرأة|مرشدة)(?:ي|ك|نا)?(?![\u0621-\u064A])/i;
const platformLang = (v: unknown) => {
  const code = typeof v === "string" ? v.toLowerCase().split(/[-_]/)[0] : "";
  const mapped = ({ po: "pt", fil: "tl" } as Record<string, string>)[code] ?? code;
  try {
    return /^[a-z]{2,3}$/.test(mapped) && new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(mapped) ? mapped : "en";
  } catch {
    return "en";
  }
};
app.post("/general/site-chat/handoff", async (req, reply) => {
  const l = learner(req, reply);
  const b = (req.body ?? {}) as { locale?: string; history?: { role: string; text: string }[] };
  const lim = limits.handoff.take(limitKeys(req, l));
  if (!lim.ok) return tooMany(reply, lim.retryAfter);
  const said = (Array.isArray(b.history) ? b.history : []).filter((m) => m?.role === "visitor" && typeof m.text === "string").map((m) => m.text.trim()).filter(Boolean);
  const hid = createHandoff({
    learnerId: l.id, mentor: said.some((t) => SISTER.test(t)) ? "sister" : "brother", reason: "user_request",
    lang: platformLang(b.locale), country: l.country, lessonId: null, question: (said[said.length - 1] ?? "").slice(0, 2000),
  });
  event(l.id, "handoff", "user_request");
  // The platform polls from this id on; the visitor's own first message is already on their screen.
  const last = db.prepare("SELECT max(id) n FROM handoff_messages WHERE handoff_id = ?").get(hid) as { n: number | null };
  return { message_id: last.n ?? 0, handoff_id: hid };
});
app.post("/general/site-chat/send", async (req, reply) => {
  const l = learner(req, reply);
  const text = String((req.body as { message?: string } | null)?.message ?? "").trim().slice(0, 2000);
  if (!text) return reply.code(400).send({ error: "empty" });
  const h = db.prepare("SELECT id FROM handoffs WHERE learner_id = ? ORDER BY created_at DESC").get(l.id) as { id: string } | undefined;
  if (!h) return reply.code(404).send({ error: "not_found" });
  const lim = limits.message.take(limitKeys(req, l));
  if (!lim.ok) return tooMany(reply, lim.retryAfter);
  return { ok: true, message_id: learnerMessage(h.id, text) };
});
app.get("/general/site-chat/poll", async (req, reply) => {
  const l = learner(req, reply);
  const after = Number((req.query as { after?: string }).after ?? 0);
  const rows = db.prepare(`SELECT m.id, m.text message, CASE m.author WHEN 'mentor' THEN 'agent' ELSE 'visitor' END direction, 1 is_human,
                           CASE m.author WHEN 'mentor' THEN 'human' END author, replace(m.created_at, ' ', 'T') || 'Z' created_time
                           FROM handoff_messages m JOIN handoffs h ON h.id = m.handoff_id WHERE h.learner_id = ? AND m.id > ? ORDER BY m.id`).all(l.id, after);
  return { messages: rows };
});

app.get("/health", async () => ({ ok: true }));

// ---------------------------------------------------------------- static web (built frontend + mentor page)
// The follow-up platform is a separate small app built into <webDir>/mentor (base path /mentor/).
const mentorIndex = () => path.join(config.webDir, "mentor/index.html");
app.get("/mentor", async (_req, reply) => reply.type("text/html").send(fs.readFileSync(fs.existsSync(mentorIndex()) ? mentorIndex() : path.join(ROOT, "service/public/mentor.html"), "utf8")));
if (fs.existsSync(config.webDir)) {
  await app.register(fstatic, { root: config.webDir, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/general/")) return reply.code(404).send({ error: "not_found" });
    return reply.type("text/html").send(fs.readFileSync(path.join(config.webDir, "index.html"), "utf8"));
  });
}

await app.listen({ port: config.port, host: "0.0.0.0" });
