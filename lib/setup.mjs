import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  agentRoot, atomicWrite, backup, commandExists, configRoot, ensureDir,
  readJson, run, shellQuote, skillRoot, stripTrailingSlash, writeJson
} from "./shared.mjs";
import { catalogFromPayload, piModelDefinition, projectSettingsForRoute, proxyCredentials, routeCatalog } from "./models.mjs";

export function normalizeModels(payload) {
  return catalogFromPayload(payload).models.map((model) => model.id);
}

async function hiddenQuestion(label) {
  if (!stdin.isTTY) throw new Error(`${label} is required through LLM_PROXY_API_KEY in non-interactive mode.`);
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return await new Promise((resolve, reject) => {
    const onData = (buffer) => {
      const character = buffer.toString("utf8");
      if (character === "\u0003") { cleanup(); reject(new Error("Setup cancelled.")); return; }
      if (character === "\r" || character === "\n") { cleanup(); stdout.write("\n"); resolve(value); return; }
      if (character === "\u007f") value = value.slice(0, -1);
      else value += character;
    };
    const cleanup = () => { stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); };
    stdin.on("data", onData);
  });
}

async function collectInputs(options) {
  let baseUrl = options.baseUrl ?? process.env.LLM_PROXY_BASE_URL;
  let apiKey = process.env.LLM_PROXY_API_KEY;
  const rl = createInterface({ input: stdin, output: stdout });
  if (!baseUrl) baseUrl = await rl.question("LLM API base URL: ");
  rl.close();
  if (!apiKey) apiKey = await hiddenQuestion("LLM API key (hidden): ");
  if (!baseUrl || !apiKey) throw new Error("Both API URL and API key are required.");
  return { baseUrl: stripTrailingSlash(baseUrl), apiKey };
}

function persistEnvironment(baseUrl, apiKey) {
  ensureDir(configRoot);
  const envPath = join(configRoot, "env");
  atomicWrite(envPath, `export LLM_PROXY_BASE_URL=${shellQuote(baseUrl)}\nexport LLM_PROXY_API_KEY=${shellQuote(apiKey)}\n`, 0o600);
  return envPath;
}

export async function configure(options = {}) {
  const { baseUrl, apiKey } = await collectInputs(options);
  const { apiBase } = proxyCredentials({ baseUrl, apiKey });
  const response = await fetch(`${apiBase}/models`, { headers: { authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`Model discovery failed (${response.status}). Check the URL and key.`);
  const catalog = catalogFromPayload(await response.json(), baseUrl);
  if (!catalog.count) throw new Error("The model registry returned no model IDs.");
  const ids = catalog.byCapability.text;
  if (!ids.length) throw new Error("The registry returned no text-capable models for Pi.");

  if (!commandExists("pi") && !options.skipInstall) {
    run("npm", ["install", "-g", "@earendil-works/pi-coding-agent@0.80.6"], { stdio: "inherit" });
  }
  if (!commandExists("pi") && !options.skipInstall) throw new Error("Pi did not become available on PATH.");

  ensureDir(agentRoot);
  const modelsPath = join(agentRoot, "models.json");
  const settingsPath = join(agentRoot, "settings.json");
  backup(modelsPath); backup(settingsPath);
  const models = readJson(modelsPath, { providers: {} });
  models.providers ??= {};
  models.providers["llm-proxy"] = {
    baseUrl: apiBase, apiKey: "$LLM_PROXY_API_KEY", api: "openai-completions",
    models: ids.map(piModelDefinition)
  };
  writeJson(modelsPath, models);

  const route = { ...routeCatalog(catalog), discovered: catalog.models.map((model) => model.id) };
  const { parent, worker, reviewer } = route;
  const settings = readJson(settingsPath, {});
  settings.defaultProvider = "llm-proxy";
  if (!ids.includes(settings.defaultModel)) settings.defaultModel = parent;
  writeJson(settingsPath, settings);
  const envPath = persistEnvironment(baseUrl, apiKey);
  writeJson(join(configRoot, "config.json"), { baseUrl, provider: "llm-proxy", configuredAt: route.configuredAt });
  const projectSettings = projectSettingsForRoute(route);
  writeJson(join(configRoot, "project-settings.json"), projectSettings);
  writeJson(join(configRoot, "models.json"), catalog);
  writeJson(join(configRoot, "model-route.json"), route);

  const agentsDir = join(agentRoot, "agents");
  ensureDir(agentsDir);
  const evaluator = readFileSync(join(skillRoot, "assets", "pi", "agents", "blind-evaluator.md"), "utf8");
  backup(join(agentsDir, "blind-evaluator.md"));
  atomicWrite(join(agentsDir, "blind-evaluator.md"), evaluator, 0o600);

  if (!options.skipExtensions && commandExists("pi")) {
    const listed = run("pi", ["list"], { allowFailure: true }).stdout ?? "";
    if (!listed.includes("pi-subagents")) run("pi", ["install", "npm:pi-subagents@0.34.0"], { stdio: "inherit" });
  }
  if (!options.skipVerify && commandExists("pi")) {
    run("pi", ["--list-models", "llm-proxy"], { stdio: "inherit" });
  }
  return { baseUrl, envPath, models: catalog.count, catalog, route };
}
