// Thin client for the follow-up platform API (/api/mentor/*), same origin, cookie session.
export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

let onUnauthorized = () => {};
/** Called whenever the session has expired (any 401 other than a failed login). */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api/mentor${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("network", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const code = data?.error ?? "generic";
    if (res.status === 401 && code === "login") onUnauthorized();
    throw new ApiError(code, res.status);
  }
  return data;
}

const enc = encodeURIComponent;
export const api = {
  login: (email, password) => request("POST", "/login", { email, password }),
  logout: () => request("POST", "/logout"),
  me: () => request("GET", "/me"),
  mentors: () => request("GET", "/mentors"),
  cases: () => request("GET", "/cases"),
  case: (id) => request("GET", `/cases/${enc(id)}`),
  reply: (id, text) => request("POST", `/cases/${enc(id)}/reply`, { text }),
  assign: (id, mentorId) => request("POST", `/cases/${enc(id)}/assign`, { mentor_id: mentorId }),
  setStatus: (id, status, reason) => request("POST", `/cases/${enc(id)}/status`, { status, reason }),
  addNote: (id, text) => request("POST", `/cases/${enc(id)}/notes`, { text }),
  canned: (lang) => request("GET", `/canned?lang=${enc(lang)}`),
  reports: () => request("GET", "/reports"),
  setReport: (id, status) => request("POST", `/reports/${enc(id)}`, { status }),
  stats: () => request("GET", "/stats"),
};
