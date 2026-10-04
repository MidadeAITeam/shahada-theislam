// SQLite storage. What we keep is deliberately small (idea file: "lesson number and language
// only"; the stated former religion stays in the browser session and is never written here).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  google_sub TEXT UNIQUE,
  name TEXT,
  reminder_hour INTEGER,
  reminder_tz TEXT,
  reminder_enabled INTEGER NOT NULL DEFAULT 0,
  last_reminded_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  lang TEXT,
  choice TEXT,
  country TEXT,             -- only if the user kept it on the start card; used for referral and emergency numbers
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS progress (
  owner TEXT NOT NULL,      -- account id when signed in, else learner id
  lesson_id TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  check_correct INTEGER,
  PRIMARY KEY (owner, lesson_id)
);
CREATE TABLE IF NOT EXISTS login_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  learner_id TEXT,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  mentor TEXT NOT NULL,     -- brother | sister
  reason TEXT NOT NULL,
  lang TEXT,
  country TEXT,
  lesson_id TEXT,
  question TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS handoff_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handoff_id TEXT NOT NULL REFERENCES handoffs(id) ON DELETE CASCADE,
  author TEXT NOT NULL,     -- learner | mentor
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  target TEXT NOT NULL,
  note TEXT,
  lang TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Aggregate counters only (opened curriculum, completed prayer lesson, returned another day...)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

export function event(learnerId: string | null, type: string, detail?: string) {
  db.prepare("INSERT INTO events (learner_id, type, detail) VALUES (?, ?, ?)").run(learnerId, type, detail ?? null);
}
