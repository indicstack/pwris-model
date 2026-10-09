import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./brief.mjs";

export const STATE_DIR = process.env.PWR_STATE_DIR || resolve(ROOT, "state");
export const SETTINGS_PATH = resolve(STATE_DIR, "settings.json");
export const DEFAULTS = JSON.parse(readFileSync(resolve(ROOT, "defaults.json"), "utf8"));
const ARM_DEFAULTS = JSON.parse(readFileSync(resolve(ROOT, "arms.default.json"), "utf8"));

export function readSettings() {
  const base = {};
  for (const arm of ["A", "B", "C"]) base[arm] = { ...ARM_DEFAULTS[arm] };
  if (!existsSync(SETTINGS_PATH)) return base;
  const saved = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  for (const arm of ["A", "B", "C"]) base[arm] = { ...base[arm], ...(saved[arm] || {}) };
  return base;
}

const ALLOWED = ["baseUrl", "model", "thinking", "concurrency", "maxTokens", "priceInPerM", "priceOutPerM", "calibrationCalls", "extraBody"];
export function writeSettings(patch) {
  const cur = readSettings();
  for (const arm of ["A", "B", "C"]) {
    if (!patch[arm]) continue;
    for (const k of ALLOWED) if (k in patch[arm]) cur[arm][k] = patch[arm][k];
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(cur, null, 2) + "\n");
  return cur;
}

export function armConfig(arm) {
  const s = readSettings()[arm];
  if (!s) throw new Error(`unknown arm ${arm}`);
  return s;
}

export function calibrationPath(arm) {
  return resolve(STATE_DIR, `calibration-${arm}.json`);
}

// Refuses a calibration file stamped with a different model (explainer section 02).
export function readCalibration(arm, model) {
  const p = calibrationPath(arm);
  if (!existsSync(p)) return null;
  const cal = JSON.parse(readFileSync(p, "utf8"));
  if (cal.model !== model) throw new Error(`calibration-${arm}.json is for model "${cal.model}", not "${model}". Re-run Calibrate.`);
  return cal;
}

export function probePath(arm) {
  return resolve(STATE_DIR, `probe-${arm}.json`);
}
export function readProbe(arm) {
  const p = probePath(arm);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
