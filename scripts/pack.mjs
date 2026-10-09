// Packs every file under a folder into the worker's JSON shape: node scripts/pack.mjs <dir> > out.json
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const root = process.argv[2];
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
process.stdout.write(JSON.stringify({ files: walk(root).sort().map((p) => ({ path: relative(root, p), content: readFileSync(p, "utf8") })) }, null, 2));
