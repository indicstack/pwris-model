import { test } from "node:test";
import assert from "node:assert/strict";
import { load, C, fakeStorage } from "./_load.mjs";
const S = await load("game/score.mjs");
const bird = { x: C.BIRD_X, y: 100, vy: 0, w: C.BIRD_W, h: C.BIRD_H };

test("updateScore counts a pair once when its right edge passes the bird's left edge", () => {
  const pipes = { list: [{ x: C.BIRD_X - C.PIPE_W, gapY: 100, passed: false }, { x: 300, gapY: 100, passed: false }], timer: 0 };
  const r1 = S.updateScore(bird, pipes, 0);
  assert.equal(r1.score, 1);
  assert.equal(r1.pipes.list[0].passed, true);
  assert.equal(r1.pipes.list[1].passed, false);
  assert.equal(pipes.list[0].passed, false, "argument not mutated");
  const r2 = S.updateScore(bird, r1.pipes, r1.score);
  assert.equal(r2.score, 1, "not counted twice");
});

test("updateScore does not count a pair still under the bird", () => {
  const pipes = { list: [{ x: C.BIRD_X - C.PIPE_W + 1, gapY: 100, passed: false }], timer: 0 };
  assert.equal(S.updateScore(bird, pipes, 4).score, 4);
});

test("loadBest returns 0 for missing or bad values, else the integer", () => {
  assert.equal(S.loadBest(fakeStorage()), 0);
  assert.equal(S.loadBest(fakeStorage({ [C.BEST_KEY]: "abc" })), 0);
  assert.equal(S.loadBest(fakeStorage({ [C.BEST_KEY]: "17" })), 17);
});

test("saveBest writes String(best) under BEST_KEY", () => {
  const st = fakeStorage();
  S.saveBest(st, 9);
  assert.equal(st.getItem(C.BEST_KEY), "9");
  assert.equal(S.loadBest(st), 9);
});
