import { createServer } from "node:http";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { packageRoot, readJson, run, safeProjectRoot, tailText } from "./shared.mjs";
import { projectState, validateProject } from "./project.mjs";
import { readCatalog, refreshCatalog } from "./models.mjs";

const docsRoot = join(packageRoot, "docs");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
const descriptions = {
  "product-loop/SKILL.md": "The orchestration constitution Pi loads: gates, phases, delegation, review, and stop rules.",
  "product-loop/assets/pi/autonomous-run-prompt.md": "The kickoff prompt that turns a PRD into a persistent autonomous run.",
  "product-loop/assets/pi/run-state.schema.json": "The machine-readable contract for live project state.",
  "product-loop/references/worktrees.md": "Isolation, comparison, and merge rules for parallel agents.",
  "product-loop/references/media-generation.md": "Live media-model discovery, asset contracts, generation commands, and in-context review gates.",
  "lib/models.mjs": "Capability-aware live proxy catalog and dynamic text/image/video routing.",
  "lib/media.mjs": "Direct image/video generation with local credential use and provenance receipts.",
  "lib/setup.mjs": "Secure VM setup: proxy discovery, Pi config, model routing, backups, and extensions.",
  "lib/project.mjs": "Project initialization, launch, state validation, and status summaries.",
  "lib/dashboard.mjs": "This local, read-only monitoring server.",
  "bin/product-loop.mjs": "The portable command-line entry point.",
  "scripts/install.sh": "One-command bootstrap for a fresh Linux or macOS machine."
};

function json(response, value, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(value));
}

function collectStatuses(root, output = [], depth = 0) {
  if (!existsSync(root) || depth > 5) return output;
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return output;
  const canonicalRoot = realpathSync(root);
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    let stat; try { stat = lstatSync(path); } catch { continue; }
    if (stat.isSymbolicLink()) continue;
    const canonical = realpathSync(path);
    if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}/`)) continue;
    if (stat.isDirectory()) collectStatuses(path, output, depth + 1);
    else if (stat.isFile() && name === "status.json") {
      const value = readJson(path, null);
      if (value) output.push({ path, ...value });
    }
  }
  return output.slice(-100);
}

function catalog() {
  return Object.entries(descriptions).map(([path, description]) => ({ path, description, exists: existsSync(join(packageRoot, path)) }));
}

function source(path) {
  const allowed = catalog().map((item) => item.path);
  if (!allowed.includes(path)) throw new Error("That file is not in the public documentation catalog.");
  return readFileSync(join(packageRoot, path), "utf8");
}

function snapshot(project) {
  const summary = projectState(project);
  const validation = summary.state ? validateProject(project) : { ok: null, stdout: "Run has not started.", stderr: "" };
  const git = run("git", ["status", "--short"], { cwd: project, allowFailure: true }).stdout?.trim() ?? "";
  const logsDir = join(project, ".loop", "logs");
  const projectReal = realpathSync(project);
  const safeLogs = existsSync(logsDir) && !lstatSync(logsDir).isSymbolicLink() && realpathSync(logsDir).startsWith(`${projectReal}/`);
  const logs = safeLogs ? readdirSync(logsDir).sort().slice(-8).flatMap((name) => { const path = join(logsDir, name); const stat = lstatSync(path); return stat.isFile() && !stat.isSymbolicLink() && realpathSync(path).startsWith(`${projectReal}/`) ? [{ name, text: tailText(path, 12_000) }] : []; }) : [];
  return { generatedAt: new Date().toISOString(), summary, validation, git, agents: collectStatuses(join(project, ".pi-subagents")), logs };
}

export function createDashboard({ project = process.cwd() } = {}) {
  project = safeProjectRoot(project);
  return createServer((request, response) => {
    try {
      const host = request.headers.host ?? "";
      const allowedHost = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
      const origin = request.headers.origin;
      if (!allowedHost || (origin && origin !== `http://${host}`)) return json(response, { error: "Forbidden host or origin" }, 403);
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/api/state") return json(response, snapshot(project));
      if (url.pathname === "/api/catalog") return json(response, catalog());
      if (url.pathname === "/api/models") return json(response, readCatalog());
      if (url.pathname === "/api/source") return json(response, { path: url.searchParams.get("path"), content: source(url.searchParams.get("path")) });
      if (url.pathname === "/api/meta") return json(response, { project, packageRoot, version: readJson(join(packageRoot, "package.json"), {}).version });
      const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = resolve(docsRoot, normalize(requested));
      if (!file.startsWith(`${docsRoot}/`) && file !== join(docsRoot, "index.html")) return json(response, { error: "Not found" }, 404);
      if (!existsSync(file) || statSync(file).isDirectory()) return json(response, { error: "Not found" }, 404);
      response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(readFileSync(file));
    } catch (error) { json(response, { error: error.message }, 500); }
  });
}

export async function serveDashboard(options = {}) {
  try { await refreshCatalog(); } catch { /* Show the last known catalog when offline. */ }
  const server = createDashboard(options);
  const host = "127.0.0.1";
  const port = Number(options.port ?? 4317);
  await new Promise((resolvePromise, reject) => { server.once("error", reject); server.listen(port, host, resolvePromise); });
  const address = server.address();
  const url = `http://${host}:${address.port}`;
  if (options.open !== false) {
    const opener = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", url]] : ["xdg-open", [url]];
    run(opener[0], opener[1], { allowFailure: true, stdio: "ignore" });
  }
  return { server, url };
}
