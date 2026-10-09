import { test } from "node:test";
import assert from "node:assert/strict";
import { load, C } from "./_load.mjs";
const P = await load("game/physics.mjs");

test("createBird matches the brief", () => {
  assert.deepEqual(P.createBird(), { x: C.BIRD_X, y: C.BIRD_START_Y, vy: 0, w: C.BIRD_W, h: C.BIRD_H });
});

test("step applies gravity then moves, without mutating", () => {
  const b = P.createBird();
  const dt = 0.016;
  const n = P.step(b, dt);
  const vy = 0 + C.GRAVITY * dt;
  assert.ok(Math.abs(n.vy - vy) < 1e-9);
  assert.ok(Math.abs(n.y - (C.BIRD_START_Y + vy * dt)) < 1e-9);
  assert.equal(n.x, C.BIRD_X, "x never changes");
  assert.deepEqual(b, P.createBird(), "argument not mutated");
  assert.notEqual(n, b);
});

test("flap sets vy to FLAP_VY and nothing else", () => {
  const b = { ...P.createBird(), vy: 50 };
  const f = P.flap(b);
  assert.equal(f.vy, C.FLAP_VY);
  assert.equal(f.y, b.y);
  assert.equal(b.vy, 50, "argument not mutated");
});

test("bird is clamped at the top with vy reset", () => {
  const b = { ...P.createBird(), y: 1, vy: C.FLAP_VY };
  const n = P.step(b, 0.05);
  assert.equal(n.y, 0);
  assert.equal(n.vy, 0);
});

test("a flap then falling returns past the start height", () => {
  let b = P.flap(P.createBird());
  for (let i = 0; i < 100; i++) b = P.step(b, 0.016);
  assert.ok(b.y > C.BIRD_START_Y, "after 1.6 s the bird is below where it started");
});
