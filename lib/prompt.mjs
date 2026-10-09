import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, loadBrief } from "./brief.mjs";
import { FILES_SCHEMA } from "./schema.mjs";

// Shared text first (system: rules + the frozen brief), task last (user: reads, test, then the ticket line).
export const SHARED_RULES = [
  "You are the worker in a planner-worker-reviewer harness. You write code for exactly one ticket per call.",
  "Output only a JSON object of the shape {\"files\":[{\"path\":\"...\",\"content\":\"...\"}]}. No prose, no markdown fences.",
  "Write only the files the ticket lists under 'writes'; use those exact paths. Do not write any other file.",
  "The frozen brief below is the only specification. Follow its rules R1 to R10 and its Interfaces section word for word.",
  "Import every number from ./constants.mjs. Never write a numeric literal other than 0, 1, 2 or 1000 (milliseconds per second), and never invent an identifier that the brief or the test does not name.",
  "The test file shown will be run with `node --test` against your files. Make it pass without changing it.",
  "Plain ES modules, Node built-ins only, no dependencies, no comments longer than one line.",
].join("\n");

export function loadTickets() {
  return readFileSync(resolve(ROOT, "tickets.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// workDir: the run's work dir, so 'reads' show the files produced by earlier tickets.
export function buildMessages(ticket, workDir, fixes = []) {
  const brief = loadBrief();
  const system = `${SHARED_RULES}\n\n=== BRIEF.md (frozen, sha256 ${brief.hash}) ===\n${brief.body}`;
  const parts = [];
  for (const rel of ticket.reads) {
    const p = resolve(workDir, rel);
    const src = existsSync(p) ? readFileSync(p, "utf8") : existsSync(resolve(ROOT, rel)) ? readFileSync(resolve(ROOT, rel), "utf8") : null;
    if (src != null) parts.push(`=== existing file ${rel} ===\n${src}`);
  }
  parts.push(`=== test ${ticket.test} (run with node --test; PWR_WORK is the folder holding game/) ===\n${readFileSync(resolve(ROOT, ticket.test), "utf8")}`);
  parts.push(`=== harness facts ===\nticket id: ${ticket.id}\nwrites (exact paths): ${ticket.writes.join(", ")}\nrules: ${ticket.rules.join(", ")}`);
  let task = `=== ticket ${ticket.id}: ${ticket.title} ===\n${ticket.task}`;
  for (const f of fixes) task += `\n\n[fix ${f.name}] ${f.text}`;
  parts.push(task);
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ];
}

export function buildBody({ model, messages, maxTokens, thinking, extraBody }) {
  const body = {
    model,
    temperature: 0,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    chat_template_kwargs: { enable_thinking: Boolean(thinking) },
    response_format: { type: "json_schema", json_schema: FILES_SCHEMA },
    messages,
  };
  if (extraBody && typeof extraBody === "object") Object.assign(body, extraBody);
  return body;
}

export const promptChars = (messages) => messages.reduce((a, m) => a + m.content.length, 0);
