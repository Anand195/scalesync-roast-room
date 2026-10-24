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
  for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(50); }
  throw new Error(message);
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

try {
  const lib = path.join(root, "app/lib");
  fs.mkdirSync(lib, { recursive: true });
  fs.mkdirSync(path.join(root, ".claude/skills"), { recursive: true });
  fs.symlinkSync(path.join(REPO_ROOT, ".claude/skills/roast-room"), path.join(root, ".claude/skills/roast-room"));
  fs.symlinkSync(path.join(REPO_ROOT, ".claude/agents"), path.join(root, ".claude/agents"));
  for (const name of ["env.mjs", "local-runner.mjs", "attachments.mjs", "runner-options.mjs"]) {
    fs.copyFileSync(path.join(REPO_ROOT, "app/lib", name), path.join(lib, name));
  }
  const fake = path.join(root, "fake-cli.mjs");
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from "node:fs";
fs.writeFileSync(process.env.TEST_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => { if (process.env.TEST_PROMPT_FILE) fs.writeFileSync(process.env.TEST_PROMPT_FILE, input); });
setInterval(() => {}, 1000);
`);
  fs.chmodSync(fake, 0o755);
  const { startLocalCouncil, cancelLocalCouncil, getRequest } = await import(pathToFileURL(path.join(lib, "local-runner.mjs")).href);
  const { saveAttachments } = await import(pathToFileURL(path.join(lib, "attachments.mjs")).href);
  const filesDir = path.join(root, "file-check");
  assert.throws(() => saveAttachments(filesDir, [{ name: "voice.mp3", type: "audio/mpeg", data: "AAAA" }]), /Audio and video/);
  assert.throws(() => saveAttachments(filesDir, [{ name: "fake.pdf", type: "application/pdf", data: Buffer.from("not a PDF").toString("base64") }]), /PDF file is invalid/);
  const textFile = saveAttachments(filesDir, [{ name: "notes.md", type: "text/markdown", data: Buffer.from("# Product notes").toString("base64") }]);
  assert.equal(fs.readFileSync(textFile[0].path, "utf8"), "# Product notes");
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
  const choice = runnerOptions("codex").models[1];
  const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=";
  const parentArgs = path.join(root, "parent-args.json");
  process.env.CODEX_BIN = fake;
  process.env.TEST_ARGS_FILE = parentArgs;
  process.env.TEST_PROMPT_FILE = path.join(root, "parent-prompt.txt");
  const parent = startLocalCouncil("Should we build a small CRM for one customer segment?", "quick", "offline-check", "codex",
    { model: choice.id, effort: choice.efforts[0], attachments: [{ name: "screen.png", type: "image/png", data: image }] });
  pids.push(parent.pid);
  await until(() => fs.existsSync(process.env.TEST_PROMPT_FILE), "Parent prompt was not sent");
  const parentCliArgs = JSON.parse(fs.readFileSync(parentArgs, "utf8"));
  assert.ok(parentCliArgs.includes("--image"));
  assert.ok(fs.existsSync(parent.attachments[0].path));
  const parentDir = path.dirname(parent.attachments[0].path).replace(/\/attachments$/, "");
  fs.writeFileSync(path.join(parentDir, "action-plan.md"), "# Action plan\n");
  fs.writeFileSync(path.join(parentDir, "verdict.json"), '{"call":"Proceed conditionally"}');
  process.kill(process.platform === "win32" ? parent.pid : -parent.pid, "SIGTERM");
  await until(() => !alive(parent.pid), "Parent fake runner did not stop");
  assert.equal(getRequest(parent.id).status, "done");
  const followArgs = path.join(root, "follow-args.json");
  const followPrompt = path.join(root, "follow-prompt.txt");
  process.env.TEST_ARGS_FILE = followArgs;
  process.env.TEST_PROMPT_FILE = followPrompt;
  const follow = startLocalCouncil("Which exact fields and behaviors should the CRM MVP include?", "quick", "offline-check", "codex",
    { model: choice.id, effort: choice.efforts[0], parentId: parent.id });
  pids.push(follow.pid);
  await until(() => fs.existsSync(followPrompt), "Follow-up prompt was not sent");
  assert.equal(follow.threadId, parent.id);
  assert.equal(follow.parentId, parent.id);
  assert.equal(follow.turn, 2);
  assert.match(fs.readFileSync(followPrompt, "utf8"), /Read the prior request.json, verdict.md, and action-plan.md/);
  assert.equal(cancelLocalCouncil(follow.id).status, "cancelled");
  await until(() => !alive(follow.pid), "Follow-up runner did not stop");
  const ultraPrompt = path.join(root, "ultra-prompt.txt");
  process.env.TEST_ARGS_FILE = path.join(root, "ultra-args.json");
  process.env.TEST_PROMPT_FILE = ultraPrompt;
  const ultra = startLocalCouncil("Should our company expand to a second product this quarter?", "ultra", "offline-check", "codex",
    { model: choice.id, effort: choice.efforts[0] });
  pids.push(ultra.pid);
  await until(() => fs.existsSync(ultraPrompt), "Ultra prompt was not sent");
  assert.equal(ultra.mode, "ultra");
  assert.match(fs.readFileSync(ultraPrompt, "utf8"), /exactly nine seats and five complete rounds/);
  const ultraDir = path.join(root, "sessions", ultra.id);
  fs.writeFileSync(path.join(ultraDir, "action-plan.md"), "# Action plan\n");
  fs.writeFileSync(path.join(ultraDir, "verdict.json"), '{"call":"Proceed conditionally"}');
  for (let round = 1; round <= 5; round++) fs.writeFileSync(path.join(ultraDir, `round-${round}.md`), `# Round ${round}\n`);
  process.kill(process.platform === "win32" ? ultra.pid : -ultra.pid, "SIGTERM");
  await until(() => !alive(ultra.pid), "Ultra fake runner did not stop");
  assert.equal(getRequest(ultra.id).status, "done");
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
  delete process.env.TEST_PROMPT_FILE;
  await pause(300); // Let child close handlers persist their last request before removing the temporary session folder.
  fs.rmSync(root, { recursive: true, force: true });
}
