// Shared state: the signed-in mentor, the hash route, the case inbox (polled every 15 s) and crisis alerts.
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
export const session = reactive({ me: null, checked: false, mentors: [] });
export const isSupervisor = computed(() => session.me?.role === "supervisor");

setUnauthorizedHandler(() => {
  session.me = null;
  stopPolling();
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
  await afterLogin();
}

export async function logout() {
  try { await api.logout(); } catch { /* the cookie is cleared server-side; ignore network errors */ }
  session.me = null;
  stopPolling();
  inbox.data = null;
  seenCrisis = null;
}

async function afterLogin() {
  try { session.mentors = await api.mentors(); } catch { session.mentors = []; }
  startPolling();
}

// ---------------------------------------------------------------- inbox + polling
export const inbox = reactive({ data: null, error: null, loading: false, updatedAt: null });
export const crisisAlerts = ref([]); // [{ id, case }]
let timer = null;
let seenCrisis = null; // Set of open crisis case ids already seen

export async function refreshInbox() {
  inbox.loading = true;
  try {
    const data = await api.cases();
    inbox.data = data;
    inbox.error = null;
    inbox.updatedAt = new Date();
    detectCrisis(data.cases);
  } catch (e) {
    inbox.error = e.code ?? "generic";
  } finally {
    inbox.loading = false;
  }
}

function detectCrisis(cases) {
  const open = cases.filter((c) => c.reason === "crisis" && c.status !== "closed");
  if (seenCrisis === null) {
    seenCrisis = new Set(open.map((c) => c.id));
    return;
  }
  const fresh = open.filter((c) => !seenCrisis.has(c.id));
  fresh.forEach((c) => seenCrisis.add(c.id));
  if (!fresh.length) return;
  crisisAlerts.value = [...fresh.map((c) => ({ id: c.id, case: c })), ...crisisAlerts.value].slice(0, 3);
  chime();
  flashTitle();
}

export function dismissAlert(id) {
  crisisAlerts.value = crisisAlerts.value.filter((a) => a.id !== id);
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

function chime() {
  if (!soundOn.value || !audio) return;
  try {
    if (audio.state === "suspended") audio.resume();
    const now = audio.currentTime;
    [880, 660, 880].forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const s = now + i * 0.22;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.18, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(s);
      o.stop(s + 0.21);
    });
  } catch { /* audio is best-effort */ }
}

let titleTimer = null;
function flashTitle() {
  if (titleTimer || !document.hidden) return;
  const base = document.title;
  let on = false;
  titleTimer = setInterval(() => {
    on = !on;
    document.title = on ? "🔴 " + base : base;
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
