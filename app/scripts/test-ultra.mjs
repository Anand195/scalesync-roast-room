import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "../lib/env.mjs";
import { loadRoster } from "../lib/seats.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "scalesync-ultra-"));
try {
  fs.mkdirSync(path.join(root, "app"));
  fs.cpSync(path.join(REPO_ROOT, "app/lib"), path.join(root, "app/lib"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude/skills"), { recursive: true });
  fs.symlinkSync(path.join(REPO_ROOT, ".claude/skills/roast-room"), path.join(root, ".claude/skills/roast-room"));
  fs.symlinkSync(path.join(REPO_ROOT, ".claude/agents"), path.join(root, ".claude/agents"));
  const { getLive } = await import(pathToFileURL(path.join(root, "app/lib/watch.mjs")).href);
  const roster = loadRoster();
  const keys = ["bezos", "graham", "hormozi", "garyvee", "martell", "wickman", "buffett", "naval", "musk"];
  const names = Object.fromEntries(roster.map((s) => [s.key, s.short]));
  const id = "2026-10-24-ultra-fixture";
  const dir = path.join(root, "sessions", id);
  fs.mkdirSync(dir, { recursive: true });
  const setup = { title: "Test nine-seat council", decision: "Choose an option", mode: "ultra",
    brief: "Synthetic verification only.", options: [{ id: "A", label: "Proceed" }, { id: "B", label: "Wait" }],
    seats: keys, weights: Object.fromEntries(keys.map((k) => [k, { weight: 1, reason: "fixture" }])) };
  fs.writeFileSync(path.join(dir, "council.json"), JSON.stringify(setup));
  for (let round = 1; round <= 5; round++) {
    const cards = keys.map((k) => {
      const base = `## ${names[k]}\n\nSEAT: ${names[k]}\nOPTION SCORES: A ${round + 4}/10 · B 3/10\n`;
      return base + (round === 3 || round === 5
        ? `VOTE: Endorse\nFINAL SCORE: ${round + 4}/10\nFINAL PILLAR SCORE: ${round + 4}/10\nONE LINE FOR THE FOUNDER: Check the evidence.\n`
        : `STANCE: Yes\nPILLAR SCORE: ${round + 4}/10\nCONFIDENCE: 4/5\nRUIN RISK: none\nTHE CALL: Proceed with checks.\n`);
    });
    fs.writeFileSync(path.join(dir, `round-${round}.md`), `# Round ${round}\n\n${cards.join("\n\n")}\n`);
  }
  fs.writeFileSync(path.join(dir, "cruxes.json"), JSON.stringify({ cruxes: [], unanimous: false, note: "Test." }));
  fs.writeFileSync(path.join(dir, "draft.json"), JSON.stringify({ option: "A", label: "GO WITH CONDITIONS", recommendation: "Proceed with checks.", conditions: [], next_steps: [], cheapest_test: "Pilot", kill_criteria: "Stop if failed" }));
  fs.writeFileSync(path.join(dir, "action-plan.md"), "# Synthetic action plan\n");
  fs.writeFileSync(path.join(dir, "verdict.json"), JSON.stringify({ label: "GO WITH CONDITIONS", call: "Proceed with checks.", recommended: "A", why: [], fights: [], minority: { seat: "Buffett", quote: "Check the evidence.", would_have_to_be_true: "Risk is acceptable." }, amendments: [], conditions: [], next_steps: [], cheapest_test: "Pilot", kill_criteria: "Stop if failed", revisit: "After pilot" }));
  const session = getLive(id);
  assert.equal(session.status, "done");
  assert.deepEqual(session.events.filter((e) => e.type === "round_start").map((e) => e.round), [1, 2, 3, 4, 5]);
  assert.deepEqual(session.events.filter((e) => e.type === "round_done").map((e) => e.round), [1, 2, 3, 4, 5]);
  assert.equal(session.events.filter((e) => e.type === "seat_done").length, 45);
  const verdict = session.events.find((e) => e.type === "verdict");
  assert.equal(verdict.verdict.votes.endorse, 9);
  assert.equal(verdict.verdict.support, 9);
  assert.equal(verdict.seats.length, 9);
  assert.match(verdict.actionPlan, /Synthetic action plan/);
  if (process.env.ROAST_ROOM_ULTRA_FIXTURE_PATH) {
    fs.writeFileSync(process.env.ROAST_ROOM_ULTRA_FIXTURE_PATH,
      JSON.stringify({ id, prompt: "Synthetic nine-seat browser check", mode: "ultra", status: "done", title: setup.title, events: session.events }, null, 2));
  }
  const shortId = "2026-10-24-ultra-short";
  const shortDir = path.join(root, "sessions", shortId);
  fs.mkdirSync(shortDir);
  fs.writeFileSync(path.join(shortDir, "council.json"), JSON.stringify({ ...setup, seats: keys.slice(0, 8) }));
  const invalid = getLive(shortId);
  assert.equal(invalid.status, "error");
  assert.match(invalid.events.find((e) => e.type === "error")?.error, /exactly 9/);
  console.log("Ultra watcher passed: nine seats, five rounds, 45 cards, final vote scoring, and short-board rejection.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
