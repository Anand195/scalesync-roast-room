import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { REPO_ROOT, SESSIONS_DIR } from "../lib/env.mjs";

const URL = "http://localhost:4730";
const args = process.argv.slice(2);
const flag = args.indexOf("--runner");
const requested = flag < 0 ? "auto" : args[flag + 1];
const noOpen = args.includes("--no-open");

if (!["auto", "claude", "codex"].includes(requested)) {
  console.error("Usage: npm run launch -- --runner auto|claude|codex [--no-open]");
  process.exit(2);
}
if (Number(process.versions.node.split(".")[0]) < 20) {
  console.error("Roast Room needs Node.js 20 or newer.");
  process.exit(2);
}

function cliReady(runner) {
  const local = path.join(process.env.HOME || "", ".local", "bin", runner);
  const binary = process.env[runner === "claude" ? "CLAUDE_BIN" : "CODEX_BIN"] ||
    (fs.existsSync(local) ? local : runner);
  const result = spawnSync(binary, runner === "claude" ? ["auth", "status"] : ["login", "status"], {
    cwd: REPO_ROOT, encoding: "utf8", timeout: 15000,
  });
  return result.status === 0;
}

async function health() {
  try {
    const response = await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

function saveRunner(runner) {
  const file = path.join(REPO_ROOT, ".env");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const next = /^COUNCIL_RUNNER=.*$/m.test(current)
    ? current.replace(/^COUNCIL_RUNNER=.*$/m, `COUNCIL_RUNNER=${runner}`)
    : `${current.trimEnd()}${current ? "\n" : ""}COUNCIL_RUNNER=${runner}\n`;
  fs.writeFileSync(file, next, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function openBrowser() {
  if (noOpen) return;
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const browserArgs = process.platform === "win32" ? ["/c", "start", "", URL] : [URL];
  const browser = spawn(command, browserArgs, { detached: true, stdio: "ignore" });
  browser.on("error", () => console.error(`Open ${URL} in your browser.`));
  browser.unref();
}

let runner = requested;
if (runner === "auto") runner = cliReady("claude") ? "claude" : cliReady("codex") ? "codex" : null;
if (!runner || !cliReady(runner)) {
  console.error(`Sign in to ${requested === "auto" ? "Claude Code (claude auth login) or Codex CLI (codex login)" : runner === "claude" ? "Claude Code (claude auth login)" : "Codex CLI (codex login)"} first.`);
  process.exit(2);
}

const existing = await health();
if (!existing) {
  let occupied = false;
  try {
    await fetch(URL, { signal: AbortSignal.timeout(1500) });
    occupied = true;
  } catch { /* No HTTP server responded. */ }
  if (occupied) {
    console.error("Port 4730 is already in use by a server without this version's health endpoint. Identify and stop it before launching this room.");
    process.exit(1);
  }
}
if (existing && (existing.repository !== REPO_ROOT || existing.runner !== runner)) {
  console.error(`Port 4730 already serves ${existing.repository} with ${existing.runner}. Stop that room before launching this one.`);
  process.exit(1);
}
saveRunner(runner);
if (!existing) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const log = fs.openSync(path.join(SESSIONS_DIR, "room-server.log"), "a");
  const child = spawn(process.execPath, [path.join(REPO_ROOT, "app", "server.mjs")], {
    cwd: REPO_ROOT, detached: true, stdio: ["ignore", log, log],
    env: { ...process.env, COUNCIL_RUNNER: runner },
  });
  fs.closeSync(log);
  child.unref();
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const info = await health();
    if (info?.repository === REPO_ROOT && info.runner === runner) { ready = true; break; }
  }
  if (!ready) {
    console.error(`Room did not start. Check ${path.join(SESSIONS_DIR, "room-server.log")}.`);
    process.exit(1);
  }
}
openBrowser();
console.log(`Roast Room ready with ${runner === "claude" ? "Claude Code" : "Codex CLI"}: ${URL}`);
console.log(`Questions and verdicts stay in ${SESSIONS_DIR}`);
