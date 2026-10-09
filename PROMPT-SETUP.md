Build a planner-worker-reviewer harness and use it to build Flappy Bird three times, once per arm.

Read ./explainer.html first and follow its pattern exactly: Claude plans and reviews, Node scripts hold every fact and run every check, the worker only writes code for one ticket at a time. Use Node built-ins only, no frameworks, no Python.

Deliverables, in this order. Steps 1 to 5 make no API calls. Ask me before the first paid call.

1. BRIEF.md: the Flappy Bird spec. Single HTML canvas 400x600. Bird falls under gravity; space or tap flaps. Pipe pairs scroll left with a fixed gap; +1 score per pipe passed. Collision with a pipe or the ground ends the game. Best score in localStorage. Start and game-over screens; restart on tap. Freeze it and record its SHA-256 in the file; the harness refuses to run if the hash changes.

2. tickets.jsonl: about 6 tickets, one file or function each, logic tickets first, each with its test written before the ticket runs:
   1 canvas loop with sky, ground, bird rectangle
   2 gravity and flap as a pure step(state, dt) function (tested)
   3 pipes: spawn, scroll, recycle, seeded random gap (tested)
   4 collision as a pure function (tested)
   5 score, best score in localStorage, drawn on canvas
   6 start and game-over screens, restart

3. Settings UI at http://127.0.0.1:3900: one row per arm with fields base URL, model, API key, concurrency, thinking on/off. Keys are saved to ~/.pwr/keys.env with mode 600 and are never printed, logged, or sent anywhere except that arm's base URL. Buttons: Probe (one real call per model, shows the served context window from a max_tokens ladder), Calibrate (about 50 calls, writes calibration.json stamped with the model name), Run (runs all tickets for that arm), and a results table: wall time, prompt and completion tokens, cost, tickets passed first try, retries, reviewer corrections, final test count.

4. worker.mjs: one ticket per call. Strict JSON schema {files:[{path,content}]}, temperature 0, stream on with include_usage, chat_template_kwargs enable_thinking false (or as set in the UI). Shared text first, ticket last. Handle outcomes exactly as the explainer's outcome table says: ok, length, empty_content, bad_json, runaway, first_token_timeout, stall, 502/503/504, 429 with a credit breaker after 6 in a row. Resume from the JSONL log. Arm B skips the API entirely: you write the code for each ticket yourself, through the same check script, and log your own token usage from the session.

5. check.mjs: writes the files from the worker's JSON (only to paths the ticket allows), runs the ticket's test with node --test and a syntax check, one retry with the error text appended, then the ticket goes to a claude-queue.jsonl for you to do.

6. After each arm's run, create a fresh isolated folder outside this project containing only BRIEF.md, the run's diff, and a byte-identical PROMPT-REVIEW.md written in the explainer's style (check judgement, do not redo the work, never write a number from memory, write REVIEW.md then stop). Tell me to start a new Claude Code session in that folder, and read its REVIEW.md back when I say it is done.

Arms:
  A = base URL https://api.indicstack.ai/v1, model qwen38-27b, thinking off
  B = Opus 5.5 alone, no worker call
  C = OpenRouter https://openrouter.ai/api/v1, the Qwen 3.8 27B listing (probe /models to find its id)

Every run goes in runs/<date>-<arm>/ with its call log, per-stage JSONL, outputs and run metadata. Never overwrite a run. Keep the API keys out of code, logs and git. Add a .gitignore that excludes runs/ keys and node_modules before the first commit.

Rule from the explainer that applies to all of this: the model never writes an identifier, path, or number from memory. Paths and settings come from the ticket and the UI, joined by the script.
