// /pwris orchestrator: IndicStack-only planner-worker-reviewer for any project.
//   node scripts/pwris.mjs <cmd> --project <dir> [...]
//   cmds: status | preflight [--calls N] | run | review | table [--rate INR_PER_USD] | play
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { HOME } from "../lib/paths.mjs";

const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] ?? true] : []).filter((x) => x.length));
const cmd = process.argv[2];
const project = resolve(String(args.project || process.env.PWR_PROJECT || process.cwd()));
const pwr = resolve(project, ".pwr");
const env = { ...process.env, PWR_PROJECT: project };
const node = (script, extra = [], opts = {}) => spawnSync(process.execPath, [resolve(HOME, script), ...extra], { cwd: HOME, encoding: "utf8", env: { ...env, ...(opts.env || {}) }, stdio: opts.quiet ? "pipe" : "inherit", maxBuffer: 50e6 });
const say = (m) => console.log(m);
const die = (m) => { console.error(m); process.exit(2); };
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

async function keyFor() {
  const { keyFor } = await import("../lib/keys.mjs");
  return process.env.INDICSTACK_API_KEY || keyFor("A");
}
function listRuns() { const d = resolve(pwr, "runs"); return existsSync(d) ? readdirSync(d).filter((n) => existsSync(resolve(d, n, "meta.json"))).sort() : []; }
function lastRun() { const r = listRuns().filter((n) => /-A(-\d+)?$/.test(n)); return r.length ? resolve(pwr, "runs", r.at(-1)) : null; }

async function status() {
  const brief = existsSync(resolve(pwr, "BRIEF.md"));
  const frozen = brief && /^SHA-256: [0-9a-f]{64}/m.test(readFileSync(resolve(pwr, "BRIEF.md"), "utf8"));
  const tickets = existsSync(resolve(pwr, "tickets.jsonl")) ? readFileSync(resolve(pwr, "tickets.jsonl"), "utf8").trim().split("\n").filter(Boolean).length : 0;
  const key = Boolean(await keyFor());
  const probe = readJson(resolve(pwr, "state", "probe-A.json"));
  const cal = readJson(resolve(pwr, "state", "calibration-A.json"));
  const run = lastRun();
  const meta = run ? readJson(resolve(run, "meta.json")) : null;
  say(`project: ${project}`);
  say(`brief: ${brief ? (frozen ? "frozen" : "NOT frozen") : "missing"} | tickets: ${tickets} | key: ${key ? "saved" : "MISSING"} | probe: ${probe ? `window ${probe.context_window} (${probe.at.slice(0, 10)})` : "none"} | calibration: ${cal ? `${cal.n_ok}/${cal.n} ok, ${cal.speed_tps_p10?.toFixed(1)} tok/s p10 (${cal.at.slice(0, 10)})` : "none"}`);
  say(`last run: ${run ? `${run.split("/").pop()} ${meta.status} tests ${JSON.stringify(meta.testsFinal || null)} review ${meta.reviewVerdict || "none"}` : "none"}`);
}

async function preflight() {
  mkdirSync(resolve(pwr, "state"), { recursive: true });
  const gi = resolve(project, ".gitignore"); const want = [".pwr/runs/", ".pwr/state/"];
  const cur = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  const missing = want.filter((l) => !cur.split("\n").includes(l));
  if (missing.length) { writeFileSync(gi, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + missing.join("\n") + "\n"); say(`.gitignore: added ${missing.join(", ")}`); }
  const key = await keyFor();
  if (!key) die(`No IndicStack key. Run once in your terminal:\n  node ${resolve(HOME, "scripts/key.mjs")}\n(or set INDICSTACK_API_KEY). Never paste the key into chat.`);
  const r0 = node("lib/brief.mjs", [], { quiet: true });
  const check = spawnSync(process.execPath, ["-e", "import('./lib/brief.mjs').then(m=>{m.loadBrief();console.log('ok')})"], { cwd: HOME, encoding: "utf8", env });
  if (!/ok/.test(check.stdout)) die(`brief problem: ${check.stderr.split("\n").find((l) => /Error/.test(l)) || check.stderr}`);
  if (!existsSync(resolve(pwr, "tickets.jsonl"))) die("no .pwr/tickets.jsonl");
  const probe = readJson(resolve(pwr, "state", "probe-A.json"));
  const fresh = probe && Date.now() - new Date(probe.at) < 24 * 3600 * 1000;
  if (!fresh) { say("probe: running (one call + max_tokens ladder)"); const r = node("probe.mjs", ["--arm", "A"], { env: { PWR_API_KEY: key } }); if (r.status !== 0) die("probe failed"); } else say(`probe: fresh (${probe.at.slice(0, 16)}, window ${probe.context_window})`);
  const cal = readJson(resolve(pwr, "state", "calibration-A.json"));
  const model = (await import("../lib/settings.mjs")).armConfig("A").model;
  if (!cal || cal.model !== model) { const n = Number(args.calls || 48); say(`calibration: running ${n} calls for ${model}`); const r = node("calibrate.mjs", ["--arm", "A", "--calls", String(n)], { env: { PWR_API_KEY: key } }); if (r.status !== 0) die("calibration failed"); } else say(`calibration: present for ${model} (${cal.at.slice(0, 16)})`);
  say("preflight ok");
}

async function run() {
  const key = await keyFor(); if (!key) die("no key");
  const r = node("worker.mjs", ["--arm", "A", ...(args.resume ? ["--run", String(args.resume)] : [])], { env: { PWR_API_KEY: key } });
  if (r.status === 75) die("credit breaker tripped: 6 consecutive 429s. Top up, then rerun with --resume <run dir>.");
  if (r.status !== 0) die(`worker exited ${r.status}`);
  const meta = readJson(resolve(lastRun(), "meta.json"));
  say(`run ${meta.id}: ${meta.status}, final tests ${JSON.stringify(meta.testsFinal)}`);
  if (meta.status === "needs_claude") say(`tickets queued for the planner: see ${resolve(lastRun(), "claude-queue.jsonl")}. Submit each with: node ${resolve(HOME, "check.mjs")} --run <run> --ticket N --files <json> (PWR_PROJECT set).`);
}

async function review() {
  const run = args.run ? resolve(String(args.run)) : lastRun(); if (!run) die("no run");
  const mk = node("review/make-review.mjs", ["--run", run], { quiet: true });
  if (mk.status !== 0) die(mk.stderr || mk.stdout);
  const meta = readJson(resolve(run, "meta.json"));
  say(`review folder: ${meta.reviewFolder}`);
  const claude = (spawnSync("zsh", ["-lc", "whence -p claude"], { encoding: "utf8" }).stdout || "").trim() || "claude";
  const t0 = Date.now();
  const r = spawnSync(claude, ["-p", "Read PROMPT-REVIEW.md in this folder and do exactly what it says. Write REVIEW.md here, then stop.", "--model", String(args.model || "opus"), "--output-format", "json", "--no-session-persistence", "--allowedTools", "Read", "Write", "Glob", "Grep"], { cwd: meta.reviewFolder, encoding: "utf8", maxBuffer: 50e6, env: { ...process.env, PWR_API_KEY: "" } });
  let j = null; try { j = JSON.parse(r.stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop()); } catch {}
  const u = j?.usage || {};
  const text = existsSync(resolve(meta.reviewFolder, "REVIEW.md")) ? readFileSync(resolve(meta.reviewFolder, "REVIEW.md"), "utf8") : "";
  const verdict = (text.match(/^.*\b(PASS WITH FINDINGS|PASS|FAIL)\b.*$/m) || [""])[0].replace(/^[#*\s-]+/, "").trim();
  const count = Number((verdict.match(/(\d+)/) || [])[1]);
  const { updateMeta } = await import("../lib/runs.mjs");
  updateMeta(run, { reviewVerdict: verdict, reviewerCorrections: Number.isFinite(count) ? count : null, reviewUsage: { input: u.input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0, cache_read: u.cache_read_input_tokens || 0, output: u.output_tokens || 0, cost_usd: j?.total_cost_usd ?? null, seconds: (Date.now() - t0) / 1000, model: Object.keys(j?.modelUsage || {})[0] || null } });
  say(`verdict: ${verdict || "(no REVIEW.md written)"}`);
}

async function table() {
  const run = args.run ? resolve(String(args.run)) : lastRun(); if (!run) die("no run");
  const { summarize, readMeta } = await import("../lib/runs.mjs");
  const s = summarize(run), m = readMeta(run);
  let rate = Number(args.rate);
  if (!Number.isFinite(rate)) { try { const j = await (await fetch("https://api.frankfurter.app/latest?from=USD&to=INR")).json(); rate = j.rates.INR; say(`rate: ₹${rate}/USD (frankfurter, ${j.date})`); } catch { die("could not fetch USD→INR; pass --rate"); } }
  const ru = m.reviewUsage || {};
  const workerInr = s.cost ?? 0; // IndicStack reports cost in INR
  const reviewInr = (ru.cost_usd || 0) * rate;
  const wall = s.wall_s || 0, rs = ru.seconds || 0;
  const fmt = (n) => Number(n).toLocaleString("en-IN");
  const mmss = (sec) => `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`;
  const row = `| ${m.id} (IndicStack ${m.model}) | ${fmt(s.prompt_tokens)} | ${fmt(s.completion_tokens)} | ₹${workerInr.toFixed(2)} | ${fmt((ru.input || 0) + (ru.cache_write || 0) + (ru.cache_read || 0))} | ${fmt(ru.output || 0)} | ₹${reviewInr.toFixed(2)} | ${s.tickets_passed_first_try}/${s.tickets_total} | ${s.tests_final ? `${s.tests_final.pass}/${s.tests_final.pass + s.tests_final.fail}` : "?"} | ${m.reviewerCorrections ?? "?"} | **₹${(workerInr + reviewInr).toFixed(2)}** | ${mmss(wall + rs)} |`;
  const header = `| Run | Worker tokens in | Worker tokens out | Worker cost | Opus review tokens in | Opus review tokens out | Opus review cost | First try | Final tests | Findings | Total cost | Total time |\n|---|---|---|---|---|---|---|---|---|---|---|---|`;
  let note = "";
  try {
    const j = await (await fetch("https://openrouter.ai/api/v1/models")).json();
    const id = String(args["opus-id"] || "anthropic/claude-opus-5.5");
    const o = j.data.find((x) => x.id === id);
    if (o) {
      const pm = (v) => Math.round(Number(v) * 1e8) / 100;
      const px = { in: pm(o.pricing.prompt), out: pm(o.pricing.completion), cr: pm(o.pricing.input_cache_read ?? 0), cw: pm(o.pricing.input_cache_write ?? 0) };
      const usd = ((ru.input || 0) * px.in + (ru.cache_read || 0) * px.cr + (ru.cache_write || 0) * px.cw + (ru.output || 0) * px.out) / 1e6;
      note = `Opus list price (${id}, OpenRouter, ${new Date().toISOString().slice(0, 10)}): $${px.in}/M in, $${px.out}/M out, $${px.cr}/M cache read, $${px.cw}/M cache write. Review at these prices: ₹${(usd * rate).toFixed(2)}; Claude reported ₹${reviewInr.toFixed(2)}.`;
    }
  } catch { note = "(Opus list price lookup failed; review cost is Claude's reported figure)"; }
  say(header + "\n" + row + (note ? "\n\n" + note : ""));
  writeFileSync(resolve(run, "TABLE.md"), header + "\n" + row + "\n" + (note ? "\n" + note + "\n" : ""));
}

const cmds = { status, preflight, run, review, table };
if (!cmds[cmd]) die("usage: node scripts/pwris.mjs status|preflight|run|review|table --project <dir>");
cmds[cmd]().catch((e) => die(String(e.stack || e)));
