import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { normalizeModels } from "../lib/setup.mjs";
import { catalogFromPayload, routeCatalog } from "../lib/models.mjs";
import { initializeProject, projectState } from "../lib/project.mjs";
import { createDashboard } from "../lib/dashboard.mjs";

test("normalizes common model registry shapes", () => {
  assert.deepEqual(normalizeModels({ data: [{ id: "one" }, { id: "two" }] }), ["one", "two"]);
  assert.deepEqual(normalizeModels({ models: ["three"] }), ["three"]);
});

test("separates live text, image, and video capabilities", () => {
  const catalog = catalogFromPayload({ data: [
    { id: "gpt-5.6-sol", owned_by: "openai" },
    { id: "gpt-image-2", owned_by: "openai" },
    { id: "grok-imagine-video", owned_by: "xai" }
  ] });
  assert.deepEqual(catalog.byCapability.text, ["gpt-5.6-sol"]);
  assert.deepEqual(catalog.byCapability.image, ["gpt-image-2"]);
  assert.deepEqual(catalog.byCapability.video, ["grok-imagine-video"]);
  assert.equal(routeCatalog(catalog).image, "gpt-image-2");
  assert.equal(routeCatalog(catalog).video, "grok-imagine-video");
});

test("initializes a portable product project", () => {
  const root = mkdtempSync(join(tmpdir(), "product-loop-project-"));
  initializeProject(root);
  assert.equal(existsSync(join(root, ".git")), true);
  assert.match(readFileSync(join(root, "PRD.md"), "utf8"), /Primary KPI/);
  assert.match(readFileSync(join(root, ".git", "info", "exclude"), "utf8"), /\.loop\//);
  assert.equal(projectState(root).worktrees, 1);
});

test("dashboard serves docs, state, and only allowlisted sources", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "product-loop-dashboard-"));
  initializeProject(root);
  const server = createDashboard({ project: root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const page = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.text());
  assert.match(page, /PRD in/);
  const state = await fetch(`http://127.0.0.1:${port}/api/state`).then((r) => r.json());
  assert.equal(state.summary.root, root);
  const denied = await fetch(`http://127.0.0.1:${port}/api/source?path=package.json`);
  assert.equal(denied.status, 500);
});

test("setup configures a clean HOME without leaking the API key", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "product-loop-home-"));
  const key = "dummy-test-key-never-print";
  let registryModels = [{ id: "gpt-5.6-sol" }, { id: "grok-4.5" }, { id: "claude-opus-4-8" }, { id: "gpt-image-2" }, { id: "grok-imagine-video" }];
  const registry = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/v1/models") response.end(JSON.stringify({ data: registryModels }));
    else if (request.url === "/v1/images/generations") response.end(JSON.stringify({ data: [{ b64_json: Buffer.from("fake-png").toString("base64") }] }));
    else { response.statusCode = 404; response.end(JSON.stringify({ error: "not found" })); }
  });
  await new Promise((resolve) => registry.listen(0, "127.0.0.1", resolve));
  t.after(() => registry.close());
  const baseUrl = `http://127.0.0.1:${registry.address().port}`;
  const cli = fileURLToPath(new URL("../bin/product-loop.mjs", import.meta.url));
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "setup", "--api-url", baseUrl, "--skip-install", "--skip-verify", "--skip-extensions"], {
      env: { ...process.env, HOME: home, SHELL: "/bin/zsh", LLM_PROXY_API_KEY: key }
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(`${result.stdout}${result.stderr}`.includes(key), false);
  const models = readFileSync(join(home, ".pi", "agent", "models.json"), "utf8");
  assert.match(models, /\$LLM_PROXY_API_KEY/);
  assert.equal(models.includes(key), false);
  const route = JSON.parse(readFileSync(join(home, ".config", "product-loop", "model-route.json"), "utf8"));
  assert.equal(route.parent, "gpt-5.6-sol");
  assert.equal(route.worker, "grok-4.5");
  assert.equal(route.reviewer, "claude-opus-4-8");
  assert.equal(route.image, "gpt-image-2");
  assert.equal(route.video, "grok-imagine-video");
  assert.equal(models.includes("gpt-image-2"), false, "pure media models must not be registered as Pi chat models");

  const output = join(home, "generated", "hero");
  const media = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "media", "image", "--prompt", "A test hero", "--output", output], {
      env: { ...process.env, HOME: home, SHELL: "/bin/zsh" }
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(media.status, 0, media.stderr);
  assert.equal(existsSync(`${output}.png`), true);
  assert.equal(`${media.stdout}${media.stderr}`.includes(key), false);

  registryModels = [{ id: "gpt-5.6-sol" }, { id: "gpt-image-1.5" }];
  const refresh = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "models"], { env: { ...process.env, HOME: home, SHELL: "/bin/zsh" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(refresh.status, 0, refresh.stderr);
  const refreshedRoute = JSON.parse(readFileSync(join(home, ".config", "product-loop", "model-route.json"), "utf8"));
  const refreshedPiModels = readFileSync(join(home, ".pi", "agent", "models.json"), "utf8");
  assert.equal(refreshedRoute.video, null);
  assert.equal(refreshedRoute.image, "gpt-image-1.5");
  assert.equal(refreshedPiModels.includes("grok-4.5"), false, "removed models must leave Pi routing on refresh");
  assert.equal(refreshedPiModels.includes("gpt-image-1.5"), false, "pure media models stay outside Pi chat routing");
});
