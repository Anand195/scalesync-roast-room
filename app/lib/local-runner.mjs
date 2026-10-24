import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { REPO_ROOT, SESSIONS_DIR } from "./env.mjs";
import { validateRunnerSelection } from "./runner-options.mjs";

const requestFile = (id) => path.join(SESSIONS_DIR, id, "request.json");
const validId = (id) => /^\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$/.test(id);
let active = null;

function writeRequest(record) {
  record.updatedAt = new Date().toISOString();
  const file = requestFile(record.id);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function getRequest(id) {
  if (!validId(id)) return null;
  let record;
  try { record = JSON.parse(fs.readFileSync(requestFile(id), "utf8")); } catch { return null; }
  const dir = path.join(SESSIONS_DIR, id);
  if (record.status === "running" && fs.existsSync(path.join(dir, "verdict.json"))) {
    record.status = "done";
    writeRequest(record);
  } else if (record.status === "running" && !alive(record.pid)) {
    record.status = "interrupted";
    record.error = "The council process stopped before writing a verdict.";
    writeRequest(record);
  }
  return record;
}

export function listRequests() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR)
    .map(getRequest).filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function runningRequestId() {
  return listRequests().find((r) => r.status === "running")?.id || null;
}

function runnerBinary(runner) {
  const configured = process.env[runner === "claude" ? "CLAUDE_BIN" : "CODEX_BIN"];
  if (configured) return configured;
  const local = path.join(process.env.HOME || "", `.local/bin/${runner}`);
  return fs.existsSync(local) ? local : runner;
}

function runPrompt(record) {
  const dir = path.join(SESSIONS_DIR, record.id);
  return `Run the Roast Room council for the decision below. Read ${path.join(REPO_ROOT, ".claude/skills/roast-room/SKILL.md")} and its roster and references. Use the existing session folder ${dir}; do not create another session folder. The original question is saved in request.json there. Write brief.md, council.json, round files, cruxes.json, draft.json where applicable, verdict.md, and verdict.json in the upstream format, with verdict.json last so the local room can play the result. Use the advisor brains and agent files under ${path.join(REPO_ROOT, ".claude")}. Work sequentially if subagents are unavailable. Do not edit application code or install packages. Do not ask the user questions in this unattended run; treat this as the user saying "just run it" and mark any missing facts as assumptions. Mode: ${record.mode}. Keep the source citation and quote verification rules. At the end, report a concise verdict.\n\nUSER DECISION:\n${record.prompt}`;
}

export function startLocalCouncil(prompt, mode = "full", source = "room", runner = "codex", selection = {}) {
  if (runningRequestId()) throw new Error("A council is already running. Wait for its verdict.");
  if (!["claude", "codex"].includes(runner)) throw new Error("Choose Claude Code or Codex CLI as the runner.");
  if (typeof prompt !== "string" || prompt.trim().length < 10) throw new Error("Give the council a real decision (at least a sentence).");
  if (prompt.length > 4000) throw new Error("The question must be 4,000 characters or less.");
  const { model, effort } = validateRunnerSelection(runner, selection.model, selection.effort);
  const id = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(SESSIONS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const record = { id, prompt: prompt.trim(), mode: mode === "quick" ? "quick" : "full", source, runner, model, effort,
    status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pid: null, error: null };
  const log = fs.openSync(path.join(dir, "runner.log"), "a");
  const answer = runner === "claude" ? fs.openSync(path.join(dir, "answer.md"), "w") : null;
  const args = runner === "claude"
    ? ["-p", "--output-format", "text", "--no-session-persistence", "--permission-prompts", "none",
      "--permission-mode", "acceptEdits", "--allowedTools", "Read,Write,Edit,Glob,Grep,Bash,WebSearch,WebFetch,Task"]
    : ["exec", "--ignore-user-config", "--sandbox", "workspace-write", "-C", REPO_ROOT,
      "--skip-git-repo-check", "--output-last-message", path.join(dir, "answer.md"), "-"];
  if (runner === "claude") {
    if (model) args.push("--model", model);
    if (effort) args.push("--effort", effort);
  } else {
    args.pop();
    if (model) args.push("--model", model);
    if (effort) args.push("--config", `model_reasoning_effort=${JSON.stringify(effort)}`);
    args.push("-");
  }
  const child = spawn(runnerBinary(runner), args,
  { cwd: REPO_ROOT, detached: process.platform !== "win32", stdio: ["pipe", answer ?? log, log], env: process.env });
  fs.closeSync(log);
  if (answer !== null) fs.closeSync(answer);
  record.pid = child.pid || null;
  writeRequest(record);
  active = child;
  child.stdin.end(runPrompt(record));
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    const latest = getRequest(id) || record;
    if (child.cancelled || latest.status === "cancelled") { if (active === child) active = null; return; }
    latest.status = fs.existsSync(path.join(dir, "verdict.json")) ? "done" : "error";
    latest.error = latest.status === "done" ? null : error;
    writeRequest(latest);
    if (active === child) active = null;
  };
  child.on("error", (e) => finish(`Could not start ${runner}: ${e.message}`));
  child.on("close", (code, signal) => finish(`${runner} stopped (${signal || `exit ${code}`}) before writing a verdict. See runner.log.`));
  return record;
}

export function cancelLocalCouncil(id) {
  const record = getRequest(id);
  if (!record) throw new Error("That council was not found.");
  if (record.status !== "running") throw new Error("That council is no longer running.");
  const pid = record.pid;
  if (!alive(pid)) throw new Error("The council process is no longer running.");
  const signal = (name) => {
    if (process.platform !== "win32") {
      try { process.kill(-pid, name); return; } catch { /* Fall back to the process itself. */ }
    }
    process.kill(pid, name);
  };
  signal("SIGTERM");
  record.status = "cancelled";
  record.error = "Cancelled by the user.";
  record.cancelledAt = new Date().toISOString();
  writeRequest(record);
  if (active?.pid === pid) active.cancelled = true;
  const timer = setTimeout(() => { if (alive(pid)) { try { signal("SIGKILL"); } catch { /* Already stopped. */ } } }, 1500);
  timer.unref();
  return record;
}
