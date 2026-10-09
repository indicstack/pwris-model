// Finds the Claude Code CLI on Mac, Linux and Windows without relying on a shell alias.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

export function claudeBin() {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const win = process.platform === "win32";
  const r = spawnSync(win ? "where" : "which", ["claude"], { encoding: "utf8" });
  const found = (r.stdout || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (found.length) return win ? found.find((f) => /\.exe$/i.test(f)) || found[0] : found[0];
  for (const c of [resolve(homedir(), ".local", "bin", win ? "claude.exe" : "claude"), resolve(homedir(), ".claude", "local", win ? "claude.exe" : "claude")]) if (existsSync(c)) return c;
  return "claude";
}

const needShell = (bin) => process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
// spawnSync wrapper: .cmd shims on Windows need a shell; real binaries do not.
export function runClaude(args, opts = {}) {
  const bin = claudeBin();
  return spawnSync(bin, args, { encoding: "utf8", maxBuffer: 50e6, ...opts, shell: needShell(bin) });
}
export function spawnClaude(args, opts = {}) {
  const bin = claudeBin();
  return [bin, args, { ...opts, shell: needShell(bin) }];
}
