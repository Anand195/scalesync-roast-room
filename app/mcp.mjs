import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { APP_ROOT, SESSIONS_DIR, env } from "./lib/env.mjs";

const BASE = "http://127.0.0.1:4730";
const tools = [
  { name: "roast_room_start", description: "Save a business decision and start a Roast Room council. Returns a session ID and the local room URL. The council runs asynchronously; call roast_room_wait until it finishes, then report the verdict.",
    inputSchema: { type: "object", properties: { question: { type: "string", description: "The decision, options, numbers, deadline, and leaning. At least one sentence." }, mode: { type: "string", enum: ["quick", "full", "ultra"], description: "Quick uses four advisors and usually two rounds; Full uses five to seven and three rounds; Ultra uses nine and five rounds with very high token use." }, model: { type: "string", description: "Optional model from this room's provider catalog. Omit to use the CLI default." }, effort: { type: "string", description: "Optional reasoning effort supported by the selected model. Omit to use the CLI default." } }, required: ["question"] } },
  { name: "roast_room_continue", description: "Continue a completed Roast Room thread with a follow-up question. Saves a new turn linked to the prior council and carries its verdict and action plan into context.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "The completed turn to continue." }, question: { type: "string", description: "The follow-up question." }, mode: { type: "string", enum: ["quick", "full", "ultra"] } }, required: ["id", "question"] } },
  { name: "roast_room_cancel", description: "Stop a running Claude Code or Codex CLI council immediately. The saved question remains in history.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "roast_room_status", description: "Check whether a saved Roast Room question is running, done, cancelled, or failed.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "roast_room_wait", description: "Wait up to 50 seconds for a running council. Repeat until it returns done, cancelled, or failed; the user can watch the room meanwhile.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, seconds: { type: "integer", minimum: 1, maximum: 50 } }, required: ["id"] } },
  { name: "roast_room_history", description: "List saved Roast Room questions and council sessions from every entry point.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } } } },
  { name: "roast_room_result", description: "Read a completed Roast Room verdict and original question by session ID.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];

async function request(url, options) {
  const response = await fetch(BASE + url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Room returned ${response.status}`);
  return body;
}

async function ensureRoom() {
  const selectedRunner = process.env.COUNCIL_RUNNER || env("COUNCIL_RUNNER") || "codex";
  if (!["claude", "codex"].includes(selectedRunner)) throw new Error("Set COUNCIL_RUNNER=claude or codex for desktop questions.");
  try {
    const info = await request("/api/seats");
    if (info.runner !== selectedRunner) throw new Error(`Roast Room is running in ${info.runner} mode. Restart it with COUNCIL_RUNNER=${selectedRunner}.`);
    return;
  } catch (error) {
    if (!/fetch failed|ECONNREFUSED/.test(String(error))) throw error;
  }
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const log = fs.openSync(path.join(SESSIONS_DIR, "room-server.log"), "a");
  const child = spawn(process.execPath, [path.join(APP_ROOT, "server.mjs")], {
    cwd: path.dirname(APP_ROOT), detached: true, stdio: ["ignore", log, log],
    env: { ...process.env, COUNCIL_RUNNER: selectedRunner },
  });
  fs.closeSync(log);
  child.unref();
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const info = await request("/api/seats");
      if (info.runner === selectedRunner) return;
      throw new Error(`Port 4730 is running Roast Room in ${info.runner} mode.`);
    } catch (error) {
      if (!/fetch failed|ECONNREFUSED/.test(String(error))) throw error;
    }
  }
  throw new Error("Could not start the local Roast Room. Check sessions/room-server.log.");
}

async function call(name, args) {
  await ensureRoom();
  if (name === "roast_room_start") {
    if (typeof args.question !== "string" || args.question.trim().length < 10) throw new Error("Give the council a decision in at least one sentence.");
    const result = await request("/api/council", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: args.question, mode: args.mode || "full", model: args.model || "", effort: args.effort || "", source: process.env.ROAST_ROOM_CLIENT || "desktop" }) });
    return { ...result, room: BASE, note: "The question is saved. The council runs asynchronously; check status or open the room." };
  }
  if (name === "roast_room_continue") {
    const parent = await request(`/api/requests/${encodeURIComponent(args.id)}`);
    if (parent.status !== "done") throw new Error("Continue a completed council turn.");
    const result = await request("/api/council", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: args.question, parentId: parent.id, mode: args.mode || parent.mode,
        model: parent.model || "", effort: parent.effort || "", source: process.env.ROAST_ROOM_CLIENT || "desktop" }) });
    return { ...result, threadId: parent.threadId || parent.id, turn: (parent.turn || 1) + 1, room: BASE };
  }
  if (name === "roast_room_cancel") {
    const result = await request(`/api/requests/${encodeURIComponent(args.id)}/cancel`, { method: "POST" });
    return { ...result, room: BASE, note: "The council was cancelled. Its question remains saved." };
  }
  if (name === "roast_room_status") {
    const r = await request(`/api/requests/${encodeURIComponent(args.id)}`);
    return { id: r.id, status: r.status, question: r.prompt, mode: r.mode, source: r.source, runner: r.runner, model: r.model, effort: r.effort, error: r.error,
      room: BASE, resultAvailable: Boolean(r.verdict) };
  }
  if (name === "roast_room_wait") {
    const until = Date.now() + Math.min(50, Math.max(1, Number(args.seconds) || 45)) * 1000;
    let r;
    do {
      r = await request(`/api/requests/${encodeURIComponent(args.id)}`);
      if (r.status !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } while (Date.now() < until);
    return { id: r.id, status: r.status, question: r.prompt, verdict: r.verdict, actionPlan: r.actionPlan, error: r.error, room: BASE };
  }
  if (name === "roast_room_history") {
    const r = await request("/api/sessions");
    return r.sessions.slice(0, Math.min(50, Math.max(1, Number(args.limit) || 20)))
      .map((s) => ({ id: s.id, question: s.prompt || s.title, status: s.status, mode: s.mode,
        runner: s.runner || null, model: s.model || null, effort: s.effort || null, threadId: s.threadId || s.id,
        turn: s.turn || 1, source: s.source || "skill" }));
  }
  if (name === "roast_room_result") {
    const r = await request(`/api/requests/${encodeURIComponent(args.id)}`);
    return { id: r.id, status: r.status, question: r.prompt, runner: r.runner, model: r.model, effort: r.effort,
      verdict: r.verdict, actionPlan: r.actionPlan, answer: r.answer, error: r.error, room: BASE };
  }
  throw new Error(`Unknown tool: ${name}`);
}

function reply(id, result, error) {
  if (id === undefined || id === null) return;
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) }) + "\n");
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const { id, method, params = {} } = message;
  try {
    if (method === "initialize") return reply(id, { protocolVersion: params.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: "roast-room", version: "1.2.0" } });
    if (method === "notifications/initialized") return;
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") return reply(id, { tools });
    if (method === "tools/call") {
      try {
        const result = await call(params.name, params.arguments || {});
        return reply(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (e) { return reply(id, { content: [{ type: "text", text: e.message }], isError: true }); }
    }
    return reply(id, null, { code: -32601, message: `Method not found: ${method}` });
  } catch (e) { reply(id, null, { code: -32603, message: e.message }); }
});
