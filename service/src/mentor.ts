// Follow-up platform for the mentors team: accounts and roles, case inbox, assignment, status,
// internal notes, a per-case timeline, canned replies, error reports and aggregate numbers.
// A mentor sees every case of their own group (brother/sister), including cases a colleague
// holds, so a case is never stranded; a supervisor sees everything. Cases never cross groups.
// Every action is written to the case timeline.
import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.ts";
import { lessonById } from "./curriculum.ts";
import { db, id } from "./db.ts";
import { lessonTitle } from "./lessons.ts";
import { layout, mailText, sendMail } from "./mail.ts";
import { emergencyNumber } from "./messages.ts";
import { clientIp, limiter, tooMany } from "./ratelimit.ts";

db.exec(`
CREATE TABLE IF NOT EXISTS mentors (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  gender TEXT NOT NULL,           -- brother | sister
  role TEXT NOT NULL,             -- mentor | supervisor
  pass_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- One row per sign-in. The cookie carries a random token; only its hash is stored.
CREATE TABLE IF NOT EXISTS mentor_sessions (
  token_hash TEXT PRIMARY KEY, mentor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
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
addCol("handoffs", "demo", "INTEGER NOT NULL DEFAULT 0");
addCol("handoff_messages", "mentor_id", "TEXT");
addCol("reports", "status", "TEXT NOT NULL DEFAULT 'new'");
addCol("reports", "reviewer", "TEXT");
// Older rows used 'queued' / 'answered'.
db.exec("UPDATE handoffs SET status = 'new' WHERE status = 'queued'; UPDATE handoffs SET status = 'in_progress' WHERE status = 'answered';");
// A case with a reply always has a first-reply time (older rows could miss it).
db.exec(`UPDATE handoffs SET first_reply_at = (SELECT min(created_at) FROM handoff_messages m WHERE m.handoff_id = handoffs.id AND m.author = 'mentor')
         WHERE first_reply_at IS NULL AND EXISTS (SELECT 1 FROM handoff_messages m WHERE m.handoff_id = handoffs.id AND m.author = 'mentor')`);
db.exec("CREATE INDEX IF NOT EXISTS handoff_messages_case ON handoff_messages (handoff_id, id)");

export const STATUSES = ["new", "in_progress", "waiting_user", "closed"] as const;
const REPORT_STATUSES = ["new", "reviewing", "fixed", "not_an_error"];
/** Minutes before a case without an answer is overdue: crisis 15 minutes, otherwise 24 hours. */
const slaMinutes = (reason: unknown) => (reason === "crisis" ? 15 : 24 * 60);

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

// Same six replies in each language; titles in the language itself. A language is added when it has none yet.
const CANNED: Record<string, [string, string][]> = {
  ar: [
    ["ترحيب", "وعليكم السلام ورحمة الله، مبارك عليك الإسلام، وأهلاً بك. أنا هنا لأساعدك، فخذ وقتك واسألني عما تشاء."],
    ["سنتواصل قريباً", "شكراً لرسالتك. سأعود إليك هنا في المحادثة خلال 24 ساعة بإذن الله، ويمكنك متابعة دروسك حتى ذلك الحين."],
    ["طلب تفاصيل", "حتى أجيبك إجابة صحيحة أحتاج بعض التفاصيل: هل يمكنك أن تخبرني أكثر عن حالتك؟ ما تكتبه هنا لا يراه إلا فريق المتابعة."],
    ["مسجد أو مركز قريب", "يسعدنا أن نصلك بمسجد أو مركز إسلامي قريب منك. في أي مدينة أنت؟"],
    ["شهادة إشهار الإسلام", "شهادة إشهار الإسلام تصدرها المراكز الإسلامية المعتمدة في بلدك. أخبرني بمدينتك لأدلك على أقربها وعلى الأوراق المطلوبة."],
    ["دعم في ظرف صعب", "أنا معك، وسلامتك أهم شيء الآن. إن كنت في خطر فاتصل بالطوارئ فوراً. وأخبرني: هل أنت في مكان آمن الآن؟"],
  ],
  en: [
    ["Welcome", "Wa alaykum as-salam, and congratulations on Islam. I'm here to help — take your time and ask me anything."],
    ["Will follow up", "Thank you for your message. I'll get back to you here in the chat within 24 hours, in sha Allah. You can continue your lessons in the meantime."],
    ["Ask for details", "To answer you correctly I need a few details. Could you tell me a bit more about your situation? Only the follow-up team can see what you write here."],
    ["Nearby mosque or centre", "We'd be happy to connect you with a mosque or Islamic centre near you. Which city are you in?"],
    ["Certificate of conversion", "A certificate of conversion is issued by recognised Islamic centres in your country. Tell me your city and I'll point you to the nearest one and the documents needed."],
    ["Support in a crisis", "I'm with you, and your safety matters most right now. If you are in danger, please call emergency services immediately. Are you somewhere safe at the moment?"],
  ],
  fr: [
    ["Bienvenue", "Wa alaykoum as-salam, et félicitations pour votre islam. Je suis là pour vous aider : prenez votre temps et posez-moi toutes vos questions."],
    ["Je reviens vers vous", "Merci pour votre message. Je vous répondrai ici, dans la conversation, d'ici 24 heures, in cha Allah. En attendant, vous pouvez continuer vos leçons."],
    ["Demander des précisions", "Pour vous répondre correctement, j'ai besoin de quelques précisions. Pourriez-vous m'en dire un peu plus sur votre situation ? Seule l'équipe de suivi voit ce que vous écrivez ici."],
    ["Mosquée ou centre proche", "Nous serions heureux de vous mettre en relation avec une mosquée ou un centre islamique près de chez vous. Dans quelle ville êtes-vous ?"],
    ["Certificat de conversion", "Le certificat de conversion à l'islam est délivré par les centres islamiques reconnus dans votre pays. Indiquez-moi votre ville et je vous orienterai vers le plus proche et les documents nécessaires."],
    ["Soutien dans une crise", "Je suis avec vous, et votre sécurité compte avant tout. Si vous êtes en danger, appelez immédiatement les services d'urgence. Êtes-vous en sécurité en ce moment ?"],
  ],
  es: [
    ["Bienvenida", "Wa alaykum as-salam, y enhorabuena por tu islam. Estoy aquí para ayudarte: tómate tu tiempo y pregúntame lo que quieras."],
    ["Responderé pronto", "Gracias por tu mensaje. Te responderé aquí, en la conversación, en un plazo de 24 horas, in sha Allah. Mientras tanto, puedes seguir con tus lecciones."],
    ["Pedir detalles", "Para responderte correctamente necesito algunos detalles. ¿Podrías contarme un poco más sobre tu situación? Solo el equipo de seguimiento ve lo que escribes aquí."],
    ["Mezquita o centro cercano", "Con gusto te pondremos en contacto con una mezquita o un centro islámico cerca de ti. ¿En qué ciudad estás?"],
    ["Certificado de conversión", "El certificado de conversión al islam lo expiden los centros islámicos reconocidos de tu país. Dime tu ciudad y te indicaré el más cercano y los documentos necesarios."],
    ["Apoyo en una crisis", "Estoy contigo, y tu seguridad es lo más importante ahora. Si estás en peligro, llama de inmediato a los servicios de emergencia. ¿Estás en un lugar seguro en este momento?"],
  ],
  id: [
    ["Selamat datang", "Wa'alaikumussalam, selamat atas keislaman Anda. Saya di sini untuk membantu; silakan bertanya apa saja tanpa terburu-buru."],
    ["Akan dibalas", "Terima kasih atas pesan Anda. Saya akan membalas di percakapan ini dalam 24 jam, insya Allah. Sementara itu, Anda bisa melanjutkan pelajaran."],
    ["Meminta rincian", "Agar dapat menjawab dengan benar, saya perlu beberapa rincian. Bisakah Anda menceritakan sedikit lebih banyak tentang keadaan Anda? Hanya tim pendamping yang dapat melihat apa yang Anda tulis di sini."],
    ["Masjid atau pusat terdekat", "Kami dengan senang hati akan menghubungkan Anda dengan masjid atau pusat Islam di dekat Anda. Anda tinggal di kota mana?"],
    ["Sertifikat masuk Islam", "Sertifikat masuk Islam dikeluarkan oleh pusat-pusat Islam resmi di negara Anda. Beri tahu saya kota Anda, dan saya akan menunjukkan yang terdekat beserta dokumen yang diperlukan."],
    ["Dukungan saat krisis", "Saya bersama Anda, dan keselamatan Anda adalah yang terpenting saat ini. Jika Anda dalam bahaya, segera hubungi layanan darurat. Apakah Anda berada di tempat yang aman sekarang?"],
  ],
  ru: [
    ["Приветствие", "Ва алейкум ас-салям! Поздравляю вас с принятием ислама. Я здесь, чтобы помочь: не торопитесь и спрашивайте о чём угодно."],
    ["Отвечу позже", "Спасибо за ваше сообщение. Я отвечу вам здесь, в переписке, в течение 24 часов, ин ша Аллах. А пока вы можете продолжать уроки."],
    ["Уточнить детали", "Чтобы ответить правильно, мне нужны некоторые подробности. Не могли бы вы рассказать немного больше о своей ситуации? То, что вы пишете здесь, видит только команда сопровождения."],
    ["Мечеть или центр рядом", "Мы будем рады связать вас с мечетью или исламским центром рядом с вами. В каком городе вы находитесь?"],
    ["Свидетельство о принятии ислама", "Свидетельство о принятии ислама выдают признанные исламские центры в вашей стране. Напишите, в каком вы городе, и я подскажу ближайший центр и нужные документы."],
    ["Поддержка в трудной ситуации", "Я с вами, и сейчас важнее всего ваша безопасность. Если вам угрожает опасность, немедленно позвоните в экстренные службы. Вы сейчас в безопасном месте?"],
  ],
};

export function seedCanned() {
  const st = db.prepare("INSERT INTO canned_replies (lang, title, text) VALUES (?, ?, ?)");
  for (const [lang, rows] of Object.entries(CANNED)) {
    if ((db.prepare("SELECT count(*) n FROM canned_replies WHERE lang = ?").get(lang) as { n: number }).n) continue;
    rows.forEach(([title, text]) => st.run(lang, title, text));
  }
}

export function caseEvent(handoffId: string, actor: string | null, type: string, detail?: string) {
  db.prepare("INSERT INTO handoff_events (handoff_id, actor, type, detail) VALUES (?, ?, ?, ?)").run(handoffId, actor, type, detail ?? null);
}

// ---------------------------------------------------------------- learner side (called from server.ts)
/** A lesson id the curriculum knows, else null. */
export const knownLesson = (v: unknown) => (typeof v === "string" && lessonById(v) ? v : null);

export function createHandoff(o: { learnerId: string; mentor: "brother" | "sister"; reason: string; lang: string; country: string | null; lessonId: string | null; question: string }) {
  const hid = id("h");
  db.prepare("INSERT INTO handoffs (id, learner_id, mentor, reason, lang, country, lesson_id, question, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')")
    .run(hid, o.learnerId, o.mentor, o.reason, o.lang, o.country, knownLesson(o.lessonId), o.question);
  // The question is also the first message of the conversation, so both sides read one thread.
  if (o.question) db.prepare("INSERT INTO handoff_messages (handoff_id, author, text) VALUES (?, 'learner', ?)").run(hid, o.question);
  caseEvent(hid, null, "created", o.reason);
  return hid;
}

/** A learner's message: back to "in progress" so the team sees it waits for them; a closed case reopens. */
export function learnerMessage(hid: string, text: string) {
  const h = db.prepare("SELECT status FROM handoffs WHERE id = ?").get(hid) as { status: string } | undefined;
  if (!h) return null;
  const r = db.prepare("INSERT INTO handoff_messages (handoff_id, author, text) VALUES (?, 'learner', ?)").run(hid, text);
  caseEvent(hid, null, "learner_message");
  if (h.status === "closed") {
    db.prepare("UPDATE handoffs SET status = 'in_progress', closed_reason = NULL, closed_at = NULL WHERE id = ?").run(hid);
    caseEvent(hid, null, "reopened", "learner_message");
  } else if (h.status === "waiting_user") {
    db.prepare("UPDATE handoffs SET status = 'in_progress' WHERE id = ?").run(hid);
    caseEvent(hid, null, "status", "in_progress");
  }
  return Number(r.lastInsertRowid);
}

// ---------------------------------------------------------------- auth (server-side sessions)
const SESSION_IDLE_HOURS = 12;  // signed out after 12 hours without activity...
const SESSION_MAX_DAYS = 7;     // ...and after 7 days in any case
const tokenHash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const loginFails = limiter(5, 15 * 60 * 1000);   // per address + email
const loginFailsIp = limiter(30, 15 * 60 * 1000); // per address, whatever the email

interface Mentor { id: string; name: string; email: string; gender: string; role: string }
function sessionToken(req: FastifyRequest): string | null {
  const c = req.cookies.mentor ? req.unsignCookie(req.cookies.mentor) : null;
  return c?.valid && c.value ? c.value : null;
}
function current(req: FastifyRequest): Mentor | null {
  const token = sessionToken(req);
  if (!token) return null;
  const h = tokenHash(token);
  const row = db.prepare(`SELECT m.id, m.name, m.email, m.gender, m.role, s.last_seen_at FROM mentor_sessions s JOIN mentors m ON m.id = s.mentor_id
    WHERE s.token_hash = ? AND m.active = 1 AND s.last_seen_at > datetime('now', ?) AND s.created_at > datetime('now', ?)`)
    .get(h, `-${SESSION_IDLE_HOURS} hours`, `-${SESSION_MAX_DAYS} days`) as (Mentor & { last_seen_at: string }) | undefined;
  if (!row) return null;
  // Sliding expiry, written at most once a minute.
  db.prepare("UPDATE mentor_sessions SET last_seen_at = datetime('now') WHERE token_hash = ? AND last_seen_at < datetime('now', '-1 minute')").run(h);
  const { last_seen_at: _, ...m } = row;
  return m;
}
function guard(req: FastifyRequest, reply: FastifyReply): Mentor | null {
  const m = current(req);
  if (!m) reply.code(401).send({ error: "login" });
  return m;
}
const canSee = (m: Mentor, h: Record<string, any>) => m.role === "supervisor" || h.assigned_to === m.id || h.mentor === m.gender;

const minutesSince = (s: unknown) => (s ? Math.round((Date.now() - Date.parse(String(s).replace(" ", "T") + "Z")) / 60000) : null);
function shape(h: Record<string, unknown>) {
  const ageMin = minutesSince(h.created_at) ?? 0;
  const sla = slaMinutes(h.reason);
  // After the first reply, a learner message without a later team reply waits for an answer again.
  const awaiting = h.status !== "closed" && Boolean(h.first_reply_at) && Boolean(h.learner_waiting_since);
  const awaitingMin = awaiting ? minutesSince(h.learner_waiting_since) : null;
  return {
    ...h,
    lesson_title: h.lesson_id ? lessonTitle(String(h.lesson_id), String(h.lang ?? "en")) : null,
    age_minutes: ageMin,
    awaiting_reply: awaiting,
    awaiting_minutes: awaitingMin,
    overdue: h.status !== "closed" && ((!h.first_reply_at && ageMin > sla) || (awaiting && (awaitingMin ?? 0) > sla)),
    emergency_number: h.reason === "crisis" ? emergencyNumber(h.country as string | null) : null,
  };
}
const CASE_SQL = `SELECT h.*, mt.name AS assigned_name,
    (SELECT text FROM handoff_messages WHERE handoff_id = h.id ORDER BY id DESC LIMIT 1) AS last_message,
    (SELECT author FROM handoff_messages WHERE handoff_id = h.id ORDER BY id DESC LIMIT 1) AS last_author,
    (SELECT max(id) FROM handoff_messages WHERE handoff_id = h.id) AS last_message_id,
    (SELECT min(created_at) FROM handoff_messages lm WHERE lm.handoff_id = h.id AND lm.author = 'learner'
       AND lm.id > coalesce((SELECT max(id) FROM handoff_messages mm WHERE mm.handoff_id = h.id AND mm.author = 'mentor'), 0)) AS learner_waiting_since
  FROM handoffs h LEFT JOIN mentors mt ON mt.id = h.assigned_to`;

// A learner who saved their progress with an e-mail gets a short notice with a sign-in link, so the
// reply reaches them on any device. At most one notice per case per hour, written on the timeline.
async function notifyLearner(h: Record<string, any>) {
  const to = db.prepare("SELECT a.email, l.lang FROM learners l JOIN accounts a ON a.id = l.account_id WHERE l.id = ? AND a.email IS NOT NULL").get(h.learner_id) as { email: string; lang: string | null } | undefined;
  if (!to) return;
  if (db.prepare("SELECT 1 FROM handoff_events WHERE handoff_id = ? AND type = 'notified' AND created_at > datetime('now', '-1 hour')").get(h.id)) return;
  const lang = String(h.lang ?? to.lang ?? "en");
  const t = mailText(lang);
  const token = id("t") + id("");
  db.prepare("INSERT INTO login_tokens (token, email, learner_id, expires_at) VALUES (?, ?, ?, datetime('now', '+3 days'))").run(token, to.email, h.learner_id);
  const link = `${config.publicUrl}/api/shahada/auth/verify?token=${token}`;
  if (await sendMail(to.email, t.replySubject, layout(lang, t.reply, link, t.openReply), `${t.reply}\n${link}`)) caseEvent(h.id, null, "notified");
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

export function registerMentorRoutes(app: FastifyInstance) {
  seedMentors();
  seedCanned();
  seedDemoCases();

  // The mentors' pages and API are never framed and never sniffed; learner pages keep their framing as before.
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    const p = req.url.split("?")[0];
    if (p === "/mentor" || p.startsWith("/mentor/") || p.startsWith("/api/mentor/")) {
      reply.header("X-Frame-Options", "DENY");
      reply.header("Content-Security-Policy", "frame-ancestors 'none'");
      if (p.startsWith("/api/mentor/")) reply.header("Cache-Control", "no-store");
    }
    return payload;
  });

  app.post("/api/mentor/login", async (req, reply) => {
    const b = (req.body ?? {}) as { email?: string; password?: string };
    const email = String(b.email ?? "").trim().toLowerCase().slice(0, 200);
    const ip = clientIp(req);
    for (const lim of [loginFails.blocked(`${ip}|${email}`), loginFailsIp.blocked(ip)])
      if (lim.blocked) return tooMany(reply, lim.retryAfter);
    const m = db.prepare("SELECT * FROM mentors WHERE email = ? AND active = 1").get(email) as (Mentor & { pass_hash: string }) | undefined;
    if (!m || !verify(String(b.password ?? ""), m.pass_hash)) {
      loginFails.hit(`${ip}|${email}`);
      loginFailsIp.hit(ip);
      return reply.code(401).send({ error: "wrong_credentials" });
    }
    loginFails.reset(`${ip}|${email}`);
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare("DELETE FROM mentor_sessions WHERE last_seen_at < datetime('now', ?) OR created_at < datetime('now', ?)").run(`-${SESSION_IDLE_HOURS} hours`, `-${SESSION_MAX_DAYS} days`);
    db.prepare("INSERT INTO mentor_sessions (token_hash, mentor_id) VALUES (?, ?)").run(tokenHash(token), m.id);
    reply.setCookie("mentor", token, { path: "/", httpOnly: true, sameSite: "lax", secure: config.publicUrl.startsWith("https"), signed: true, maxAge: 60 * 60 * 24 * SESSION_MAX_DAYS });
    return { id: m.id, name: m.name, email: m.email, gender: m.gender, role: m.role };
  });
  app.post("/api/mentor/logout", async (req, reply) => {
    const token = sessionToken(req);
    if (token) db.prepare("DELETE FROM mentor_sessions WHERE token_hash = ?").run(tokenHash(token));
    reply.clearCookie("mentor", { path: "/" });
    return { ok: true };
  });
  app.get("/api/mentor/me", async (req, reply) => guard(req, reply));

  app.get("/api/mentor/mentors", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    return db.prepare("SELECT id, name, gender, role FROM mentors WHERE active = 1 ORDER BY role DESC, name").all();
  });

  app.get("/api/mentor/cases", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    const q = req.query as { status?: string; reason?: string; gender?: string; lang?: string; mine?: string };
    const rows = (db.prepare(`${CASE_SQL} ORDER BY h.created_at DESC LIMIT 500`).all() as Record<string, any>[]).filter((h) => canSee(m, h));
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
    const h = db.prepare(`${CASE_SQL} WHERE h.id = ?`).get((req.params as { id: string }).id) as Record<string, any> | undefined;
    if (!h || !canSee(m, h)) { reply.code(404).send({ error: "not_found" }); return null; }
    return { m, h };
  }

  app.get("/api/mentor/cases/:id", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    return {
      case: shape(r.h),
      messages: db.prepare("SELECT hm.id, hm.author, hm.text, hm.created_at, mt.name AS mentor_name FROM handoff_messages hm LEFT JOIN mentors mt ON mt.id = hm.mentor_id WHERE hm.handoff_id = ? ORDER BY hm.id").all(r.h.id),
      notes: db.prepare("SELECT n.id, n.text, n.created_at, m.name FROM handoff_notes n JOIN mentors m ON m.id = n.mentor_id WHERE handoff_id = ? ORDER BY n.id").all(r.h.id),
      events: db.prepare("SELECT e.type, e.detail, e.created_at, m.name AS actor FROM handoff_events e LEFT JOIN mentors m ON m.id = e.actor WHERE handoff_id = ? ORDER BY e.id").all(r.h.id),
    };
  });

  // Any mentor of the case's group may answer (a colleague's case too); the answer then waits for the learner.
  app.post("/api/mentor/cases/:id/reply", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    const text = String((req.body as { text?: string })?.text ?? "").trim();
    if (!text) return reply.code(400).send({ error: "empty" });
    if (text.length > 4000) return reply.code(400).send({ error: "too_long" });
    db.prepare("INSERT INTO handoff_messages (handoff_id, author, text, mentor_id) VALUES (?, 'mentor', ?, ?)").run(r.h.id, text, r.m.id);
    if (!r.h.first_reply_at) db.prepare("UPDATE handoffs SET first_reply_at = datetime('now') WHERE id = ?").run(r.h.id);
    if (!r.h.assigned_to) { db.prepare("UPDATE handoffs SET assigned_to = ? WHERE id = ?").run(r.m.id, r.h.id); caseEvent(r.h.id, r.m.id, "assigned", r.m.name); }
    caseEvent(r.h.id, r.m.id, "replied");
    notifyLearner(r.h).catch(() => { /* best effort: the reply is in the learning space anyway */ });
    if (r.h.status !== "waiting_user") {
      db.prepare("UPDATE handoffs SET status = 'waiting_user', closed_reason = NULL, closed_at = NULL WHERE id = ?").run(r.h.id);
      caseEvent(r.h.id, null, "status", "waiting_user");
    }
    return { ok: true };
  });

  app.post("/api/mentor/cases/:id/assign", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    const to = String((req.body as { mentor_id?: string })?.mentor_id ?? "");
    if (r.m.role !== "supervisor" && to !== r.m.id) return reply.code(403).send({ error: "supervisor_only" });
    const target = db.prepare("SELECT id, name, gender, role FROM mentors WHERE id = ? AND active = 1").get(to) as { id: string; name: string; gender: string; role: string } | undefined;
    if (!target) return reply.code(400).send({ error: "unknown_mentor" });
    // A sister's case stays with sisters and a brother's with brothers; supervisors oversee both.
    if (target.role !== "supervisor" && target.gender !== r.h.mentor) return reply.code(400).send({ error: "cross_gender" });
    if (target.id === r.h.assigned_to) return { ok: true };
    db.prepare("UPDATE handoffs SET assigned_to = ? WHERE id = ?").run(target.id, r.h.id);
    if (r.h.assigned_to) caseEvent(r.h.id, r.m.id, "handover", `${r.h.assigned_name ?? "?"} → ${target.name}`);
    else caseEvent(r.h.id, r.m.id, "assigned", target.name);
    return { ok: true };
  });

  // Supervisor housekeeping: close several cases at once (e.g. test cases), each with its own timeline event.
  app.post("/api/mentor/cases/bulk-close", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    if (m.role !== "supervisor") return reply.code(403).send({ error: "supervisor_only" });
    const b = (req.body ?? {}) as { ids?: unknown; reason?: string };
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === "string"))].slice(0, 200) : [];
    const reason = String(b.reason ?? "").trim().slice(0, 300);
    if (!ids.length || !reason) return reply.code(400).send({ error: "ids_and_reason_required" });
    const close = db.prepare("UPDATE handoffs SET status = 'closed', closed_reason = ?, closed_at = datetime('now') WHERE id = ? AND status != 'closed'");
    let closed = 0;
    db.transaction(() => {
      for (const id of ids) if (close.run(reason, id).changes) { closed++; caseEvent(id, m.id, "status", `closed: ${reason}`); }
    })();
    return { ok: true, closed };
  });

  app.post("/api/mentor/cases/:id/status", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    const b = (req.body ?? {}) as { status?: string; reason?: string };
    if (!STATUSES.includes(b.status as any)) return reply.code(400).send({ error: "bad_status" });
    db.prepare("UPDATE handoffs SET status = ?, closed_reason = ?, closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END WHERE id = ?")
      .run(b.status, b.status === "closed" ? String(b.reason ?? "").slice(0, 300) || null : null, b.status, r.h.id);
    caseEvent(r.h.id, r.m.id, "status", b.status + (b.reason ? `: ${b.reason}` : ""));
    return { ok: true };
  });

  app.post("/api/mentor/cases/:id/notes", async (req, reply) => {
    const r = load(req, reply); if (!r) return;
    const text = String((req.body as { text?: string })?.text ?? "").trim().slice(0, 4000);
    if (!text) return reply.code(400).send({ error: "empty" });
    db.prepare("INSERT INTO handoff_notes (handoff_id, mentor_id, text) VALUES (?, ?, ?)").run(r.h.id, r.m.id, text);
    caseEvent(r.h.id, r.m.id, "note");
    return { ok: true };
  });

  // The case's own language first, then English and Arabic, which every mentor can fall back on.
  app.get("/api/mentor/canned", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    const lang = String((req.query as { lang?: string }).lang ?? "");
    return db.prepare("SELECT id, lang, title, text FROM canned_replies WHERE lang IN (?, 'en', 'ar') ORDER BY lang = ? DESC, lang = 'en' DESC, id").all(lang, lang);
  });

  app.get("/api/mentor/reports", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    const rows = db.prepare("SELECT r.id, r.target, r.note, r.lang, r.status, r.created_at, m.name AS reviewer FROM reports r LEFT JOIN mentors m ON m.id = r.reviewer ORDER BY r.id DESC LIMIT 300").all() as Record<string, any>[];
    return rows.map((r) => {
      const [kind, ...rest] = String(r.target ?? "").split(":");
      const ref = rest.join(":");
      return { ...r, lesson_id: kind === "lesson" ? knownLesson(ref) : null, lesson_title: kind === "lesson" && knownLesson(ref) ? lessonTitle(ref, String(r.lang ?? "en")) : null };
    });
  });
  app.post("/api/mentor/reports/:id", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    if (m.role !== "supervisor") return reply.code(403).send({ error: "supervisor_only" });
    const s = String((req.body as { status?: string })?.status ?? "");
    if (!REPORT_STATUSES.includes(s)) return reply.code(400).send({ error: "bad_status" });
    const res = db.prepare("UPDATE reports SET status = ?, reviewer = ? WHERE id = ?").run(s, m.id, (req.params as { id: string }).id);
    if (!res.changes) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  // Aggregate numbers only (no content).
  app.get("/api/mentor/stats", async (req, reply) => {
    const m = guard(req, reply); if (!m) return;
    if (m.role !== "supervisor") return reply.code(403).send({ error: "supervisor_only" });
    const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n ?? 0;
    // Minutes to the first reply, with who sent it.
    const firsts = db.prepare(`SELECT h.reason, hm.mentor_id, (julianday(hm.created_at) - julianday(h.created_at)) * 1440 AS d
      FROM handoffs h JOIN handoff_messages hm ON hm.id = (SELECT min(id) FROM handoff_messages WHERE handoff_id = h.id AND author = 'mentor')`).all() as { reason: string; mentor_id: string | null; d: number }[];
    const open = (db.prepare(`${CASE_SQL} WHERE h.status != 'closed'`).all() as Record<string, any>[]).map(shape) as Record<string, any>[];
    const mentors = db.prepare(`SELECT m.id, m.name, m.gender, m.role,
        (SELECT count(*) FROM handoffs h WHERE h.assigned_to = m.id AND h.status != 'closed') AS open_cases,
        (SELECT count(*) FROM handoff_messages hm WHERE hm.mentor_id = m.id AND hm.created_at > datetime('now', '-7 days')) AS replies_7d
      FROM mentors m WHERE m.active = 1 ORDER BY m.role DESC, m.name`).all() as Record<string, any>[];
    return {
      cases_total: one("SELECT count(*) n FROM handoffs"),
      by_status: db.prepare("SELECT status, count(*) n FROM handoffs GROUP BY status").all(),
      by_reason: db.prepare("SELECT reason, count(*) n FROM handoffs GROUP BY reason ORDER BY n DESC").all(),
      by_lang: db.prepare("SELECT lang, count(*) n FROM handoffs GROUP BY lang ORDER BY n DESC LIMIT 10").all(),
      median_first_reply_minutes: median(firsts.map((x) => x.d)),
      crisis_median_first_reply_minutes: median(firsts.filter((x) => x.reason === "crisis").map((x) => x.d)),
      // First replies that came later than the SLA, plus cases still unanswered past it.
      sla_breaches: firsts.filter((x) => x.d > slaMinutes(x.reason)).length
        + open.filter((h) => !h.first_reply_at && h.age_minutes > slaMinutes(h.reason)).length,
      overdue_now: open.filter((h) => h.overdue).length,
      awaiting_reply: open.filter((h) => h.awaiting_reply).length,
      mentors: mentors.map((x) => ({ ...x, median_first_reply_minutes: median(firsts.filter((f) => f.mentor_id === x.id).map((f) => f.d)) })),
      reports_open: one("SELECT count(*) n FROM reports WHERE status IN ('new', 'reviewing')"),
      journey: {
        opened_curriculum: one("SELECT count(DISTINCT learner_id) n FROM events WHERE type = 'lesson_open'"),
        completed_prayer: one("SELECT count(DISTINCT learner_id) n FROM events WHERE type = 'lesson_complete' AND detail = 'u3l6'"),
        returned_another_day: one("SELECT count(*) n FROM (SELECT learner_id FROM events GROUP BY learner_id HAVING count(DISTINCT date(created_at)) > 1)"),
      },
    };
  });
}

// ---------------------------------------------------------------- demo cases
// Synthetic cases for the judges' demo (DEMO_CASES=0 turns them off). They are written once, and
// on every start their times are moved so the inbox always reads like a team at work today: a
// crisis taken within minutes, a reply waiting for the learner, a learner who wrote back, a few
// new cases inside their time limit, one closed. Cases created earlier through the API with the
// same synthetic questions are adopted rather than duplicated.
interface DemoCase {
  reason: string; mentor: "brother" | "sister"; lang: string; country: string; lesson: string | null; question: string;
  ageMin: number;                                   // how long ago the case was opened
  reply?: { afterMin: number; canned: number };     // the team's first reply (index into CANNED)
  followUp?: { afterMin: number; text: string };    // the learner wrote back (and waits for an answer)
  closed?: string;                                  // closing reason
}
const DEMO: DemoCase[] = [
  { reason: "crisis", mentor: "sister", lang: "ar", country: "EG", lesson: "u3l3", question: "أهلي اكتشفوا إسلامي وأنا خائفة جداً ولا أعرف ماذا أفعل الليلة", ageMin: 9, reply: { afterMin: 3, canned: 5 } },
  { reason: "crisis", mentor: "sister", lang: "ar", country: "SA", lesson: "u3l3", question: "أشعر بخوف شديد، أسرتي هددتني بعد أن عرفوا أنني أسلمت. لا أعرف إلى أين أذهب.", ageMin: 95, reply: { afterMin: 6, canned: 5 } },
  { reason: "crisis", mentor: "brother", lang: "en", country: "NG", lesson: "u2l2", question: "I have been kicked out of my home and I have nowhere to sleep tonight.", ageMin: 140, reply: { afterMin: 8, canned: 5 } },
  { reason: "fatwa_personal", mentor: "brother", lang: "en", country: "GB", lesson: "u3l6", question: "My wife is not Muslim yet. Is our marriage still valid after my shahada? We have two children.", ageMin: 50 },
  { reason: "practical_need", mentor: "brother", lang: "ar", country: "DE", lesson: "u2l1", question: "أحتاج شهادة إشهار إسلام لأوراق رسمية في ألمانيا، من أين أحصل عليها؟", ageMin: 320, reply: { afterMin: 70, canned: 4 }, followUp: { afterMin: 150, text: "أنا في برلين. هل أحتاج إلى شهود؟" } },
  { reason: "not_in_book", mentor: "sister", lang: "fr", country: "FR", lesson: "u3l1", question: "Est-ce que je peux garder mon prénom d'origine après ma conversion ?", ageMin: 130 },
  { reason: "user_request", mentor: "brother", lang: "en", country: "US", lesson: null, question: "I would like to talk to a real person about how to tell my parents.", ageMin: 26 * 60, reply: { afterMin: 3 * 60, canned: 0 } },
  { reason: "unsure", mentor: "sister", lang: "en", country: "CA", lesson: "u3l2", question: "I work night shifts as a nurse. How do I fit the five prayers around my schedule?", ageMin: 3 * 24 * 60, reply: { afterMin: 5 * 60, canned: 2 }, followUp: { afterMin: 7 * 60, text: "I start at 7pm and finish at 7am." }, closed: "Question answered" },
  { reason: "failed", mentor: "brother", lang: "ar", country: "JO", lesson: "u1l3", question: "ما حكم صلاتي إذا نسيت عدد الركعات في كل مرة؟", ageMin: 20 },
];

const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const minutesAgo = (n: number) => sqlTime(new Date(Date.now() - n * 60000));

export function seedDemoCases() {
  if (!config.demoCases) return;
  const mentorBy = (gender: string) => db.prepare("SELECT id, name FROM mentors WHERE gender = ? AND role = 'mentor' AND active = 1 ORDER BY created_at LIMIT 1").get(gender) as { id: string; name: string } | undefined;
  db.transaction(() => {
    DEMO.forEach((d, i) => {
      // Adopt cases made from the same synthetic question through the API.
      db.prepare("UPDATE handoffs SET demo = 1 WHERE demo = 0 AND question = ? AND question NOT LIKE '[AUDIT%'").run(d.question);
      let ids = (db.prepare("SELECT id FROM handoffs WHERE demo = 1 AND question = ?").all(d.question) as { id: string }[]).map((r) => r.id);
      if (!ids.length) {
        const lid = `l_demo${i + 1}`;
        db.prepare("INSERT OR IGNORE INTO learners (id, lang, country) VALUES (?, ?, ?)").run(lid, d.lang, d.country);
        const hid = `h_demo${i + 1}`;
        db.prepare("INSERT INTO handoffs (id, learner_id, mentor, reason, lang, country, lesson_id, question, status, demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', 1, ?)")
          .run(hid, lid, d.mentor, d.reason, d.lang, d.country, d.lesson, d.question, minutesAgo(d.ageMin));
        db.prepare("INSERT INTO handoff_messages (handoff_id, author, text, created_at) VALUES (?, 'learner', ?, ?)").run(hid, d.question, minutesAgo(d.ageMin));
        db.prepare("INSERT INTO handoff_events (handoff_id, type, detail, created_at) VALUES (?, 'created', ?, ?)").run(hid, d.reason, minutesAgo(d.ageMin));
        ids = [hid];
      }
      for (const hid of ids) scriptDemo(hid, d, mentorBy(d.mentor));
    });
  })();
}

/** Make a demo case match its script (reply, follow-up, status), then move its times to today. */
function scriptDemo(hid: string, d: DemoCase, mentor: { id: string; name: string } | undefined) {
  const h = db.prepare("SELECT * FROM handoffs WHERE id = ?").get(hid) as Record<string, any>;
  const at = (min: number) => sqlTime(new Date(Date.parse(String(h.created_at).replace(" ", "T") + "Z") + min * 60000));
  const has = (author: string) => (db.prepare("SELECT count(*) n FROM handoff_messages WHERE handoff_id = ? AND author = ?").get(hid, author) as { n: number }).n;
  if (d.reply && mentor) {
    if (!h.assigned_to) {
      db.prepare("UPDATE handoffs SET assigned_to = ? WHERE id = ?").run(mentor.id, hid);
      db.prepare("INSERT INTO handoff_events (handoff_id, actor, type, detail, created_at) VALUES (?, ?, 'assigned', ?, ?)").run(hid, mentor.id, mentor.name, at(d.reply.afterMin - 1));
    }
    if (!has("mentor")) {
      const text = (CANNED[d.lang] ?? CANNED.en)[d.reply.canned][1];
      db.prepare("INSERT INTO handoff_messages (handoff_id, author, text, mentor_id, created_at) VALUES (?, 'mentor', ?, ?, ?)").run(hid, text, h.assigned_to ?? mentor.id, at(d.reply.afterMin));
      db.prepare("INSERT INTO handoff_events (handoff_id, actor, type, created_at) VALUES (?, ?, 'replied', ?)").run(hid, h.assigned_to ?? mentor.id, at(d.reply.afterMin));
      if (d.followUp) {
        db.prepare("INSERT INTO handoff_messages (handoff_id, author, text, created_at) VALUES (?, 'learner', ?, ?)").run(hid, d.followUp.text, at(d.followUp.afterMin));
        db.prepare("INSERT INTO handoff_events (handoff_id, type, created_at) VALUES (?, 'learner_message', ?)").run(hid, at(d.followUp.afterMin));
      }
      const status = d.closed ? "closed" : d.followUp ? "in_progress" : "waiting_user";
      db.prepare("UPDATE handoffs SET status = ?, closed_reason = ?, closed_at = ? WHERE id = ?").run(status, d.closed ?? null, d.closed ? at((d.followUp?.afterMin ?? d.reply.afterMin) + 30) : null, hid);
      if (d.closed) db.prepare("INSERT INTO handoff_events (handoff_id, actor, type, detail, created_at) VALUES (?, ?, 'status', ?, ?)").run(hid, mentor.id, `closed: ${d.closed}`, at((d.followUp?.afterMin ?? d.reply.afterMin) + 30));
    }
  }
  db.prepare(`UPDATE handoffs SET first_reply_at = (SELECT min(created_at) FROM handoff_messages WHERE handoff_id = ? AND author = 'mentor') WHERE id = ?`).run(hid, hid);
  // Move every time of the case by the same amount, so it was opened d.ageMin minutes ago (or, when
  // people have worked on it since, so that its latest activity was a couple of minutes ago).
  const ms = (v: unknown) => Date.parse(String(v).replace(" ", "T") + "Z");
  const latest = (db.prepare(`SELECT max(t) t FROM (SELECT created_at t FROM handoff_messages WHERE handoff_id = @hid
    UNION ALL SELECT created_at FROM handoff_events WHERE handoff_id = @hid UNION ALL SELECT created_at FROM handoff_notes WHERE handoff_id = @hid)`).get({ hid }) as { t: string | null }).t;
  const spanMin = latest ? Math.max(0, (ms(latest) - ms(h.created_at)) / 60000) : 0;
  const shift = Math.round((ms(minutesAgo(Math.max(d.ageMin, spanMin + 2))) - ms(h.created_at)) / 1000);
  if (Math.abs(shift) < 60) return;
  const s = `${shift >= 0 ? "+" : ""}${shift} seconds`;
  db.prepare("UPDATE handoffs SET created_at = datetime(created_at, ?), first_reply_at = datetime(first_reply_at, ?), closed_at = datetime(closed_at, ?) WHERE id = ?").run(s, s, s, hid);
  for (const t of ["handoff_messages", "handoff_events", "handoff_notes"]) db.prepare(`UPDATE ${t} SET created_at = datetime(created_at, ?) WHERE handoff_id = ?`).run(s, hid);
}
