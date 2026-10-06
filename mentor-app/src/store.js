// Shared state: the signed-in mentor, the hash route, the case inbox (polled every 15 s) and the alerts
// for new cases and new learner messages (crisis cases keep their own, stronger alert).
import { reactive, ref, computed } from "vue";
import { api, setUnauthorizedHandler } from "./api.js";

// ---------------------------------------------------------------- routing (#/cases, #/cases/:id, #/reports, #/stats)
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "cases" && parts[1]) return { name: "case", id: parts[1] };
  if (parts[0] === "reports") return { name: "reports" };
  if (parts[0] === "stats") return { name: "stats" };
  return { name: "cases" };
}
export const route = ref(parseHash());
window.addEventListener("hashchange", () => { route.value = parseHash(); });
export function go(path) {
  location.hash = path;
}

// ---------------------------------------------------------------- session
// `expired`: the server ended the session (idle or too old); the sign-in page says so.
export const session = reactive({ me: null, checked: false, mentors: [], expired: false });
export const isSupervisor = computed(() => session.me?.role === "supervisor");

setUnauthorizedHandler(() => {
  if (session.me) session.expired = true;
  session.me = null;
  stopPolling();
  resetAlerts();
});

export async function restoreSession() {
  try {
    session.me = await api.me();
    await afterLogin();
  } catch {
    session.me = null;
  } finally {
    session.checked = true;
  }
}

export async function login(email, password) {
  session.me = await api.login(email, password);
  session.expired = false;
  await afterLogin();
}

export async function logout() {
  try { await api.logout(); } catch { /* the cookie is cleared server-side; ignore network errors */ }
  session.me = null;
  stopPolling();
  inbox.data = null;
  resetAlerts();
}

async function afterLogin() {
  try { session.mentors = await api.mentors(); } catch { session.mentors = []; }
  startPolling();
}

// ---------------------------------------------------------------- inbox + polling
export const inbox = reactive({ data: null, error: null, loading: false, updatedAt: null });
export const crisisAlerts = ref([]); // [{ id, case }]
export const toasts = ref([]); // [{ key, id, kind: "case" | "message", case }]
let timer = null;
let seen = null; // Map case id -> last message id, as of the previous poll (null before the first one)

export async function refreshInbox() {
  inbox.loading = true;
  try {
    const data = await api.cases();
    inbox.data = data;
    inbox.error = null;
    inbox.updatedAt = new Date();
    detectNews(data.cases);
  } catch (e) {
    inbox.error = e.code ?? "generic";
  } finally {
    inbox.loading = false;
  }
}

// Compare with the previous poll: a case we have not seen is new; a case whose last message is newer
// and from the learner has a new message. Crisis cases get the red alert and the stronger chime.
function detectNews(cases) {
  const before = seen;
  seen = new Map(cases.map((c) => [c.id, c.last_message_id ?? 0]));
  if (before === null) return;
  const isCrisis = (c) => c.reason === "crisis" && c.status !== "closed";
  const fresh = cases.filter((c) => !before.has(c.id));
  const crisis = fresh.filter(isCrisis);
  const news = [
    ...fresh.filter((c) => !isCrisis(c)).map((c) => ({ kind: "case", c })),
    ...cases.filter((c) => before.has(c.id) && (c.last_message_id ?? 0) > before.get(c.id) && c.last_author === "learner").map((c) => ({ kind: "message", c })),
  ];
  if (crisis.length) crisisAlerts.value = [...crisis.map((c) => ({ id: c.id, case: c })), ...crisisAlerts.value].slice(0, 3);
  news.forEach(({ kind, c }) => addToast(kind, c));
  if (!crisis.length && !news.length) return;
  chime(crisis.length ? "crisis" : "soft");
  flashTitle(crisis.length ? "🔴" : "🔵");
}

function addToast(kind, c) {
  const key = `${kind}:${c.id}:${c.last_message_id ?? 0}`;
  toasts.value = [{ key, id: c.id, kind, case: c }, ...toasts.value.filter((x) => x.id !== c.id)].slice(0, 3);
  setTimeout(() => dismissToast(key), 12000);
}
export function dismissToast(key) {
  toasts.value = toasts.value.filter((x) => x.key !== key);
}

export function dismissAlert(id) {
  crisisAlerts.value = crisisAlerts.value.filter((a) => a.id !== id);
}
function resetAlerts() {
  seen = null;
  crisisAlerts.value = [];
  toasts.value = [];
}

function startPolling() {
  stopPolling();
  refreshInbox();
  timer = setInterval(refreshInbox, 15000);
}
function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ---------------------------------------------------------------- sound + title alert
// Browsers only allow audio after a user gesture, so the chime is armed on the first interaction.
const SOUND_KEY = "mentor.sound";
export const soundOn = ref((() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } })());
export function toggleSound() {
  soundOn.value = !soundOn.value;
  try { localStorage.setItem(SOUND_KEY, soundOn.value ? "on" : "off"); } catch { /* ignore */ }
}
let audio = null;
function arm() {
  if (audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
}
window.addEventListener("pointerdown", arm, { once: true });
window.addEventListener("keydown", arm, { once: true });

// "crisis": three high notes; "soft": two quieter ones for a new case or message.
function chime(kind = "crisis") {
  if (!soundOn.value || !audio) return;
  try {
    if (audio.state === "suspended") audio.resume();
    const now = audio.currentTime;
    const notes = kind === "crisis" ? [880, 660, 880] : [660, 880];
    const peak = kind === "crisis" ? 0.18 : 0.08;
    notes.forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const s = now + i * 0.22;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(peak, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(s);
      o.stop(s + 0.21);
    });
  } catch { /* audio is best-effort */ }
}

let titleTimer = null;
function flashTitle(mark) {
  if (titleTimer || !document.hidden) return;
  const base = document.title;
  let on = false;
  titleTimer = setInterval(() => {
    on = !on;
    document.title = on ? `${mark} ${base}` : base;
  }, 1000);
  const stop = () => {
    if (document.hidden) return;
    clearInterval(titleTimer);
    titleTimer = null;
    document.title = base;
    document.removeEventListener("visibilitychange", stop);
  };
  document.addEventListener("visibilitychange", stop);
}
