// Settings UI at http://127.0.0.1:3900. Keys go to ~/.pwr/keys.env (mode 600) and are passed to child
// processes only through the PWR_API_KEY env var. They are never written to settings, logs, or responses.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, createReadStream, statSync, appendFileSync, openSync } from "node:fs";
import { resolve, extname, normalize } from "node:path";
import { spawn } from "node:child_process";
import { ROOT, loadBrief } from "../lib/brief.mjs";
import { readSettings, writeSettings, readProbe, calibrationPath, STATE_DIR } from "../lib/settings.mjs";
import { writeKey, keyStatus, keyFor } from "../lib/keys.mjs";
import { listRuns, summarize, updateMeta, RUNS_DIR } from "../lib/runs.mjs";
import { loadTickets } from "../lib/prompt.mjs";
import { readJsonl } from "../lib/jsonl.mjs";

const PORT = 3900, HOST = "127.0.0.1";
const jobs = new Map();
const JOBS_DIR = resolve(STATE_DIR, "jobs");
mkdirSync(JOBS_DIR, { recursive: true });

function startJob(kind, arm, extraArgs = []) {
  const id = `${kind}-${arm}-${Date.now()}`;
  const logPath = resolve(JOBS_DIR, `${id}.log`);
  const fd = openSync(logPath, "a");
  const script = { probe: "probe.mjs", calibrate: "calibrate.mjs", run: "worker.mjs" }[kind];
  const env = { ...process.env, PWR_API_KEY: keyFor(arm) };
  const child = spawn(process.execPath, [resolve(ROOT, script), "--arm", arm, ...extraArgs], { cwd: ROOT, env, stdio: ["ignore", fd, fd] });
  const job = { id, kind, arm, started: new Date().toISOString(), status: "running", exit: null, logPath };
  jobs.set(id, job);
  child.on("exit", (code) => { job.status = code === 0 ? "done" : `exit ${code}`; job.exit = code; job.finished = new Date().toISOString(); });
  return job;
}

const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const MIME = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

async function body(req) { let b = ""; for await (const c of req) b += c; return b ? JSON.parse(b) : {}; }

function state() {
  const settings = readSettings();
  const brief = (() => { try { return { ok: true, hash: loadBrief().hash }; } catch (e) { return { ok: false, error: e.message }; } })();
  const arms = {};
  for (const arm of ["A", "B", "C"]) {
    const cal = existsSync(calibrationPath(arm)) ? JSON.parse(readFileSync(calibrationPath(arm), "utf8")) : null;
    arms[arm] = { ...settings[arm], probe: readProbe(arm), calibration: cal && { model: cal.model, at: cal.at, n: cal.n, n_ok: cal.n_ok, speed_tps_p10: cal.speed_tps_p10, chars_per_token_p10: cal.chars_per_token_p10, ttft_p95: cal.ttft_p95, gap_p99: cal.gap_p99, answer_tokens_p95: cal.answer_tokens_p95, answer_tokens_p95_by_ticket: cal.answer_tokens_p95_by_ticket, outcomes: cal.outcomes, schema_ok_rate: cal.schema_ok_rate } };
  }
  return { brief, keys: keyStatus(), arms, tickets: loadTickets().map((t) => ({ id: t.id, title: t.title, deps: t.deps })), jobs: [...jobs.values()].sort((a, b) => b.started.localeCompare(a.started)).slice(0, 20), runs: listRuns().map((r) => ({ ...summarize(r.dir), kind: r.meta.kind || "run", queue: existsSync(resolve(r.dir, "claude-queue.jsonl")) ? readJsonl(resolve(r.dir, "claude-queue.jsonl")).length : 0 })) };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(readFileSync(resolve(ROOT, "ui/index.html"))); }
    if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, state());
    if (req.method === "POST" && url.pathname === "/api/settings") {
      const b = await body(req);
      for (const arm of ["A", "B", "C"]) if (b[arm] && typeof b[arm].apiKey === "string") { writeKey(arm, b[arm].apiKey); delete b[arm].apiKey; }
      writeSettings(b);
      return json(res, 200, { ok: true, keys: keyStatus() });
    }
    const m = url.pathname.match(/^\/api\/(probe|calibrate|run)\/([ABC])$/);
    if (req.method === "POST" && m) {
      const [, kind, arm] = m;
      const b = await body(req);
      const s = readSettings()[arm];
      if (s.mode === "claude" && kind !== "run") return json(res, 400, { error: `arm ${arm} has no API: ${kind} is not applicable` });
      if (s.mode !== "claude" && !keyFor(arm)) return json(res, 400, { error: `no API key saved for arm ${arm}` });
      const extra = [];
      if (kind === "probe" && b.findModel) extra.push("--find-model", String(b.findModel));
      if (kind === "probe" && b.parallel) extra.push("--parallel", String(b.parallel));
      if (kind === "run" && b.resume) extra.push("--run", String(b.resume));
      return json(res, 200, startJob(kind, arm, extra));
    }
    const j = url.pathname.match(/^\/api\/jobs\/([^/]+)\/log$/);
    if (req.method === "GET" && j) { const job = jobs.get(decodeURIComponent(j[1])); if (!job) return json(res, 404, { error: "no job" }); res.writeHead(200, { "content-type": "text/plain" }); return res.end(readFileSync(job.logPath, "utf8").slice(-20000)); }
    const c = url.pathname.match(/^\/api\/runs\/([^/]+)\/corrections$/);
    if (req.method === "POST" && c) { const b = await body(req); updateMeta(resolve(RUNS_DIR, decodeURIComponent(c[1])), { reviewerCorrections: Number(b.corrections), reviewNote: String(b.note || "") }); return json(res, 200, { ok: true }); }
    const q = url.pathname.match(/^\/api\/runs\/([^/]+)\/queue$/);
    if (req.method === "GET" && q) return json(res, 200, readJsonl(resolve(RUNS_DIR, decodeURIComponent(q[1]), "claude-queue.jsonl")));
    const play = url.pathname.match(/^\/play\/([^/]+)\/(.*)$/);
    if (req.method === "GET" && play) {
      const rel = normalize(play[2] || "index.html");
      const file = resolve(RUNS_DIR, decodeURIComponent(play[1]), "work", "game", rel);
      if (!file.startsWith(resolve(RUNS_DIR)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); return createReadStream(file).pipe(res);
    }
    res.writeHead(404); res.end("not found");
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
});
server.listen(PORT, HOST, () => console.log(`pwr-bench settings UI at http://${HOST}:${PORT}`));
