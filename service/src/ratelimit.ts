// Small in-memory rate limits for the anonymous intake (referrals, learner messages, reports)
// and for the mentors' sign-in. One process serves the site, so a Map is enough; counters are
// lost on restart, which only ever errs on the side of letting a person through.
import type { FastifyReply, FastifyRequest } from "fastify";

/** The visitor's address. The service sits behind Cloudflare and nginx, which pass it on. */
export function clientIp(req: FastifyRequest): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const xff = req.headers["x-forwarded-for"];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  return first || req.ip;
}

export interface Limit {
  /** Counts one hit for each key; false (and nothing counted) when any key is already at the limit. */
  take(keys: string[]): { ok: boolean; retryAfter: number };
  /** Counts one hit without checking (e.g. a failed sign-in). */
  hit(key: string): void;
  /** True when the key is at the limit. */
  blocked(key: string): { blocked: boolean; retryAfter: number };
  reset(key: string): void;
}

const all: Map<string, number[]>[] = [];

export function limiter(max: number, windowMs: number): Limit {
  const hits = new Map<string, number[]>();
  all.push(hits);
  const recent = (key: string, now: number) => {
    const xs = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (xs.length) hits.set(key, xs);
    else hits.delete(key);
    return xs;
  };
  const wait = (xs: number[], now: number) => Math.max(1, Math.ceil((xs[0] + windowMs - now) / 1000));
  return {
    take(keys) {
      const now = Date.now();
      for (const k of keys) {
        const xs = recent(k, now);
        if (xs.length >= max) return { ok: false, retryAfter: wait(xs, now) };
      }
      for (const k of keys) hits.set(k, [...recent(k, now), now]);
      return { ok: true, retryAfter: 0 };
    },
    hit(key) {
      const now = Date.now();
      hits.set(key, [...recent(key, now), now]);
    },
    blocked(key) {
      const now = Date.now();
      const xs = recent(key, now);
      return xs.length >= max ? { blocked: true, retryAfter: wait(xs, now) } : { blocked: false, retryAfter: 0 };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

/** 429 with Retry-After; returns the reply so a handler can `return tooMany(...)`. */
export function tooMany(reply: FastifyReply, retryAfter: number) {
  return reply.code(429).header("Retry-After", String(retryAfter)).send({ error: "rate_limited", retry_after: retryAfter });
}

// Forget old keys now and then so the maps do not grow with every visitor.
setInterval(() => {
  const now = Date.now();
  for (const m of all) for (const [k, xs] of m) if (!xs.length || now - xs[xs.length - 1] > 2 * 3600 * 1000) m.delete(k);
}, 10 * 60 * 1000).unref();
