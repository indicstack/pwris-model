// Where things live. Bench mode (no PWR_PROJECT): everything in this repo. Project mode (PWR_PROJECT=<dir>):
// the brief, tickets, tests, runs and state live under <dir>/.pwr/, and the worker writes code into <dir> itself.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const HOME = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECT = process.env.PWR_PROJECT ? resolve(process.env.PWR_PROJECT) : null;
export const PWR_DIR = PROJECT ? resolve(PROJECT, ".pwr") : HOME;
export const BRIEF_PATH = resolve(PWR_DIR, "BRIEF.md");
export const TICKETS_PATH = resolve(PWR_DIR, "tickets.jsonl");
export const TESTS_BASE = PWR_DIR; // ticket.test is relative to this
export const RUNS_DIR = resolve(PWR_DIR, "runs");
export const STATE_DIR = process.env.PWR_STATE_DIR || resolve(PWR_DIR, "state");
export const WORK_ROOT = PROJECT; // null in bench mode: each run gets its own work dir
