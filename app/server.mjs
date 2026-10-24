import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT, REPO_ROOT, SESSIONS_DIR, env } from "./lib/env.mjs";
import { loadRoster, BOARD } from "./lib/seats.mjs";
import { startCouncil, getSession, subscribe, listSaved, loadSaved, MODELS } from "./lib/council.mjs";
import { usage } from "./lib/anthropic.mjs";
import * as watch from "./lib/watch.mjs";
import { startLocalCouncil, cancelLocalCouncil, getRequest, listRequests, runningRequestId } from "./lib/local-runner.mjs";
import { runnerOptions } from "./lib/runner-options.mjs";

const PORT = Number(process.env.PORT) || 4730;
const PUBLIC = path.join(APP_ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8" };

let running = null; // one council at a time (API runner)

// "viewer" watches chat-run councils; "codex" and "claude" use signed-in local CLIs;
// "api" uses ANTHROPIC_API_KEY. All four share the saved sessions folder.
const configuredRunner = (process.env.COUNCIL_RUNNER || env("COUNCIL_RUNNER") || "viewer").toLowerCase();
const RUNNER = ["api", "codex", "claude"].includes(configuredRunner) ? configuredRunner : "viewer";
watch.startWatching();

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  let bytes = 0;
  for await (const c of req) { bytes += c.length; if (bytes > 28 * 1024 * 1024) throw new Error("Request exceeds the 20 MB attachment limit."); raw += c; }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (p === "/api/health") return send(res, 200, { ok: true, runner: RUNNER, repository: REPO_ROOT });
    if (p === "/api/seats") {
      // portraits: which of the four mouth shapes exist for each seat (a seat with none gets a drawn bust)
      const frame = (key, sh) => ["webp", "png", "jpg"].map((x) => `${key}-${sh}.${x}`).find((f) => fs.existsSync(path.join(PUBLIC, "portraits", f)));
      const seats = loadRoster().map((s) => ({ ...s, portraits: Object.fromEntries(["base", "open", "mid", "blink"].map((sh) => [sh, frame(s.key, sh)]).filter(([, f]) => f).map(([sh, f]) => [sh, `/portraits/${f}`])) }));
      return send(res, 200, { seats, board: BOARD, models: RUNNER === "codex" ? { seat: "Codex CLI", chair: "Codex CLI" }
        : RUNNER === "claude" ? { seat: "Claude Code", chair: "Claude Code" } : MODELS,
        runner: RUNNER, runnerOptions: runnerOptions(RUNNER), hasKey: Boolean(env("ANTHROPIC_API_KEY")) });
    }
    if (p === "/api/usage") return send(res, 200, usage);
    if (p === "/api/council" && req.method === "POST") {
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return send(res, 403, { error: "Local requests only." });
      if (RUNNER === "viewer") return send(res, 403, { error: "This room is a viewer. Set COUNCIL_RUNNER=claude, codex, or api to ask here." });
      if ((running && getSession(running)?.status === "running") || runningRequestId()) return send(res, 409, { error: "A council is already in session. Wait for its verdict." });
      const { prompt, mode, source, model, effort, attachments, parentId } = await readJson(req);
      if (typeof prompt !== "string" || prompt.trim().length < 10) return send(res, 400, { error: "Give the council a real decision (at least a sentence)." });
      if (RUNNER === "codex" || RUNNER === "claude") {
        try {
          const s = startLocalCouncil(prompt, mode, typeof source === "string" ? source.slice(0, 30) : "room", RUNNER, { model, effort, attachments, parentId });
          return send(res, 200, { id: s.id, status: s.status });
        } catch (e) { return send(res, 400, { error: e.message }); }
      }
      if ((attachments && attachments.length) || parentId) return send(res, 400, { error: "Attachments and threads require a Claude Code or Codex CLI runner." });
      const s = startCouncil(prompt.trim().slice(0, 4000), ["quick", "ultra"].includes(mode) ? mode : "full");
      running = s.id;
      return send(res, 200, { id: s.id, status: s.status });
    }
    if (p.startsWith("/api/stream/")) {
      const id = decodeURIComponent(p.split("/").pop());
      const s = getSession(id) || watch.getLive(id);
      if (!s) return send(res, 404, { error: "no such session" });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n");
      const ping = setInterval(() => res.write(": ping\n\n"), 15000);
      res.on("close", () => clearInterval(ping));
      return subscribe(s, res);
    }
    if (p === "/api/sessions") {
      const byId = new Map([...listSaved(), ...watch.listLive()].map((s) => [s.id, s]));
      for (const r of listRequests()) {
        const old = byId.get(r.id) || {};
        byId.set(r.id, { ...old, id: r.id, title: old.title || r.prompt.slice(0, 60), prompt: r.prompt,
          mode: r.mode, status: r.status, source: r.source, runner: r.runner, model: r.model, effort: r.effort,
          threadId: r.threadId || r.id, parentId: r.parentId || null, turn: r.turn || 1, attachments: r.attachments || [], error: r.error });
      }
      const all = [...byId.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
      const apiRunning = running && getSession(running)?.status === "running" ? running : null;
      const liveId = watch.runningId();
      const liveRequest = liveId && getRequest(liveId);
      const pendingId = runningRequestId();
      return send(res, 200, { sessions: all, running: apiRunning,
        live: liveRequest && (liveRequest.status === "cancelled" || (["claude", "codex"].includes(RUNNER) && liveRequest.runner !== RUNNER)) ? null : liveId,
        pending: pendingId && getRequest(pendingId)?.runner === RUNNER ? pendingId : null });
    }
    if (p.startsWith("/api/requests/") && p.endsWith("/cancel") && req.method === "POST") {
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return send(res, 403, { error: "Local requests only." });
      if (RUNNER !== "claude" && RUNNER !== "codex") return send(res, 403, { error: "Cancellation is available for local CLI councils." });
      const id = decodeURIComponent(p.split("/").at(-2));
      if (getRequest(id)?.runner !== RUNNER) return send(res, 409, { error: "That council belongs to another provider." });
      try {
        const cancelled = cancelLocalCouncil(id);
        return send(res, 200, { id: cancelled.id, status: cancelled.status });
      } catch (e) { return send(res, 409, { error: e.message }); }
    }
    if (p.startsWith("/api/requests/")) {
      const id = decodeURIComponent(p.split("/").pop());
      const r = getRequest(id);
      if (!r) return send(res, 404, { error: "not found" });
      const verdictFile = path.join(SESSIONS_DIR, id, "verdict.md");
      const answerFile = path.join(SESSIONS_DIR, id, "answer.md");
      const planFile = path.join(SESSIONS_DIR, id, "action-plan.md");
      return send(res, 200, { ...r, verdict: fs.existsSync(verdictFile) ? fs.readFileSync(verdictFile, "utf8") : null,
        actionPlan: fs.existsSync(planFile) ? fs.readFileSync(planFile, "utf8") : null,
        answer: fs.existsSync(answerFile) ? fs.readFileSync(answerFile, "utf8") : null });
    }
    if (p.startsWith("/api/sessions/")) {
      const id = decodeURIComponent(p.split("/").pop());
      const x = watch.getLive(id);
      const r = getRequest(id);
      const j = loadSaved(id) || (x && { id, title: x.title, mode: x.mode, status: x.status, events: x.events }) ||
        (r && { id, title: r.prompt.slice(0, 60), prompt: r.prompt, mode: r.mode, status: r.status, error: r.error, events: [] });
      return j ? send(res, 200, { ...j, request: r || null }) : send(res, 404, { error: "not found" });
    }
    // static
    const file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : p));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Roast Room on http://localhost:${PORT} (${RUNNER} runner)`));
