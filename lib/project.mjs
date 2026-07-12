import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configRoot, readJson, run, safeProjectRoot, skillRoot, writeJson } from "./shared.mjs";
import { projectSettingsForRoute, proxyCredentials, refreshCatalog } from "./models.mjs";

const PRD_TEMPLATE = `# Product Requirements Document\n\n## Outcome\nDescribe the measurable user or business outcome.\n\n## KPI / acceptance threshold\n- Primary KPI:\n- Minimum acceptable result:\n\n## Users and problem\n\n## In scope\n\n## Out of scope\n\n## Constraints\n\n## Acceptance scenarios\n`;

function safeControlDir(root, relative) {
  const path = join(root, relative);
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Refusing symlinked control directory: ${relative}`);
  mkdirSync(path, { recursive: true });
  const canonicalRoot = realpathSync(root), canonical = realpathSync(path);
  if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}/`)) throw new Error(`Control directory escapes project: ${relative}`);
  return path;
}

export function initializeProject(input = process.cwd()) {
  const root = safeProjectRoot(input);
  if (!existsSync(join(root, ".git"))) run("git", ["init"], { cwd: root });
  safeControlDir(root, ".pi");
  safeControlDir(root, ".loop");
  safeControlDir(root, join(".loop", "logs"));
  const configured = readJson(join(configRoot, "project-settings.json"), {});
  writeJson(join(root, ".pi", "settings.json"), configured);
  const prd = join(root, "PRD.md");
  if (!existsSync(prd)) writeFileSync(prd, PRD_TEMPLATE, { mode: 0o644 });
  const exclude = join(root, ".git", "info", "exclude");
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  const entries = [".loop/", ".pi-subagents/"];
  const addition = entries.filter((entry) => !current.split(/\r?\n/).includes(entry));
  if (addition.length) writeFileSync(exclude, `${current}${current.endsWith("\n") || !current ? "" : "\n"}${addition.join("\n")}\n`);
  return { root, prd };
}

export function validateProject(root = process.cwd()) {
  const result = run("node", [join(skillRoot, "scripts", "validate-run-state.mjs"), join(safeProjectRoot(root), ".loop", "run-state.json")], { allowFailure: true });
  return { ok: result.status === 0, stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "" };
}

export function projectState(root = process.cwd()) {
  root = safeProjectRoot(root);
  const statePath = join(root, ".loop", "run-state.json");
  let state = null;
  if (existsSync(statePath)) {
    const stat = lstatSync(statePath);
    const canonical = realpathSync(statePath);
    if (stat.isFile() && !stat.isSymbolicLink() && canonical.startsWith(`${root}/`)) state = readJson(statePath, null);
  }
  const branch = run("git", ["branch", "--show-current"], { cwd: root, allowFailure: true }).stdout?.trim() || "—";
  const worktrees = run("git", ["worktree", "list", "--porcelain"], { cwd: root, allowFailure: true }).stdout?.match(/^worktree /gm)?.length ?? 0;
  return { root, branch, worktrees, statePath, state };
}

export function formatState(summary) {
  if (!summary.state) return `Project: ${summary.root}\nState: not started\nBranch: ${summary.branch}\nWorktrees: ${summary.worktrees}`;
  const s = summary.state;
  return [`Project: ${summary.root}`, `Run: ${s.run_id ?? s.runId ?? "unknown"}`, `Status: ${s.status ?? "unknown"}`, `Phase: ${s.current_phase ?? s.currentPhase ?? "unknown"}`, `Branch: ${summary.branch}`, `Worktrees: ${summary.worktrees}`, `Updated: ${s.updated_at ?? s.updatedAt ?? "unknown"}`].join("\n");
}

export async function startLoop(root = process.cwd(), options = {}) {
  root = safeProjectRoot(root);
  if (!existsSync(join(root, "PRD.md"))) throw new Error("PRD.md is missing. Run product-loop init first.");
  let route;
  try { route = (await refreshCatalog()).route; }
  catch (error) {
    route = readJson(join(configRoot, "model-route.json"), {});
    if (!route.parent) throw error;
    console.warn(`Model refresh warning: ${error.message}. Using the last known catalog.`);
  }
  safeControlDir(root, ".pi");
  writeJson(join(root, ".pi", "settings.json"), projectSettingsForRoute(route));
  if (!route.parent) throw new Error("Models are not configured. Run product-loop setup first.");
  const prompt = join(skillRoot, "assets", "pi", "autonomous-run-prompt.md");
  const args = ["--model", `llm-proxy/${route.parent}`, "--thinking", "high", "--name", "product-loop", "--skill", skillRoot, "--approve", `@${join(root, "PRD.md")}`, `@${prompt}`];
  const credentials = proxyCredentials();
  const env = { ...process.env, LLM_PROXY_BASE_URL: credentials.baseUrl, LLM_PROXY_API_KEY: credentials.apiKey };
  if (!options.headless) return run("pi", args, { cwd: root, env, stdio: "inherit" });
  safeControlDir(root, ".loop");
  safeControlDir(root, join(".loop", "logs"));
  const log = join(root, ".loop", "logs", `pi-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  const fd = openSync(log, "a");
  try { return { result: run("pi", [...args, "--print"], { cwd: root, env, stdio: ["ignore", fd, fd] }), log }; }
  finally { closeSync(fd); }
}
