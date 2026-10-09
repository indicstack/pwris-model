import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function appendJsonl(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(obj) + "\n");
}

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// Latest line per key wins (resume rule from the explainer).
export function latestByKey(path, keyFn) {
  const m = new Map();
  for (const row of readJsonl(path)) m.set(keyFn(row), row);
  return m;
}
