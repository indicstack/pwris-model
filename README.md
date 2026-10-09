# pwris-model — planner-worker-reviewer on IndicStack

Claude plans and reviews. IndicStack's Qwen model writes every ticket. Plain Node scripts check every answer. Pattern: `explainer.html` (Prasanth Ghanta, Oct 2026).

## Install (Mac, Windows, Linux)

Needs Node 18+ and Claude Code 2.1.289+.

Inside Claude Code:
```
/plugin marketplace add IndicStack/pwris-model
/plugin install pwris@indicstack
```
Then, once, in your own terminal (hidden prompt; never paste the key into chat):
```
node "<plugin folder>/scripts/key.mjs"
```
Claude tells you the plugin folder path the first time you run `/pwris`. Alternatively set the `INDICSTACK_API_KEY` environment variable.

## Use

Open any project folder in Claude Code and type `/pwris` followed by your idea, or attach a PRD. The skill asks a few questions, writes a frozen brief, tickets and tests, waits for your go, runs IndicStack on every ticket, runs a blind review, and prints a one-row table (tokens, ₹ cost, tests, findings, time).

Per-project files live in `<project>/.pwr/` (brief, tickets, tests, runs, state). Run logs are git-ignored.

## The bench (optional)

`npm run ui` opens http://127.0.0.1:3900 to compare arms (IndicStack, Opus alone, OpenRouter) on the same brief. Offline tests: `npm test` (stub server, every outcome of the worker loop).

## Layout

- `skills/pwris/SKILL.md` — the recipe Claude follows
- `scripts/pwris.mjs` — status, preflight, run, review, table
- `worker.mjs`, `check.mjs`, `probe.mjs`, `calibrate.mjs`, `lib/` — the harness
- `review/` — isolated blind review folder builder and its byte-identical prompt
- `BRIEF.md`, `tickets.jsonl`, `tests/` — the Flappy Bird bench task
