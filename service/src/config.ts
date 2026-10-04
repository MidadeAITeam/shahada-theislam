import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../..");

const env = (k: string, d = "") => process.env[k] ?? d;

export const config = {
  port: parseInt(env("PORT", "8080"), 10),
  publicUrl: env("PUBLIC_URL", "http://localhost:8080"),
  dataDir: env("DATA_DIR", path.join(ROOT, "data")),
  dbPath: env("DB_PATH", path.join(ROOT, "data/app.sqlite")),
  webDir: env("WEB_DIR", path.join(ROOT, "web/dist")),

  // Models (switchable by configuration only, as promised in the idea file)
  provider: env("LLM_PROVIDER", "gemini") as "gemini" | "openai",
  geminiKey: env("GEMINI_API_KEY"),
  openaiKey: env("OPENAI_API_KEY"),
  genModel: env("GEN_MODEL", "gemini-3.8-flash"),
  routerModel: env("ROUTER_MODEL", "gemini-3.5-flash-lite"),
  embedModel: env("EMBED_MODEL", "gemini-embedding-2"),
  openaiGenModel: env("OPENAI_GEN_MODEL", "gpt-5.4-mini"),
  chatModel: env("CHAT_MODEL", "gpt-5.4-mini"), // pre-Shahada da'wah chat (the platform's own role)

  // Retrieval
  minRelevance: parseFloat(env("MIN_RELEVANCE", "0.55")),
  topK: parseInt(env("TOP_K", "6"), 10),

  // Auth and mail
  googleClientId: env("GOOGLE_CLIENT_ID"),
  sessionSecret: env("SESSION_SECRET", "dev-only-secret"),
  mailFrom: env("MAIL_FROM", "Theislam.chat <lessons@theislam.chat>"),
  resendKey: env("RESEND_API_KEY"),
  cfAccountId: env("CF_ACCOUNT_ID"),
  cfEmailToken: env("CF_EMAIL_TOKEN"),

  // Mentor panel (demo account)
  mentorPassword: env("MENTOR_PASSWORD", "mentor-demo"),
};

/** Editions converted to text. Others are answered from these with a "machine-translated explanation" label. */
export const CONVERTED = ["ar", "en", "fr", "es", "id", "pt", "ru", "bs", "vi", "th"];
