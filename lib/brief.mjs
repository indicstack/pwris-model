import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BRIEF_PATH = resolve(ROOT, "BRIEF.md");
const HASH_LINE = /^SHA-256: ([0-9a-f]{64})\s*$/m;

export function splitBrief(text) {
  const m = text.match(HASH_LINE);
  if (!m) return { body: text.replace(/\s+$/, "") + "\n", recorded: null };
  return { body: text.slice(0, m.index).replace(/\s+$/, "") + "\n", recorded: m[1] };
}

export function hashText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Returns { text, body, hash }. Throws if the brief is unfrozen or its hash changed.
export function loadBrief() {
  const text = readFileSync(BRIEF_PATH, "utf8");
  const { body, recorded } = splitBrief(text);
  if (!recorded) throw new Error("BRIEF.md is not frozen: run `node scripts/freeze-brief.mjs`");
  const hash = hashText(body);
  if (hash !== recorded) {
    throw new Error(`BRIEF.md changed since it was frozen (recorded ${recorded.slice(0, 12)}, now ${hash.slice(0, 12)}). Refusing to run.`);
  }
  return { text, body, hash };
}
