import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentRoot, backup, configRoot, findModel, readJson, skillRoot, stripTrailingSlash, writeJson } from "./shared.mjs";

export const MODEL_PREFS = {
  parent: ["gpt-5.6-sol", "claude-fable-5", "claude-opus-4-8", "gpt-5.4"],
  worker: ["grok-4.5", "gpt-5.4-mini", "claude-sonnet-5", "claude-sonnet-4-6"],
  reviewer: ["claude-opus-4-8", "claude-fable-5", "claude-opus-4-7", "gpt-5.4"],
  image: ["gpt-image-2", "gpt-image-1.5", "grok-imagine-image-quality", "grok-imagine-image", "gemini-3.1-flash-image"],
  video: ["grok-imagine-video-1.5-preview", "grok-imagine-video"]
};

function rawModels(payload) {
  return Array.isArray(payload) ? payload : payload?.data ?? payload?.models ?? [];
}

export function modelId(item) {
  return typeof item === "string" ? item : item?.id ?? item?.name;
}

function explicitCapabilities(item) {
  if (!item || typeof item !== "object") return [];
  const value = [item.capabilities, item.modalities, item.input_modalities, item.output_modalities, item.type]
    .flatMap((entry) => Array.isArray(entry) ? entry : entry && typeof entry === "object" ? Object.keys(entry).filter((key) => entry[key]) : entry ? [entry] : [])
    .map((entry) => String(entry).toLowerCase());
  return [...new Set(value.flatMap((entry) => ["text", "image", "video", "audio"].filter((kind) => entry.includes(kind))))];
}

export function classifyModel(item) {
  const id = modelId(item);
  if (!id) return null;
  const explicit = explicitCapabilities(item);
  let capabilities = explicit;
  let classification = explicit.length ? "registry" : "name-fallback";
  if (!capabilities.length) {
    const lower = id.toLowerCase();
    if (/(^|[-_.])(video|veo)([-_.]|$)/.test(lower)) capabilities = ["video"];
    else if (/(^|[-_.])(image|imagen)([-_.]|$)/.test(lower)) capabilities = ["image"];
    else capabilities = ["text"];
  }
  return {
    id,
    provider: typeof item === "object" ? item.owned_by ?? item.provider ?? "unknown" : "unknown",
    created: typeof item === "object" ? item.created ?? null : null,
    capabilities,
    classification
  };
}

export function catalogFromPayload(payload, baseUrl = "") {
  const seen = new Set();
  const models = rawModels(payload).map(classifyModel).filter((item) => item && !seen.has(item.id) && seen.add(item.id));
  const byCapability = Object.fromEntries(["text", "image", "video", "audio"].map((kind) => [kind, models.filter((model) => model.capabilities.includes(kind)).map((model) => model.id)]));
  return { baseUrl, refreshedAt: new Date().toISOString(), count: models.length, models, byCapability };
}

export function parseStoredEnvironment() {
  const path = join(configRoot, "env");
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^export\s+([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replaceAll("'\\''", "'");
    values[match[1]] = value;
  }
  return values;
}

export function proxyCredentials(options = {}) {
  const stored = parseStoredEnvironment();
  const config = readJson(join(configRoot, "config.json"), {});
  const baseUrl = stripTrailingSlash(options.baseUrl ?? process.env.LLM_PROXY_BASE_URL ?? stored.LLM_PROXY_BASE_URL ?? config.baseUrl ?? "");
  const apiKey = options.apiKey ?? process.env.LLM_PROXY_API_KEY ?? stored.LLM_PROXY_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("LLM proxy is not configured. Run product-loop setup.");
  const parsed = new URL(baseUrl);
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) throw new Error("LLM proxy URL must use HTTPS; HTTP is allowed only for loopback development.");
  return { baseUrl, apiKey, apiBase: baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1` };
}

export async function discoverCatalog(options = {}) {
  const { baseUrl, apiKey, apiBase } = proxyCredentials(options);
  const response = await (options.fetchImpl ?? fetch)(`${apiBase}/models`, { headers: { authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`Model discovery failed (${response.status}).`);
  return catalogFromPayload(await response.json(), baseUrl);
}

export function routeCatalog(catalog) {
  const text = catalog.byCapability.text;
  return {
    provider: "llm-proxy",
    parent: findModel(text, MODEL_PREFS.parent),
    worker: findModel(text, MODEL_PREFS.worker),
    reviewer: findModel(text, MODEL_PREFS.reviewer),
    image: findModel(catalog.byCapability.image, MODEL_PREFS.image),
    video: findModel(catalog.byCapability.video, MODEL_PREFS.video),
    configuredAt: catalog.refreshedAt
  };
}

export function piModelDefinition(id) {
  return { id, name: `LLM Proxy · ${id}`, reasoning: false, input: ["text"], contextWindow: 200000, maxTokens: 64000, compat: { supportsDeveloperRole: false, supportsReasoningEffort: false } };
}

export function projectSettingsForRoute(route) {
  const settings = readJson(join(skillRoot, "assets", "pi", "settings.json"), {});
  const overrides = settings.subagents?.agentOverrides ?? {};
  for (const [name, value] of Object.entries(overrides)) {
    const selected = ["reviewer", "oracle"].includes(name) ? route.reviewer : ["planner", "context-builder"].includes(name) ? route.parent : route.worker;
    value.model = `llm-proxy/${selected}`;
    value.fallbackModels = [...new Set([route.parent, route.reviewer, route.worker].filter((id) => id && id !== selected).map((id) => `llm-proxy/${id}`))];
  }
  return settings;
}

export function reconcilePiModels(catalog, credentials, route) {
  const modelsPath = join(agentRoot, "models.json");
  const settingsPath = join(agentRoot, "settings.json");
  const models = readJson(modelsPath, { providers: {} });
  models.providers ??= {};
  models.providers["llm-proxy"] = { baseUrl: credentials.apiBase, apiKey: "$LLM_PROXY_API_KEY", api: "openai-completions", models: catalog.byCapability.text.map(piModelDefinition) };
  const serialized = `${JSON.stringify(models, null, 2)}\n`;
  const current = existsSync(modelsPath) ? readFileSync(modelsPath, "utf8") : "";
  if (serialized !== current) { backup(modelsPath); writeJson(modelsPath, models); }
  const settings = readJson(settingsPath, {});
  if (settings.defaultProvider === "llm-proxy" && !catalog.byCapability.text.includes(settings.defaultModel)) {
    backup(settingsPath); settings.defaultModel = route.parent; writeJson(settingsPath, settings);
  }
}

export async function refreshCatalog(options = {}) {
  const credentials = proxyCredentials(options);
  const catalog = await discoverCatalog({ ...options, ...credentials });
  const route = routeCatalog(catalog);
  writeJson(join(configRoot, "models.json"), catalog);
  writeJson(join(configRoot, "model-route.json"), { ...route, discovered: catalog.models.map((model) => model.id) });
  if (options.reconcilePi !== false) reconcilePiModels(catalog, credentials, route);
  writeJson(join(configRoot, "project-settings.json"), projectSettingsForRoute(route));
  return { catalog, route };
}

export function readCatalog() {
  return readJson(join(configRoot, "models.json"), { refreshedAt: null, count: 0, models: [], byCapability: { text: [], image: [], video: [], audio: [] } });
}
