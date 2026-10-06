import { test } from "node:test";
import assert from "node:assert/strict";
import { limiter } from "../src/ratelimit.ts";

test("lets a key through up to the limit, then refuses with a wait", () => {
  const l = limiter(3, 60_000);
  for (let i = 0; i < 3; i++) assert.ok(l.take(["a"]).ok);
  const r = l.take(["a"]);
  assert.equal(r.ok, false);
  assert.ok(r.retryAfter > 0 && r.retryAfter <= 60);
  assert.ok(l.take(["b"]).ok); // other keys are independent
});

test("a refused request counts against no key", () => {
  const l = limiter(1, 60_000);
  assert.ok(l.take(["ip"]).ok);
  assert.equal(l.take(["learner", "ip"]).ok, false);
  assert.ok(l.take(["learner"]).ok); // the refused call above did not use the learner's allowance
});

test("failures block until reset", () => {
  const l = limiter(2, 60_000);
  l.hit("x"); l.hit("x");
  assert.ok(l.blocked("x").blocked);
  l.reset("x");
  assert.equal(l.blocked("x").blocked, false);
});
