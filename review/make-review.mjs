// Builds a fresh isolated review folder outside this project: BRIEF.md, DIFF.md (the run's game files
// as a unified diff against an empty tree), and a byte-identical PROMPT-REVIEW.md. Then leak-scans it.
//   node review/make-review.mjs --run runs/<id> [--out ~/eval-isolated]
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { ROOT, loadBrief } from "../lib/brief.mjs";
import { updateMeta } from "../lib/runs.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] ?? true] : []).filter((x) => x.length));
if (!args.run) { console.error("usage: node review/make-review.mjs --run runs/<id> [--out dir]"); process.exit(2); }
loadBrief();
const runDir = resolve(ROOT, args.run);
const game = resolve(runDir, "work", "game");
if (!existsSync(game)) { console.error(`no work/game in ${runDir}`); process.exit(2); }
const outBase = resolve(String(args.out || resolve(homedir(), "eval-isolated")));
if (outBase.startsWith(ROOT)) { console.error("review folder must be outside the project"); process.exit(2); }
mkdirSync(outBase, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
let n = 1, dir;
do { dir = resolve(outBase, `review-${date}-${n++}`); } while (existsSync(dir));
mkdirSync(dir);

// files, sorted, as a unified diff against an empty tree (built here, so paths are always game/<file>)
function walk(dir, base = "") { const out = []; for (const n of readdirSync(dir).sort()) { const p = join(dir, n); if (statSync(p).isDirectory()) out.push(...walk(p, base + n + "/")); else out.push(base + n); } return out; }
let text = "";
for (const rel of walk(game)) {
  const lines = readFileSync(resolve(game, rel), "utf8").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  text += `diff --git a/game/${rel} b/game/${rel}\nnew file mode 100644\n--- /dev/null\n+++ b/game/${rel}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map((l) => "+" + l).join("\n") + "\n";
}
const header = `Diff of every file under game/ in one run, against an empty tree. Harness-owned game/constants.mjs is included.\n\n`;
writeFileSync(resolve(dir, "DIFF.md"), header + "```diff\n" + text + "\n```\n");
copyFileSync(resolve(ROOT, "BRIEF.md"), resolve(dir, "BRIEF.md"));
copyFileSync(resolve(ROOT, "review/PROMPT-REVIEW.md"), resolve(dir, "PROMPT-REVIEW.md"));

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
if (sha(resolve(dir, "PROMPT-REVIEW.md")) !== sha(resolve(ROOT, "review/PROMPT-REVIEW.md"))) { console.error("PROMPT-REVIEW.md copy differs"); process.exit(1); }

// leak scan: model, vendor and project names must not appear in the review folder
const LEAK = /qwen|indicstack|openrouter|opus|claude|anthropic|pwr-bench|calibrat|worker|planner/i;
const leaks = [];
for (const f of readdirSync(dir)) { const t = readFileSync(resolve(dir, f), "utf8"); t.split("\n").forEach((line, i) => { if (f !== "PROMPT-REVIEW.md" && LEAK.test(line)) leaks.push(`${f}:${i + 1}: ${line.slice(0, 120)}`); }); }
updateMeta(runDir, { reviewFolder: dir, reviewPromptSha256: sha(resolve(dir, "PROMPT-REVIEW.md")) });
console.log(`review folder: ${dir}`);
console.log(`files: ${readdirSync(dir).join(", ")}`);
console.log(leaks.length ? `LEAKS (${leaks.length}):\n${leaks.join("\n")}` : "leak scan: clean");
console.log(`\nNext: open a new Claude Code session in ${dir} and send @PROMPT-REVIEW.md. Say "done" here when it has written REVIEW.md.`);
