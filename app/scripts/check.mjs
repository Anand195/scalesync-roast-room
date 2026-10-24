import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "../lib/env.mjs";
import { loadRoster, parseOptionScores } from "../lib/seats.mjs";
import { finalNumbers } from "../lib/council.mjs";

const code = ["app/server.mjs", "app/mcp.mjs", "app/lib/local-runner.mjs", "app/lib/watch.mjs",
  "app/scripts/launch.mjs", "app/public/app.js", "app/public/pdf.js"];
for (const relative of code) {
  const checked = spawnSync(process.execPath, ["--check", path.join(REPO_ROOT, relative)], { encoding: "utf8" });
  assert.equal(checked.status, 0, `${relative}: ${checked.stderr}`);
}

const roster = loadRoster();
assert.deepEqual(parseOptionScores("OPTION SCORES: [A] 3/10 · [B] 2/10 · [C] 8/10", ["A", "B", "C"]),
  { A: 3, B: 2, C: 8 }, "Bracketed CLI card scores should render in the room");
const quick = { rounds: [2, 3], seats: ["martell"], weights: { martell: { weight: 1 } },
  cards: { 1: {}, 2: { martell: { parsed: { optionScores: { A: 3, B: 8 }, confidence: 3 } } }, 3: {} },
  scores: { 2: { A: { score: 3 }, B: { score: 8 } } } };
assert.equal(finalNumbers(quick).last, 2, "Quick council must score Round 2 when Round 3 is skipped");
assert.ok(roster.length >= 7, "Expected the upstream default advisor roster");
for (const seat of roster) {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, ".claude/agents", `council-${seat.key}.md`)), `Missing agent ${seat.key}`);
  assert.ok(fs.existsSync(path.join(REPO_ROOT, ".claude/skills/roast-room/brains", seat.slug)), `Missing brain ${seat.key}`);
}
for (const relative of ["app/public/brand/scalesync-logo.png", "app/public/brand/scalesync-icon.png",
  ".claude/skills/roast-room/SKILL.md", "LICENSE"]) {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, relative)), `Missing ${relative}`);
}

const replay = path.join(REPO_ROOT, "sessions/2026-10-10-example-first-sales-hire/events.json");
assert.ok(JSON.parse(fs.readFileSync(replay, "utf8")).events.length > 0);
const verdict = path.join(REPO_ROOT, "sessions/2026-10-09-example-take-the-seed/verdict.json");
assert.ok(JSON.parse(fs.readFileSync(verdict, "utf8")).call);
console.log(`Offline checks passed: ${code.length} JavaScript files, ${roster.length} advisors, assets, and a saved council.`);
