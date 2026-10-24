import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "../lib/env.mjs";
import { runnerOptions } from "../lib/runner-options.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "scalesync-runner-"));
const pids = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i = 0; i < 60; i++) { if (predicate()) return; await pause(50); }
  throw new Error(message);
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

try {
  const lib = path.join(root, "app/lib");
  fs.mkdirSync(lib, { recursive: true });
  fs.mkdirSync(path.join(root, ".claude/skills/roast-room"), { recursive: true });
  for (const name of ["env.mjs", "local-runner.mjs", "runner-options.mjs"]) {
    fs.copyFileSync(path.join(REPO_ROOT, "app/lib", name), path.join(lib, name));
  }
  const fake = path.join(root, "fake-cli.mjs");
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from "node:fs";
fs.writeFileSync(process.env.TEST_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
process.stdin.resume();
setInterval(() => {}, 1000);
`);
  fs.chmodSync(fake, 0o755);
  const { startLocalCouncil, cancelLocalCouncil, getRequest } = await import(pathToFileURL(path.join(lib, "local-runner.mjs")).href);
  for (const runner of ["claude", "codex"]) {
    const choice = runnerOptions(runner).models[1];
    const effort = choice.efforts.includes("high") ? "high" : choice.efforts[0];
    const argsFile = path.join(root, `${runner}-args.json`);
    process.env[runner === "claude" ? "CLAUDE_BIN" : "CODEX_BIN"] = fake;
    process.env.TEST_ARGS_FILE = argsFile;
    const record = startLocalCouncil("Should a small company hire now or wait three months?", "quick", "offline-check", runner,
      { model: choice.id, effort });
    pids.push(record.pid);
    await until(() => fs.existsSync(argsFile), `${runner} did not start`);
    const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    if (runner === "claude") {
      assert.equal(args[args.indexOf("--model") + 1], choice.id);
      assert.equal(args[args.indexOf("--effort") + 1], effort);
    } else {
      assert.equal(args[args.indexOf("--model") + 1], choice.id);
      assert.ok(args.includes(`model_reasoning_effort=${JSON.stringify(effort)}`));
    }
    assert.equal(cancelLocalCouncil(record.id).status, "cancelled");
    await until(() => !alive(record.pid), `${runner} did not stop after cancellation`);
    await pause(50);
    assert.equal(getRequest(record.id).status, "cancelled");
    assert.equal(getRequest(record.id).model, choice.id);
    assert.equal(getRequest(record.id).effort, effort);
  }
  console.log("Runner options, CLI arguments, persistence, and cancellation passed for Claude and Codex.");
} finally {
  for (const pid of pids) {
    if (alive(pid)) {
      try { process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL"); } catch { /* Already stopped. */ }
    }
  }
  delete process.env.CLAUDE_BIN;
  delete process.env.CODEX_BIN;
  delete process.env.TEST_ARGS_FILE;
  fs.rmSync(root, { recursive: true, force: true });
}
