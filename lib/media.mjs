import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { readCatalog, proxyCredentials, refreshCatalog } from "./models.mjs";

function chooseModel(catalog, kind, requested) {
  const available = catalog.byCapability[kind] ?? [];
  if (requested && !available.includes(requested)) throw new Error(`${requested} is not currently advertised as a ${kind} model.`);
  const route = kind === "image" ? ["gpt-image-2", "gpt-image-1.5", "grok-imagine-image-quality", "grok-imagine-image", "gemini-3.1-flash-image"] : ["grok-imagine-video-1.5-preview", "grok-imagine-video"];
  return requested ?? route.find((id) => available.includes(id)) ?? available[0] ?? null;
}

function privateAddress(address) {
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80)/i.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

async function download(url, path, fetchImpl, trustedHost) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== trustedHost || parsed.username || parsed.password) throw new Error("Refused media download outside the configured proxy host.");
  const addresses = isIP(parsed.hostname) ? [{ address: parsed.hostname }] : await lookup(parsed.hostname, { all: true });
  if (addresses.some(({ address }) => privateAddress(address))) throw new Error("Refused media download resolving to a private address.");
  const response = await fetchImpl(url, { redirect: "error" });
  if (!response.ok) throw new Error(`Media download failed (${response.status}).`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}

function mediaCandidate(payload) {
  return payload?.data?.[0] ?? payload?.output?.[0] ?? payload?.result ?? payload;
}

function receiptPayload(payload, kind, artifact) {
  return { kind, artifact, generatedAt: new Date().toISOString(), id: payload?.id ?? null, status: payload?.status ?? "complete", model: payload?.model ?? null, created: payload?.created ?? null };
}

async function persistResult(payload, output, kind, fetchImpl, trustedHost) {
  const candidate = mediaCandidate(payload);
  const base64 = candidate?.b64_json ?? candidate?.b64 ?? candidate?.base64;
  const url = candidate?.url ?? candidate?.download_url ?? payload?.url ?? payload?.download_url;
  const extension = kind === "image" ? ".png" : ".mp4";
  const mediaPath = extname(output) ? output : `${output}${extension}`;
  mkdirSync(dirname(mediaPath), { recursive: true });
  if (base64) writeFileSync(mediaPath, Buffer.from(base64, "base64"));
  else if (url) await download(url, mediaPath, fetchImpl, trustedHost);
  else {
    const receipt = extname(output) === ".json" ? output : `${output}.json`;
    writeFileSync(receipt, `${JSON.stringify(receiptPayload(payload, kind, null), null, 2)}\n`);
    return { artifact: receipt, pending: Boolean(payload?.id), response: payload };
  }
  const receipt = `${mediaPath}.receipt.json`;
  writeFileSync(receipt, `${JSON.stringify(receiptPayload(payload, kind, mediaPath), null, 2)}\n`);
  return { artifact: mediaPath, receipt, pending: false };
}

export async function generateMedia(kind, options = {}) {
  if (!['image', 'video'].includes(kind)) throw new Error("Media kind must be image or video.");
  if (!options.prompt?.trim()) throw new Error("A non-empty --prompt is required.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const { apiKey, apiBase } = proxyCredentials(options);
  let catalog = readCatalog();
  if (!catalog.count || options.refresh !== false) catalog = (await refreshCatalog({ ...options, fetchImpl })).catalog;
  const model = chooseModel(catalog, kind, options.model);
  if (!model) throw new Error(`No ${kind} model is currently available from the proxy.`);
  const endpoint = kind === "image" ? "/images/generations" : "/videos/generations";
  const body = { model, prompt: options.prompt };
  if (options.size) body.size = options.size;
  if (options.duration) body.duration = Number(options.duration);
  const response = await fetchImpl(`${apiBase}${endpoint}`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let payload; try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 2000) }; }
  if (!response.ok) throw new Error(`${kind} generation failed (${response.status}): ${payload?.error?.message ?? payload?.error ?? "unknown error"}`);
  const defaultName = `${kind}-${Date.now()}`;
  const output = resolve(options.output ?? join(process.cwd(), "product", "assets", "generated", defaultName));
  return { kind, model, ...(await persistResult(payload, output, kind, fetchImpl, new URL(apiBase).hostname)) };
}
