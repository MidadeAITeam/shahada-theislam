// Client for the after-Shahada service (docs/api.md). The learner is identified by an httpOnly
// cookie the service sets on the first call, so every request carries credentials.

const BASE = `${import.meta.env?.VITE_SHAHADA_API_ORIGIN || ''}/api/shahada`;

export class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString();
  return s ? `?${s}` : '';
};

export const api = {
  start: (lang, conversation) => request('POST', '/start', { lang, conversation }),
  profile: (body) => request('POST', '/profile', body),
  lessons: (lang) => request('GET', `/lessons${q({ lang })}`),
  // `background` (the stated former belief) is sent per request and never stored by the service.
  lesson: (id, lang, background) => request('GET', `/lessons/${encodeURIComponent(id)}${q({ lang, background })}`),
  complete: (id, lang, checkAnswer) =>
    request('POST', `/lessons/${encodeURIComponent(id)}/complete`, { lang, check_answer: checkAnswer ?? null }),
  progress: () => request('GET', '/progress'),
  ask: (question, lang, lessonId) => request('POST', '/ask', { question, lang, lesson_id: lessonId ?? null }),
  handoff: (body) => request('POST', '/handoff', body),
  handoffMessages: (since) => request('GET', `/handoff/messages${q({ since })}`),
  handoffSend: (id, text) => request('POST', `/handoff/${encodeURIComponent(id)}/messages`, { text }),
  authGoogle: (credential) => request('POST', '/auth/google', { credential }),
  authEmail: (email, lang) => request('POST', '/auth/email', { email, lang }),
  reminder: (hour, tz, enabled) => request('POST', '/reminder', { hour, tz, enabled }),
  forget: () => request('POST', '/forget', {}),
  report: (target, note, lang) => request('POST', '/report', { target, note, lang }),
};
