import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const CODEX_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const CLAUDE_MODELS = [
  { id: "fable", label: "Fable" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];
const CODEX_FALLBACK = [
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
  { id: "gpt-6-astra", label: "GPT-6 Astra", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
  { id: "gpt-6-luna", label: "GPT-6 Luna", efforts: ["low", "medium", "high", "xhigh", "max"] },
];

function codexModels() {
  const root = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(root, "models_cache.json"), "utf8"));
    const models = (cache.models || []).filter((m) => m.visibility === "list" && /^[a-z0-9][a-z0-9.-]*$/.test(m.slug))
      .map((m) => ({ id: m.slug, label: m.display_name || m.slug,
        efforts: (m.supported_reasoning_levels || []).map((e) => e.effort).filter((e) => CODEX_EFFORTS.includes(e)) }));
    if (models.length) return { models, source: "local Codex model cache" };
  } catch { /* A new Codex installation may not have populated its cache yet. */ }
  return { models: CODEX_FALLBACK, source: "built-in suggestions" };
}

export function runnerOptions(runner) {
  if (runner === "claude") return { provider: "Claude Code", source: "Claude Code model aliases",
    models: [{ id: "", label: "CLI default", efforts: CLAUDE_EFFORTS },
      ...CLAUDE_MODELS.map((m) => ({ ...m, efforts: CLAUDE_EFFORTS }))] };
  if (runner === "codex") {
    const { models, source } = codexModels();
    return { provider: "Codex CLI", source,
      models: [{ id: "", label: "CLI default", efforts: ["low", "medium", "high", "xhigh", "max"] }, ...models] };
  }
  return null;
}

export function validateRunnerSelection(runner, model = "", effort = "") {
  if (typeof model !== "string" || typeof effort !== "string") throw new Error("Choose a model and effort from the available options.");
  const chosen = runnerOptions(runner)?.models.find((m) => m.id === model);
  if (!chosen || (effort && !chosen.efforts.includes(effort))) throw new Error("That model and effort combination is not available for this runner.");
  return { model, effort };
}
