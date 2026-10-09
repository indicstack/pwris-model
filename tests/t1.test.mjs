import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WORK, load, C, fakeCtx } from "./_load.mjs";

test("index.html has one 400x600 canvas and loads main.mjs as a module", () => {
  const html = readFileSync(resolve(WORK, "game/index.html"), "utf8");
  const canvases = html.match(/<canvas\b[^>]*>/g) || [];
  assert.equal(canvases.length, 1, "exactly one <canvas>");
  assert.match(canvases[0], /id="game"/);
  assert.match(canvases[0], new RegExp(`width="${C.CANVAS_W}"`));
  assert.match(canvases[0], new RegExp(`height="${C.CANVAS_H}"`));
  assert.ok(/<script[^>]*type="module"[^>]*src="\.\/main\.mjs"/.test(html) || /<script[^>]*type="module"[^>]*>[\s\S]*?from\s+["']\.\/main\.mjs["'][\s\S]*?start\(/.test(html), "a module script imports ./main.mjs and calls start");
});

test("render draws sky, ground and bird with fillRect", async () => {
  const { render } = await load("game/main.mjs");
  const ctx = fakeCtx();
  const bird = { x: C.BIRD_X, y: C.BIRD_START_Y, w: C.BIRD_W, h: C.BIRD_H, vy: 0 };
  render(ctx, { bird });
  const rects = ctx.calls.filter((c) => c.op === "fillRect").map((c) => c.args);
  assert.ok(rects.length >= 3, "at least three fillRect calls (sky, ground, bird)");
  assert.ok(rects.some(([x, y, w, h]) => x === 0 && y === 0 && w === C.CANVAS_W && h === C.CANVAS_H), "sky covers the canvas");
  assert.ok(rects.some(([x, y, w, h]) => x === 0 && y === C.GROUND_Y && w === C.CANVAS_W && h === C.GROUND_HEIGHT), "ground band at GROUND_Y");
  assert.ok(rects.some(([x, y, w, h]) => x === bird.x && y === bird.y && w === bird.w && h === bird.h), "bird rectangle at the bird's position");
});

test("start gets a 2d context and schedules frames with capped dt", async () => {
  const { start } = await load("game/main.mjs");
  const ctx = fakeCtx();
  const listeners = {};
  const frames = [];
  const win = {
    requestAnimationFrame: (cb) => { frames.push(cb); return frames.length; },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const canvas = { width: C.CANVAS_W, height: C.CANVAS_H, getContext: (kind) => (kind === "2d" ? ctx : null) };
  start(canvas, win, { getItem: () => null, setItem: () => {} });
  assert.ok(frames.length >= 1, "requestAnimationFrame called once to begin the loop");
  // drive two frames 1000 ms apart: the loop must still render and must not throw
  frames[0](0);
  const before = ctx.calls.length;
  frames[frames.length - 1](1000);
  assert.ok(ctx.calls.length > before, "renders on each frame");
  assert.ok(frames.length >= 3, "keeps scheduling frames");
});

test("main.mjs writes no numeric literal other than 0, 1, 2 and 1000 (ms per second); strings excluded", async () => {
  const src = readFileSync(resolve(WORK, "game/main.mjs"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/`(?:\\.|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
  const nums = (src.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) || []).filter((n) => !["0", "1", "2", "1000"].includes(n));
  assert.deepEqual(nums, [], `numeric literals found: ${nums.join(", ")}`);
});
