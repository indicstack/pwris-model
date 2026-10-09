import { test } from "node:test";
import assert from "node:assert/strict";
import { load, C } from "./_load.mjs";
const K = await load("game/collision.mjs");
const bird = (y, x = C.BIRD_X) => ({ x, y, vy: 0, w: C.BIRD_W, h: C.BIRD_H });

test("rectsOverlap is strict", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(K.rectsOverlap(a, { x: 10, y: 0, w: 10, h: 10 }), false, "touching on the right is not overlap");
  assert.equal(K.rectsOverlap(a, { x: 0, y: 10, w: 10, h: 10 }), false, "touching below is not overlap");
  assert.equal(K.rectsOverlap(a, { x: 9, y: 9, w: 10, h: 10 }), true);
  assert.equal(K.rectsOverlap(a, { x: -5, y: -5, w: 20, h: 20 }), true, "containment is overlap");
});

test("pipeRects gives the top and bottom rects of a pair", () => {
  const p = { x: 200, gapY: 100, passed: false };
  const [top, bottom] = K.pipeRects(p);
  assert.deepEqual(top, { x: 200, y: 0, w: C.PIPE_W, h: 100 });
  assert.deepEqual(bottom, { x: 200, y: 100 + C.GAP_H, w: C.PIPE_W, h: C.GROUND_Y - (100 + C.GAP_H) });
});

test("collides: bird in the gap is safe, bird in a pipe is not", () => {
  const p = { x: C.BIRD_X, gapY: 200, passed: false };
  const pipes = { list: [p], timer: 0 };
  assert.equal(K.collides(bird(200 + 10), pipes), false, "inside the gap");
  assert.equal(K.collides(bird(200 - C.BIRD_H + 1), pipes), true, "clipping the top pipe");
  assert.equal(K.collides(bird(200 + C.GAP_H - 1), pipes), true, "clipping the bottom pipe");
  assert.equal(K.collides(bird(200 + 10), { list: [], timer: 0 }), false, "no pipes");
  assert.equal(K.collides(bird(50, C.BIRD_X), { list: [{ x: C.BIRD_X + C.BIRD_W, gapY: 200, passed: false }], timer: 0 }), false, "pipe just touching the bird's right edge");
});

test("hitsGround at and below GROUND_Y", () => {
  assert.equal(K.hitsGround(bird(C.GROUND_Y - C.BIRD_H)), true, "bottom edge exactly on the ground");
  assert.equal(K.hitsGround(bird(C.GROUND_Y - C.BIRD_H - 1)), false);
  assert.equal(K.hitsGround(bird(C.GROUND_Y + 50)), true);
});
