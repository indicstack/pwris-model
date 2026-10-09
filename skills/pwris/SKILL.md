---
name: pwris
description: Build a feature or app with the planner-worker-reviewer pattern on IndicStack. Use when the user types /pwris followed by an idea. Claude plans (brief, tickets, tests) and reviews; IndicStack's qwen model writes every ticket; scripts check every answer. Ends with a one-row cost/time table in rupees and a link to try the result.
---

# /pwris — planner-worker-reviewer on IndicStack

Harness home: `${CLAUDE_PLUGIN_ROOT}` (call it HOME; it is this plugin's folder). Project: the current working directory (call it PROJECT). Everything per project lives in `PROJECT/.pwr/`. Run every harness command with `PWR_PROJECT=PROJECT`.

Ground rules (from ${CLAUDE_PLUGIN_ROOT}/explainer.html):
- You never write an identifier, path, or number from memory into results. Numbers come from the logs; the `table` command prints them.
- You do not write ticket code yourself unless a ticket lands in `claude-queue.jsonl` after the worker failed twice.
- Keep the API key out of chat, files in the repo, and logs. Never ask the user to paste it here.
- Never overwrite a run. Rule changes go into a new brief version (re-freeze).

## Step 0 — status
Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pwris.mjs status --project PROJECT`. If a brief and tickets already exist, tell the user where they are and continue from the first unfinished step below. If the user said "status", print the one-line summary and stop.

## Step 1 — questions (max 5)
If the user attached or named a PRD or spec (docx, pdf, md), read it first (for .docx: unzip `word/document.xml` and strip tags, or use the docx skill). Treat it as the source of the brief; skip every question it already answers; list the milestones it implies. If the file can't be read (e.g. a pasteboard path), ask the user to save it inside PROJECT first.
Ask only what the brief cannot be written without: who uses it, what "done" looks like, anything they don't want, the stack if not obvious from the repo. One message, numbered. Wait.

## Step 2 — brief
Write `PROJECT/.pwr/BRIEF.md` in plain words: deliverable, numbered rules (R1…), constants with values, interfaces each test will pin (function names, inputs, outputs). Settle every judgement call now. Show the brief, ask "ok to freeze?". On yes: `node ${CLAUDE_PLUGIN_ROOT}/scripts/freeze-brief.mjs` with `PWR_PROJECT=PROJECT`.

## Step 3 — tickets and tests
Split into milestones (one PR each), then tickets: one file or function each, logic before UI, 4–15 per milestone. Write `PROJECT/.pwr/tickets.jsonl`, one JSON per line:
`{"id":1,"title":"…","deps":[],"writes":["src/x.mjs"],"reads":["src/constants.mjs"],"test":"tests/t1.test.mjs","rules":["R1"],"task":"…exact instructions, quoting the brief…"}`
Write each test under `PROJECT/.pwr/tests/` BEFORE any ticket runs (`node:test`; import the code under test from `process.env.PWR_WORK`, which is PROJECT). Harness-owned files (constants, config) you write yourself and commit first. Show the ticket list.

## Step 4 — key and preflight
`node ${CLAUDE_PLUGIN_ROOT}/scripts/pwris.mjs preflight --project PROJECT`. If it says the key is missing, give the user this exact command to run in their own terminal and wait:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/key.mjs
```
Preflight probes once a day (about 10 tiny calls). There is no separate calibration: the first run uses defaults and every run recalibrates budgets and timeouts from its own calls.

## Step 5 — run
Say: "N tickets, IndicStack, about ₹X" (X from the last calibration run's cost if any, else say unknown). Wait for "go". Then `node ${CLAUDE_PLUGIN_ROOT}/scripts/pwris.mjs run --project PROJECT`. It writes code into PROJECT, checks every ticket, re-runs earlier tickets' tests after each one. Queued tickets: write them yourself and submit with `PWR_PROJECT=PROJECT node ${CLAUDE_PLUGIN_ROOT}/check.mjs --run <run> --ticket N --files <json>`.

## Step 6 — review and table
`node ${CLAUDE_PLUGIN_ROOT}/scripts/pwris.mjs review --project PROJECT` (a blind Opus session in an isolated folder, ~₹50), then `node ${CLAUDE_PLUGIN_ROOT}/scripts/pwris.mjs table --project PROJECT`. Paste the table as-is. Then give the user one way to try the result (a URL, a command, or a file to open). Turn any finding the review repeats into a new test before the next milestone.

## Step 7 — next milestone
Commit on a branch named after the milestone (ask before pushing). Say "next" to continue with the next milestone from Step 3.
