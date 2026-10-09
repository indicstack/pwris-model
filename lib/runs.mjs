import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./brief.mjs";
import { readJsonl } from "./jsonl.mjs";

export const RUNS_DIR = resolve(ROOT, "runs");

// Never overwrite a run: runs/<date>-<arm>, then -2, -3, ...
export function newRunDir(arm, kind = "run") {
  mkdirSync(RUNS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const base = kind === "run" ? `${date}-${arm}` : `${date}-${arm}-${kind}`;
  let name = base, n = 1;
  while (existsSync(resolve(RUNS_DIR, name))) name = `${base}-${++n}`;
  const dir = resolve(RUNS_DIR, name);
  mkdirSync(resolve(dir, "work", "game"), { recursive: true });
  mkdirSync(resolve(dir, "outputs"), { recursive: true });
  return { id: name, dir };
}

export const runPaths = (dir) => ({
  dir,
  work: resolve(dir, "work"),
  outputs: resolve(dir, "outputs"),
  meta: resolve(dir, "meta.json"),
  calls: resolve(dir, "calls.jsonl"),
  tickets: resolve(dir, "tickets.jsonl"),
  queue: resolve(dir, "claude-queue.jsonl"),
  log: resolve(dir, "run.log"),
});

export function readMeta(dir) {
  const p = resolve(dir, "meta.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
export function writeMeta(dir, meta) {
  writeFileSync(resolve(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
}
export function updateMeta(dir, patch) {
  const m = { ...(readMeta(dir) || {}), ...patch };
  writeMeta(dir, m);
  return m;
}

export function listRuns() {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR).filter((n) => existsSync(resolve(RUNS_DIR, n, "meta.json"))).sort().map((id) => ({ id, dir: resolve(RUNS_DIR, id), meta: readMeta(resolve(RUNS_DIR, id)) }));
}

// Results-table row from the run's logs. Every number is summed from calls.jsonl / tickets.jsonl.
export function summarize(dir) {
  const p = runPaths(dir);
  const meta = readMeta(dir) || {};
  const calls = readJsonl(p.calls);
  const latest = new Map();
  for (const t of readJsonl(p.tickets)) latest.set(t.ticket, t);
  const tickets = [...latest.values()];
  const sum = (k) => calls.reduce((a, c) => a + (Number(c[k]) || 0), 0);
  const promptTokens = sum("prompt_tokens"), completionTokens = sum("completion_tokens"), reasoningTokens = sum("reasoning_tokens");
  const priceIn = meta.priceInPerM, priceOut = meta.priceOutPerM;
  const cost = Number.isFinite(priceIn) && Number.isFinite(priceOut) ? (promptTokens * priceIn + completionTokens * priceOut) / 1e6 : null;
  const workerCalls = calls.filter((c) => c.stage === "worker");
  return {
    id: meta.id, arm: meta.arm, model: meta.model, mode: meta.mode, status: meta.status || "unknown",
    wall_s: meta.finished && meta.started ? Math.round((new Date(meta.finished) - new Date(meta.started)) / 1000) : null,
    prompt_tokens: promptTokens, completion_tokens: completionTokens, reasoning_tokens: reasoningTokens, cost,
    tickets_total: meta.ticketsTotal ?? null,
    tickets_passed_first_try: tickets.filter((t) => t.status === "ok" && t.attempts === 1).length,
    tickets_ok: tickets.filter((t) => t.status === "ok").length,
    tickets_queued: tickets.filter((t) => t.status === "queued").length,
    retries: Math.max(0, workerCalls.length - tickets.length) + (meta.mode === "claude" ? tickets.reduce((a, t) => a + Math.max(0, (t.attempts || 1) - 1), 0) : 0),
    reviewer_corrections: meta.reviewerCorrections ?? null,
    tests_final: meta.testsFinal ?? null,
    outcomes: workerCalls.reduce((a, c) => { a[c.kind] = (a[c.kind] || 0) + 1; return a; }, {}),
  };
}
