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
  // Same as ask, but reports live stages (understanding → found on pages → checking) through onStage.
  askStream: async (question, lang, lessonId, history, onStage) => {
    const res = await fetch(`${BASE}/ask/stream`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ question, lang, lesson_id: lessonId ?? null, history: history || undefined }),
    });
    if (!res.ok || !res.body) throw new ApiError(res.status, null);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data:'));
        buf = buf.slice(i + 2);
        if (!line) continue;
        const evt = JSON.parse(line.slice(5));
        if (evt.type === 'stage') onStage?.(evt);
        else if (evt.type === 'answer') return evt.data;
        else if (evt.type === 'error') throw new ApiError(500, null);
      }
    }
    throw new ApiError(500, null);
  },
  handoff: (body) => request('POST', '/handoff', body),
  // Every case of this learner with its messages (both sides) whose id is above `after` (0 = all).
  handoffMessages: (after) => request('GET', `/handoff/messages${q({ after: after || 0 })}`),
  handoffSend: (id, text) => request('POST', `/handoff/${encodeURIComponent(id)}/messages`, { text }),
  authGoogle: (credential) => request('POST', '/auth/google', { credential }),
  authEmail: (email, lang) => request('POST', '/auth/email', { email, lang }),
  reminder: (hour, tz, enabled) => request('POST', '/reminder', { hour, tz, enabled }),
  forget: () => request('POST', '/forget', {}),
  report: (target, note, lang) => request('POST', '/report', { target, note, lang }),
};
