import { test } from "node:test";
import assert from "node:assert/strict";
import { load, C, fakeCtx, fakeStorage } from "./_load.mjs";
const M = await load("game/machine.mjs");
const Main = await load("game/main.mjs");

test("createState starts in start mode with the given best", () => {
  const s = M.createState(5, 3);
  assert.equal(s.mode, "start");
  assert.equal(s.score, 0);
  assert.equal(s.best, 3);
  assert.deepEqual(s.pipes, { list: [], timer: C.SPAWN_INTERVAL });
  assert.equal(s.bird.y, C.BIRD_START_Y);
  assert.equal(typeof s.rng, "function");
});

test("input: start -> playing with a flap; playing flaps; over -> fresh start keeping best", () => {
  const s0 = M.createState(5, 3);
  const s1 = M.handleInput(s0);
  assert.equal(s1.mode, "playing");
  assert.equal(s1.bird.vy, C.FLAP_VY);
  const s2 = M.handleInput({ ...s1, bird: { ...s1.bird, vy: 100 } });
  assert.equal(s2.mode, "playing");
  assert.equal(s2.bird.vy, C.FLAP_VY);
  const s3 = M.handleInput({ ...s2, mode: "over", score: 7, best: 9 });
  assert.equal(s3.mode, "start");
  assert.equal(s3.score, 0);
  assert.equal(s3.best, 9);
  assert.equal(s3.bird.y, C.BIRD_START_Y);
  assert.equal(s0.mode, "start", "argument not mutated");
});

test("tick does nothing outside playing, and caps dt", () => {
  const s = M.createState(1, 0);
  assert.equal(M.tick(s, 0.5), s);
  const p = M.handleInput(s);
  const t = M.tick(p, 10);
  const expectVy = C.FLAP_VY + C.GRAVITY * C.MAX_DT;
  assert.ok(Math.abs(t.bird.vy - expectVy) < 1e-9, "dt capped at MAX_DT");
});

test("tick in playing spawns pipes, scores, and ends the game on the ground", () => {
  let s = M.handleInput(M.createState(11, 0));
  s = M.tick(s, 0.016);
  assert.equal(s.pipes.list.length, 1, "first pair spawned on the first step");
  // force a passed pair: put a pipe just left of the bird with the gap around the bird
  const passing = { ...s, pipes: { list: [{ x: C.BIRD_X - C.PIPE_W, gapY: C.BIRD_START_Y - 50, passed: false }], timer: 0 }, bird: { ...s.bird, y: C.BIRD_START_Y, vy: 0 } };
  const scored = M.tick(passing, 0.001);
  assert.equal(scored.score, 1);
  // fall until the ground ends the game
  let f = { ...scored, pipes: { list: [], timer: -1000 } };
  let guard = 0;
  while (f.mode === "playing" && guard++ < 2000) f = M.tick(f, 0.016);
  assert.equal(f.mode, "over");
  assert.equal(f.best, 1, "best raised to the score");
  assert.ok(f.bird.y + f.bird.h >= C.GROUND_Y);
});

test("tick ends the game on a pipe hit", () => {
  let s = M.handleInput(M.createState(2, 0));
  s = { ...s, bird: { ...s.bird, y: 100, vy: 0 }, pipes: { list: [{ x: C.BIRD_X, gapY: 300, passed: false }], timer: -1000 } };
  const t = M.tick(s, 0.001);
  assert.equal(t.mode, "over");
});

test("render draws the start and game-over screens and score text", () => {
  const texts = (state) => { const ctx = fakeCtx(); Main.render(ctx, state); return ctx.calls.filter((c) => c.op === "fillText").map((c) => String(c.args[0])).join(" | "); };
  const s = M.createState(1, 4);
  assert.match(texts(s), /Flappy/);
  assert.match(texts(s), /tap to start/);
  const playing = { ...M.handleInput(s), score: 2 };
  assert.match(texts(playing), /2/);
  const over = { ...playing, mode: "over", score: 6, best: 6 };
  const t = texts(over);
  assert.match(t, /game over/);
  assert.match(t, /tap to restart/);
  assert.match(t, /6/);
});

test("start wires input and saves best when a game ends", async () => {
  const ctx = fakeCtx();
  const listeners = {};
  const frames = [];
  const win = { requestAnimationFrame: (cb) => { frames.push(cb); return frames.length; }, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const canvas = { width: C.CANVAS_W, height: C.CANVAS_H, getContext: () => ctx };
  const storage = fakeStorage({ [C.BEST_KEY]: "2" });
  Main.start(canvas, win, storage);
  assert.ok(listeners.keydown && listeners.pointerdown, "keydown and pointerdown bound on win");
  listeners.keydown({ code: "Space", preventDefault() {} });
  let t = 0;
  for (let i = 0; i < 600 && frames.length; i++) { const cb = frames.pop(); frames.length = 0; t += 16; cb(t); }
  // with no further flaps the bird hits the ground; best stays 2 since score is 0
  assert.equal(storage.getItem(C.BEST_KEY), "2");
  assert.ok(ctx.calls.some((c) => c.op === "fillText" && /game over/.test(String(c.args[0]))), "game-over screen rendered");
});
