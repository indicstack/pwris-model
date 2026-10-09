import { readFileSync, writeFileSync } from "node:fs";
import { BRIEF_PATH, splitBrief, hashText } from "../lib/brief.mjs";

const text = readFileSync(BRIEF_PATH, "utf8");
const { body, recorded } = splitBrief(text);
if (recorded) {
  console.log(`already frozen: ${recorded}${hashText(body) === recorded ? " (matches)" : " (MISMATCH)"}`);
  process.exit(0);
}
const trimmed = body;
const hash = hashText(trimmed);
writeFileSync(BRIEF_PATH, `${trimmed}\nSHA-256: ${hash}\n`);
console.log(`frozen: ${hash}`);
