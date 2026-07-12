#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { configure } from "../lib/setup.mjs";
import { formatState, initializeProject, projectState, startLoop, validateProject } from "../lib/project.mjs";
import { serveDashboard } from "../lib/dashboard.mjs";
import { readCatalog, refreshCatalog } from "../lib/models.mjs";
import { generateMedia } from "../lib/media.mjs";
import { agentRoot, commandExists, configRoot, executablePath, parseArgs, readJson, run, safeProjectRoot, tailText } from "../lib/shared.mjs";

const HELP = `product-loop — PRD in, validated product out\n\nCommands:\n  setup                 Configure Pi from API URL + key\n  init [directory]      Prepare a project and PRD template\n  start [directory]     Start the autonomous loop\n  status [directory]    Show phase, run, worktrees, and validation\n  validate [directory]  Validate .loop/run-state.json\n  logs [directory]      Show the latest orchestration log\n  dashboard [directory] Open the live visual monitor\n  models                Refresh and list all proxy models\n  media image|video      Generate a product media asset\n  doctor [directory]    Check this machine and project\n\nMedia flags:\n  --prompt "..."        Required asset brief\n  --model <id>           Optional live model override\n  --output <path>        Artifact destination\n  --size 1536x1024       Optional image size\n  --duration 8           Optional video duration\n\nCommon flags:\n  --headless             Run Pi without the interactive UI\n  --watch                Refresh status every two seconds\n  --port 4317            Dashboard port (0 chooses a free port)\n  --no-open              Do not open the browser\n`;

function projectFrom(parsed) { return safeProjectRoot(parsed.flags.project ?? parsed.positional[1] ?? process.cwd()); }

function doctor(project) {
  const checks = [
    ["Node 22.19+", (() => { const [major, minor] = process.versions.node.split(".").map(Number); return major > 22 || (major === 22 && minor >= 19); })(), process.version],
    ["Pi CLI", commandExists("pi"), executablePath("pi") ?? "not found"],
    ["Proxy config", existsSync(join(configRoot, "config.json")), join(configRoot, "config.json")],
    ["Pi models", existsSync(join(agentRoot, "models.json")), join(agentRoot, "models.json")],
    ["Git project", existsSync(join(project, ".git")), project],
    ["PRD", existsSync(join(project, "PRD.md")), join(project, "PRD.md")]
  ];
  for (const [name, ok, detail] of checks) console.log(`${ok ? "✓" : "✗"} ${name.padEnd(14)} ${detail}`);
  return checks.every((item) => item[1]);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.positional[0] ?? "help";
  const project = projectFrom(parsed);
  if (["help", "--help", "-h"].includes(command)) { console.log(HELP); return; }
  if (command === "setup") {
    const result = await configure({ baseUrl: parsed.flags["api-url"], skipInstall: parsed.flags["skip-install"], skipVerify: parsed.flags["skip-verify"], skipExtensions: parsed.flags["skip-extensions"] });
    console.log(`\nReady. Discovered ${result.models} models.`);
    console.log(`Parent:   llm-proxy/${result.route.parent}\nWorker:   llm-proxy/${result.route.worker}\nReviewer: llm-proxy/${result.route.reviewer}\nImage:    ${result.route.image ? `llm-proxy/${result.route.image}` : "not available"}\nVideo:    ${result.route.video ? `llm-proxy/${result.route.video}` : "not available"}`);
    return;
  }
  if (command === "init") { const result = initializeProject(project); console.log(`Project prepared: ${result.root}\nEdit: ${result.prd}\nThen run: product-loop start ${JSON.stringify(result.root)}`); return; }
  if (command === "start") { await startLoop(project, { headless: parsed.flags.headless }); return; }
  if (command === "status") {
    const print = () => { console.clear(); console.log(formatState(projectState(project))); };
    print(); if (parsed.flags.watch) setInterval(print, 2000); return;
  }
  if (command === "validate") { const result = validateProject(project); console.log(result.stdout || result.stderr); process.exitCode = result.ok ? 0 : 1; return; }
  if (command === "logs") {
    const dir = join(project, ".loop", "logs");
    const names = existsSync(dir) ? readdirSync(dir).sort() : [];
    if (!names.length) console.log("No loop logs yet."); else console.log(tailText(join(dir, names.at(-1))));
    return;
  }
  if (command === "dashboard") {
    const { url } = await serveDashboard({ project, port: parsed.flags.port ?? 4317, open: !parsed.flags["no-open"] });
    console.log(`Product Loop monitor: ${url}\nProject: ${project}\nPress Ctrl+C to stop the monitor.`); return;
  }
  if (command === "models") {
    let catalog;
    try { catalog = (await refreshCatalog()).catalog; }
    catch (error) { catalog = readCatalog(); console.warn(`Refresh warning: ${error.message}`); }
    console.log(`Model catalog · ${catalog.count} models · ${catalog.refreshedAt ?? "never refreshed"}`);
    for (const kind of ["text", "image", "video", "audio"]) {
      const ids = catalog.byCapability[kind] ?? [];
      console.log(`\n${kind.toUpperCase()} (${ids.length})`);
      for (const id of ids) console.log(`  ${id}`);
    }
    return;
  }
  if (command === "media") {
    const kind = parsed.positional[1];
    const result = await generateMedia(kind, { prompt: parsed.flags.prompt, model: parsed.flags.model, output: parsed.flags.output, size: parsed.flags.size, duration: parsed.flags.duration });
    console.log(`${kind} generated with llm-proxy/${result.model}\nArtifact: ${result.artifact}${result.receipt ? `\nReceipt: ${result.receipt}` : ""}${result.pending ? "\nStatus: queued" : ""}`);
    return;
  }
  if (command === "doctor") { if (!doctor(project)) process.exitCode = 1; return; }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch((error) => { console.error(`\nProduct Loop error: ${error.message}`); process.exitCode = 1; });
