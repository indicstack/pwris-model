# Flappy Bird — frozen brief

Version 1, 9 October 2026. This file is hashed; the harness refuses to run if the text above the hash line changes. Rule changes go into a new brief version.

## Deliverable

One HTML page, `game/index.html`, with a single `<canvas id="game">` 400 wide by 600 high. The page loads `game/main.mjs` as an ES module. All game logic lives in ES modules under `game/`. No frameworks, no build step, no external assets, no network. The page is served over HTTP by the harness; it need not work from `file://`.

## Rules

- R1 The canvas is 400x600. Sky fills the canvas. The ground is a band GROUND_HEIGHT high at the bottom (its top edge is GROUND_Y). The bird is a rectangle BIRD_W wide and BIRD_H high at x = BIRD_X.
- R2 The bird falls under gravity. Each step: `vy = vy + GRAVITY * dt`, then `y = y + vy * dt`. Space, or a tap or click on the page, flaps: `vy = FLAP_VY`. The bird's x never changes. If y would go below 0 it is clamped to 0 and vy set to 0.
- R3 Pipe pairs scroll left at PIPE_SPEED px/s. A pair is PIPE_W wide; its gap is GAP_H high and the gap's top edge gapY is a seeded random integer in [GAP_MIN_Y, GAP_MAX_Y] inclusive. A new pair spawns at x = CANVAS_W every SPAWN_INTERVAL seconds of play; the first pair spawns on the first step of play. A pair whose right edge (x + PIPE_W) is below 0 is removed.
- R4 Score goes up by 1 when a pair's right edge (x + PIPE_W) is at or left of the bird's left edge (BIRD_X), once per pair.
- R5 The game ends when the bird's rectangle overlaps either rectangle of a pair (top pipe: y from 0 to gapY; bottom pipe: y from gapY + GAP_H to GROUND_Y), or when the bird's bottom edge reaches the ground (`y + BIRD_H >= GROUND_Y`). Overlap is strict: touching edges do not count.
- R6 The best score is read from `localStorage` under BEST_KEY at start and written whenever a game ends with a score above it. Score and best are drawn on the canvas during play and on the game-over screen.
- R7 Three modes: `start`, `playing`, `over`. The start screen draws the title "Flappy" and the text "tap to start". The game-over screen draws "game over", the score, the best, and "tap to restart". Any input in `start` begins play and flaps once. Any input in `playing` flaps. Any input in `over` returns to a fresh `start` state with the best kept.
- R8 Random values come only from a seeded generator so the same seed gives the same pipe sequence. The seed for play is `Date.now()`; tests supply fixed seeds.
- R9 dt is in seconds and is capped at MAX_DT per frame.
- R10 Pure functions take state in and return new state; they do not mutate their arguments and do not touch the DOM, timers, or `localStorage`. Only `main.mjs` touches the browser.

## Constants (also in `game/constants.mjs`, which the harness owns)

| Name | Value | Unit |
|---|---|---|
| CANVAS_W | 400 | px |
| CANVAS_H | 600 | px |
| GROUND_HEIGHT | 80 | px |
| GROUND_Y | 520 | px |
| BIRD_X | 80 | px |
| BIRD_W | 34 | px |
| BIRD_H | 24 | px |
| BIRD_START_Y | 250 | px |
| GRAVITY | 1200 | px/s^2 |
| FLAP_VY | -380 | px/s |
| PIPE_SPEED | 120 | px/s |
| PIPE_W | 60 | px |
| GAP_H | 150 | px |
| GAP_MIN_Y | 60 | px |
| GAP_MAX_Y | 310 | px |
| SPAWN_INTERVAL | 1.6 | s |
| MAX_DT | 0.05 | s |
| BEST_KEY | "flappy.best" | string |

## Interfaces (tests pin these)

`game/physics.mjs`
- `createBird()` -> `{ x: BIRD_X, y: BIRD_START_Y, vy: 0, w: BIRD_W, h: BIRD_H }`
- `flap(bird)` -> new bird with `vy = FLAP_VY`
- `step(bird, dt)` -> new bird after R2

`game/pipes.mjs`
- `createRng(seed)` -> function returning a number in [0, 1); deterministic per seed
- `createPipes()` -> `{ list: [], timer: SPAWN_INTERVAL }`
- `stepPipes(pipes, dt, rng)` -> new pipes state after R3. `timer` accumulates dt; while `timer >= SPAWN_INTERVAL`, subtract SPAWN_INTERVAL and push `{ x: CANVAS_W, gapY, passed: false }` with `gapY = GAP_MIN_Y + Math.floor(rng() * (GAP_MAX_Y - GAP_MIN_Y + 1))`. Scroll happens before spawning.

`game/collision.mjs`
- `rectsOverlap(a, b)` with rects `{ x, y, w, h }`; strict overlap
- `pipeRects(pipe)` -> `[topRect, bottomRect]`
- `collides(bird, pipes)` -> true if the bird overlaps any pipe rect in `pipes.list`
- `hitsGround(bird)` -> `bird.y + bird.h >= GROUND_Y`

`game/score.mjs`
- `updateScore(bird, pipes, score)` -> `{ score, pipes }` after R4 (new pipes object with `passed` set)
- `loadBest(storage)` -> integer, 0 if missing or not a number
- `saveBest(storage, best)` -> writes `String(best)` under BEST_KEY
  `storage` is any object with `getItem(key)` and `setItem(key, value)`.

`game/machine.mjs`
- `createState(seed, best)` -> `{ mode: 'start', bird, pipes, score: 0, best, seed, rng }`
- `handleInput(state)` -> new state after R7
- `tick(state, dt)` -> new state: in `playing`, step bird, step pipes, update score, then check R5 and set `mode: 'over'` with `best = max(best, score)`; in other modes return the state unchanged. dt is capped per R9.

`game/main.mjs`
- `render(ctx, state)` draws R1, score text, and the R7 screens using only `fillRect`, `fillText`, `fillStyle`, `font`, `textAlign`
- `start(canvas, win, storage)` builds the state, binds `keydown` (Space) and `pointerdown` on `win`, and runs the loop with `win.requestAnimationFrame`; saves best per R6

SHA-256: d71ddf5111d74b47505dbfc35d7762b942cffe3e32aa543c932825489cd468e0
