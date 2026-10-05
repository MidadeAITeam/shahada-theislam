// Follow-up platform for the mentors team: accounts and roles, case inbox, assignment, status,
// internal notes, a per-case timeline, canned replies, error reports and aggregate numbers.
// A mentor sees unassigned cases of their own group (brother/sister) and cases assigned to them;
// a supervisor sees everything. Every action is written to the case timeline.
import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.ts";
import { db, id } from "./db.ts";
import { lessonTitle } from "./lessons.ts";
import { emergencyNumber } from "./messages.ts";

db.exec(`
CREATE TABLE IF NOT EXISTS mentors (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  gender TEXT NOT NULL,           -- brother | sister
  role TEXT NOT NULL,             -- mentor | supervisor
  pass_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS handoff_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, handoff_id TEXT NOT NULL, actor TEXT, type TEXT NOT NULL, detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS handoff_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, handoff_id TEXT NOT NULL, mentor_id TEXT NOT NULL, text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS canned_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, lang TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL
);
`);
const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
const addCol = (t: string, c: string, def: string) => { if (!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
addCol("handoffs", "assigned_to", "TEXT");
addCol("handoffs", "closed_reason", "TEXT");
addCol("handoffs", "first_reply_at", "TEXT");
addCol("handoffs", "closed_at", "TEXT");
addCol("handoffs", "emergency", "INTEGER NOT NULL DEFAULT 0");
addCol("reports", "status", "TEXT NOT NULL DEFAULT 'new'");
addCol("reports", "reviewer", "TEXT");
// Older rows used 'queued' / 'answered'.
db.exec("UPDATE handoffs SET status = 'new' WHERE status = 'queued'; UPDATE handoffs SET status = 'in_progress' WHERE status = 'answered';");

export const STATUSES = ["new", "in_progress", "waiting_user", "closed"] as const;
const REPORT_STATUSES = ["new", "reviewing", "fixed", "not_an_error"];

// ---------------------------------------------------------------- passwords and seed
function hash(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString("hex")}`;
}
function verify(pw: string, stored: string) {
  const [salt, h] = stored.split(":");
  const a = Buffer.from(h, "hex");
  const b = crypto.scryptSync(pw, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function seedMentors() {
  const n = (db.prepare("SELECT count(*) n FROM mentors").get() as { n: number }).n;
  if (n) return;
  const add = (name: string, email: string, gender: string, role: string) =>
    db.prepare("INSERT INTO mentors (id, name, email, gender, role, pass_hash) VALUES (?, ?, ?, ?, ?, ?)").run(id("m"), name, email, gender, role, hash(config.mentorPassword));
  // Demo accounts for the judges (synthetic names); one password, kept in the server env.
  add("مشرف المتابعة (تجريبي)", "supervisor@demo.theislam.chat", "brother", "supervisor");
  add("المرشد عبد الله (تجريبي)", "brother@demo.theislam.chat", "brother", "mentor");
  add("المرشدة مريم (تجريبي)", "sister@demo.theislam.chat", "sister", "mentor");
}

export function seedCanned() {
  if ((db.prepare("SELECT count(*) n FROM canned_replies").get() as { n: number }).n) return;
  const rows: [string, string, string][] = [
    ["ar", "ترحيب", "وعليكم السلام ورحمة الله، مبارك عليك الإسلام، وأهلاً بك. أنا هنا لأساعدك، فخذ وقتك واسألني عما تشاء."],
    ["ar", "سنتواصل قريباً", "شكراً لرسالتك. سأعود إليك هنا في المحادثة خلال 24 ساعة بإذن الله، ويمكنك متابعة دروسك حتى ذلك الحين."],
    ["ar", "طلب تفاصيل", "حتى أجيبك إجابة صحيحة أحتاج بعض التفاصيل: هل يمكنك أن تخبرني أكثر عن حالتك؟ ما تكتبه هنا لا يراه إلا فريق المتابعة."],
    ["ar", "مسجد أو مركز قريب", "يسعدنا أن نصلك بمسجد أو مركز إسلامي قريب منك. في أي مدينة أنت؟"],
    ["ar", "شهادة إشهار الإسلام", "شهادة إشهار الإسلام تصدرها المراكز الإسلامية المعتمدة في بلدك. أخبرني بمدينتك لأدلك على أقربها وعلى الأوراق المطلوبة."],
    ["ar", "دعم في ظرف صعب", "أنا معك، وسلامتك أهم شيء الآن. إن كنت في خطر فاتصل بالطوارئ فوراً. وأخبرني: هل أنت في مكان آمن الآن؟"],
    ["en", "Welcome", "Wa alaykum as-salam, and congratulations on Islam. I'm here to help — take your time and ask me anything."],
    ["en", "Will follow up", "Thank you for your message. I'll get back to you here in the chat within 24 hours, in sha Allah. You can continue your lessons in the meantime."],
    ["en", "Ask for details", "To answer you correctly I need a few details. Could you tell me a bit more about your situation? Only the follow-up team can see what you write here."],
    ["en", "Nearby mosque or centre", "We'd be happy to connect you with a mosque or Islamic centre near you. Which city are you in?"],
    ["en", "Certificate of conversion", "A certificate of conversion is issued by recognised Islamic centres in your country. Tell me your city and I'll point you to the nearest one and the documents needed."],
    ["en", "Support in a crisis", "I'm with you, and your safety matters most right now. If you are in danger, please call emergency services immediately. Are you somewhere safe at the moment?"],
  ];
  const st = db.prepare("INSERT INTO canned_replies (lang, title, text) VALUES (?, ?, ?)");
  rows.forEach((r) => st.run(...r));
}

export function caseEvent(handoffId: string, actor: string | null, type: string, detail?: string) {
  db.prepare("INSERT INTO handoff_events (handoff_id, actor, type, detail) VALUES (?, ?, ?, ?)").run(handoffId, actor, type, detail ?? null);
}

// ---------------------------------------------------------------- auth
interface Mentor { id: string; name: string; email: string; gender: string; role: string }
function current(req: FastifyRequest): Mentor | null {
  const c = req.cookies.mentor ? req.unsignCookie(req.cookies.mentor) : null;
  if (!c?.valid || !c.value) return null;
  return (db.prepare("SELECT id, name, email, gender, role FROM mentors WHERE id = ? AND active = 1").get(c.value) as Mentor) ?? null;
}
function guard(req: FastifyRequest, reply: FastifyReply): Mentor | null {
  const m = current(req);
  if (!m) reply.code(401).send({ error: "login" });
  return m;
}
const canSee = (m: Mentor, h: Record<string, any>) =>
  m.role === "supervisor" || h.assigned_to === m.id || (!h.assigned_to && h.mentor === m.gender);

function shape(h: Record<string, unknown>) {
  const ageMin = Math.round((Date.now() - Date.parse(String(h.created_at).replace(" ", "T") + "Z")) / 60000);
  return {
    ...h,
    lesson_title: h.lesson_id ? lessonTitle(String(h.lesson_id), String(h.lang ?? "en")) : null,
    age_minutes: ageMin,
    overdue: h.status !== "closed" && !h.first_reply_at && ageMin > (h.reason === "crisis" ? 15 : 24 * 60),
    emergency_number: h.reason === "crisis" ? emergencyNumber(h.country as string | null) : null,
  };
}

export function registerMentorRoutes(app: FastifyInstance) {
  seedMentors();
  seedCanned();

  app.post("/api/mentor/login", async (req, reply) => {
    const b = req.body as { email?: string; password?: string };
    const m = db.prepare("SELECT * FROM mentors WHERE email = ? AND active = 1").get(String(b.email ?? "").trim().toLowerCase()) as (Mentor & { pass_hash: string }) | undefined;
    if (!m || !verify(String(b.password ?? ""), m.pass_hash)) return reply.code(401).send({ error: "wrong_credentials" });
    reply.setCookie("mentor", m.id, { path: "/", httpOnly: true, sameSite: "lax", secure: config.publicUrl.startsWith("https"), signed: true, maxAge: 60 * 60 * 12 });
    return { id: m.id, name: m.name, email: m.email, gender: m.gender, role: m.role };
  });
  app.post("/api/mentor/logout", async (_req, reply) => { reply.clearCookie("mentor", { path: "/" }); return { ok: true }; });
  app.get("/api/mentor/me", async (req, reply) => guard(req, reply));

  app.get("/api/mentor/mentors", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    return db.prepare("SELECT id, name, gender, role FROM mentors WHERE active = 1 ORDER BY role DESC, name").all();
  });

  app.get("/api/mentor/cases", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    const q = req.query as { status?: string; reason?: string; gender?: string; lang?: string; mine?: string };
    const rows = (db.prepare(`SELECT h.*, mt.name AS assigned_name,
        (SELECT text FROM handoff_messages WHERE handoff_id = h.id ORDER BY id DESC LIMIT 1) AS last_message,
        (SELECT author FROM handoff_messages WHERE handoff_id = h.id ORDER BY id DESC LIMIT 1) AS last_author
      FROM handoffs h LEFT JOIN mentors mt ON mt.id = h.assigned_to ORDER BY h.created_at DESC LIMIT 500`).all() as Record<string, any>[])
      .filter((h) => canSee(m, h));
    const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((h) => h.status === s).length]));
    const crisisUnassigned = rows.filter((h) => h.reason === "crisis" && !h.assigned_to && h.status !== "closed").length;
    const list = rows
      .filter((h) => (!q.status || h.status === q.status) && (!q.reason || h.reason === q.reason) && (!q.gender || h.mentor === q.gender)
        && (!q.lang || h.lang === q.lang) && (!q.mine || h.assigned_to === m.id))
      .map(shape)
      .sort((a: any, b: any) => (Number(b.reason === "crisis" && b.status !== "closed") - Number(a.reason === "crisis" && a.status !== "closed")) || (a.status === "closed" ? 1 : 0) - (b.status === "closed" ? 1 : 0) || String(a.created_at).localeCompare(String(b.created_at)));
    return { counts, crisis_unassigned: crisisUnassigned, cases: list };
  });

  function load(req: FastifyRequest, reply: FastifyReply) {
    const m = guard(req, reply); if (!m) return null;
    const h = db.prepare("SELECT h.*, mt.name AS assigned_name FROM handoffs h LEFT JOIN mentors mt ON mt.id = h.assigned_to WHERE h.id = ?").get((req.params as { id: string }).id) as Record<string, any> | undefined;
    if (!h || !canSee(m, h)) { reply.code(404).send({ error: "not_found" }); return null; }
    return { m, h };
  }

  app.get("/api/mentor/cases/:id", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    return {
      case: shape(r.h),
      messages: db.prepare("SELECT id, author, text, created_at FROM handoff_messages WHERE handoff_id = ? ORDER BY id").all(r.h.id),
      notes: db.prepare("SELECT n.id, n.text, n.created_at, m.name FROM handoff_notes n JOIN mentors m ON m.id = n.mentor_id WHERE handoff_id = ? ORDER BY n.id").all(r.h.id),
      events: db.prepare("SELECT e.type, e.detail, e.created_at, m.name AS actor FROM handoff_events e LEFT JOIN mentors m ON m.id = e.actor WHERE handoff_id = ? ORDER BY e.id").all(r.h.id),
    };
  });

  app.post("/api/mentor/cases/:id/reply", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    const text = String((req.body as { text?: string }).text ?? "").trim().slice(0, 4000);
    if (!text) return reply.code(400).send({ error: "empty" });
    db.prepare("INSERT INTO handoff_messages (handoff_id, author, text) VALUES (?, 'mentor', ?)").run(r.h.id, text);
    if (!r.h.first_reply_at) db.prepare("UPDATE handoffs SET first_reply_at = datetime('now') WHERE id = ?").run(r.h.id);
    if (!r.h.assigned_to) { db.prepare("UPDATE handoffs SET assigned_to = ? WHERE id = ?").run(r.m.id, r.h.id); caseEvent(r.h.id, r.m.id, "assigned", r.m.name); }
    if (r.h.status === "new") db.prepare("UPDATE handoffs SET status = 'in_progress' WHERE id = ?").run(r.h.id);
    caseEvent(r.h.id, r.m.id, "replied");
    return { ok: true };
  });

  app.post("/api/mentor/cases/:id/assign", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    const to = String((req.body as { mentor_id?: string }).mentor_id ?? "");
    if (r.m.role !== "supervisor" && to !== r.m.id) return reply.code(403).send({ error: "supervisor_only" });
    const target = db.prepare("SELECT id, name FROM mentors WHERE id = ? AND active = 1").get(to) as { id: string; name: string } | undefined;
    if (!target) return reply.code(400).send({ error: "unknown_mentor" });
    db.prepare("UPDATE handoffs SET assigned_to = ? WHERE id = ?").run(target.id, r.h.id);
    caseEvent(r.h.id, r.m.id, "assigned", target.name);
    return { ok: true };
  });

  app.post("/api/mentor/cases/:id/status", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    const b = req.body as { status?: string; reason?: string };
    if (!STATUSES.includes(b.status as any)) return reply.code(400).send({ error: "bad_status" });
    db.prepare("UPDATE handoffs SET status = ?, closed_reason = ?, closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END WHERE id = ?")
      .run(b.status, b.status === "closed" ? String(b.reason ?? "").slice(0, 300) || null : null, b.status, r.h.id);
    caseEvent(r.h.id, r.m.id, "status", b.status + (b.reason ? `: ${b.reason}` : ""));
    return { ok: true };
  });

  app.post("/api/mentor/cases/:id/notes", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    const text = String((req.body as { text?: string }).text ?? "").trim().slice(0, 4000);
    if (!text) return reply.code(400).send({ error: "empty" });
    db.prepare("INSERT INTO handoff_notes (handoff_id, mentor_id, text) VALUES (?, ?, ?)").run(r.h.id, r.m.id, text);
    caseEvent(r.h.id, r.m.id, "note");
    return { ok: true };
  });

  app.get("/api/mentor/canned", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    const lang = (req.query as { lang?: string }).lang;
    return db.prepare("SELECT id, lang, title, text FROM canned_replies WHERE ? IS NULL OR lang = ? OR lang = 'en' ORDER BY lang = ? DESC, id").all(lang ?? null, lang ?? null, lang ?? "");
  });

  app.get("/api/mentor/reports", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    return db.prepare("SELECT r.id, r.target, r.note, r.lang, r.status, r.created_at, m.name AS reviewer FROM reports r LEFT JOIN mentors m ON m.id = r.reviewer ORDER BY r.id DESC LIMIT 300").all();
  });
  app.post("/api/mentor/reports/:id", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    const s = String((req.body as { status?: string }).status ?? "");
    if (!REPORT_STATUSES.includes(s)) return reply.code(400).send({ error: "bad_status" });
    db.prepare("UPDATE reports SET status = ?, reviewer = ? WHERE id = ?").run(s, m.id, (req.params as { id: string }).id);
    return { ok: true };
  });

  // Aggregate numbers only (no content).
  app.get("/api/mentor/stats", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n ?? 0;
    return {
      cases_total: one("SELECT count(*) n FROM handoffs"),
      by_status: db.prepare("SELECT status, count(*) n FROM handoffs GROUP BY status").all(),
      by_reason: db.prepare("SELECT reason, count(*) n FROM handoffs GROUP BY reason ORDER BY n DESC").all(),
      by_lang: db.prepare("SELECT lang, count(*) n FROM handoffs GROUP BY lang ORDER BY n DESC LIMIT 10").all(),
      median_first_reply_minutes: (() => {
        const xs = (db.prepare("SELECT (julianday(first_reply_at) - julianday(created_at)) * 1440 AS d FROM handoffs WHERE first_reply_at IS NOT NULL").all() as { d: number }[]).map((x) => x.d).sort((a, b) => a - b);
        return xs.length ? Math.round(xs[Math.floor(xs.length / 2)]) : null;
      })(),
      reports_open: one("SELECT count(*) n FROM reports WHERE status IN ('new', 'reviewing')"),
      journey: {
        opened_curriculum: one("SELECT count(DISTINCT learner_id) n FROM events WHERE type = 'lesson_open'"),
        completed_prayer: one("SELECT count(DISTINCT learner_id) n FROM events WHERE type = 'lesson_complete' AND detail = 'u3l6'"),
        returned_another_day: one("SELECT count(*) n FROM (SELECT learner_id FROM events GROUP BY learner_id HAVING count(DISTINCT date(created_at)) > 1)"),
      },
    };
  });
}
