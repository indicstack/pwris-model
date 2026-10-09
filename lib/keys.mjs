import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const KEYS_DIR = resolve(homedir(), ".pwr");
export const KEYS_PATH = resolve(KEYS_DIR, "keys.env");

function parse(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function readKeys() {
  if (!existsSync(KEYS_PATH)) return {};
  return parse(readFileSync(KEYS_PATH, "utf8"));
}

// Writes the whole file with mode 600. Values are never returned to callers other than readKeys.
export function writeKey(arm, value) {
  mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  const keys = readKeys();
  const name = `PWR_KEY_${arm}`;
  if (value === "" || value == null) delete keys[name];
  else keys[name] = value;
  const text = Object.entries(keys).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  writeFileSync(KEYS_PATH, text, { mode: 0o600 });
  chmodSync(KEYS_PATH, 0o600);
}

export function keyStatus() {
  const keys = readKeys();
  const mode = existsSync(KEYS_PATH) ? (statSync(KEYS_PATH).mode & 0o777).toString(8) : null;
  const has = {};
  for (const arm of ["A", "B", "C"]) has[arm] = Boolean(keys[`PWR_KEY_${arm}`]);
  return { path: KEYS_PATH, mode, has };
}

export function keyFor(arm) {
  return readKeys()[`PWR_KEY_${arm}`] || "";
}
