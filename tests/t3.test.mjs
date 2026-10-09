import { test } from "node:test";
import assert from "node:assert/strict";
import { load, C } from "./_load.mjs";
const Pp = await load("game/pipes.mjs");

test("createRng is deterministic and in [0,1)", () => {
  const a = Pp.createRng(42), b = Pp.createRng(42), c = Pp.createRng(43);
  const sa = Array.from({ length: 20 }, () => a());
  const sb = Array.from({ length: 20 }, () => b());
  const sc = Array.from({ length: 20 }, () => c());
  assert.deepEqual(sa, sb, "same seed, same sequence");
  assert.notDeepEqual(sa, sc, "different seed, different sequence");
  for (const v of sa) assert.ok(v >= 0 && v < 1, `value ${v} in [0,1)`);
  assert.ok(new Set(sa).size > 10, "values vary");
});

test("createPipes starts empty with the timer primed", () => {
  assert.deepEqual(Pp.createPipes(), { list: [], timer: C.SPAWN_INTERVAL });
});

test("first step spawns one pair at the right edge with gapY in range", () => {
  const rng = Pp.createRng(7);
  const s = Pp.stepPipes(Pp.createPipes(), 0.016, rng);
  assert.equal(s.list.length, 1);
  const p = s.list[0];
  assert.equal(p.x, C.CANVAS_W);
  assert.equal(p.passed, false);
  assert.ok(Number.isInteger(p.gapY) && p.gapY >= C.GAP_MIN_Y && p.gapY <= C.GAP_MAX_Y, `gapY ${p.gapY} in range`);
});

test("pipes scroll left at PIPE_SPEED and spawn every SPAWN_INTERVAL", () => {
  const rng = Pp.createRng(1);
  let s = Pp.stepPipes(Pp.createPipes(), 0.016, rng);
  const x0 = s.list[0].x;
  s = Pp.stepPipes(s, 0.5, rng);
  assert.ok(Math.abs(s.list[0].x - (x0 - C.PIPE_SPEED * 0.5)) < 1e-9, "scrolled by speed*dt");
  // total elapsed 0.516 s; step to just past 1.6 s of play => second pair
  s = Pp.stepPipes(s, C.SPAWN_INTERVAL - 0.516 + 0.001, rng);
  assert.equal(s.list.length, 2, "second pair spawned after SPAWN_INTERVAL");
  assert.equal(s.list[1].x, C.CANVAS_W, "new pair at the right edge");
});

test("a pair whose right edge is below 0 is removed; others kept", () => {
  const rng = Pp.createRng(3);
  const s = { list: [{ x: -C.PIPE_W - 1, gapY: 100, passed: true }, { x: 10, gapY: 100, passed: false }], timer: 0 };
  const n = Pp.stepPipes(s, 0.01, rng);
  assert.equal(n.list.length, 1);
  assert.ok(n.list[0].x < 10 && n.list[0].x > 0);
});

test("stepPipes does not mutate its argument", () => {
  const rng = Pp.createRng(9);
  const s = Pp.createPipes();
  const copy = JSON.parse(JSON.stringify(s));
  const n = Pp.stepPipes(s, 0.1, rng);
  assert.deepEqual(s, copy);
  assert.notEqual(n.list, s.list);
});

test("same seed gives the same pipe sequence", () => {
  const run = (seed) => {
    let s = Pp.createPipes(); const rng = Pp.createRng(seed);
    for (let i = 0; i < 400; i++) s = Pp.stepPipes(s, 0.016, rng);
    return s.list.map((p) => p.gapY);
  };
  assert.deepEqual(run(123), run(123));
  assert.ok(run(123).length >= 3);
});
