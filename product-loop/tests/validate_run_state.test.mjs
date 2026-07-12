import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, "..");
const validator = join(skillRoot, "scripts", "validate-run-state.mjs");
const template = JSON.parse(readFileSync(join(skillRoot, "assets", "pi", "run-state.json"), "utf8"));
const contractPaths = [
  "product/run-contract.md",
  "product/00-brief.md",
  "product/01-prd.md",
  "product/02-tech-spec.md",
  "product/03-ux-flow.md",
  "product/04-roadmap.md",
  "product/observation/monitor-contract.md",
  "product/phases/P1-contract.md"
];
const contractRepo = mkdtempSync(join(tmpdir(), "product-loop-contract-"));
mkdirSync(join(contractRepo, "product", "phases"), { recursive: true });
mkdirSync(join(contractRepo, "product", "observation"), { recursive: true });
const contractRoles = ["brief", "prd", "tech_spec", "ux", "roadmap", "observation_monitor", "first_phase"];
const manifestRows = contractPaths
  .filter((path) => path !== "product/run-contract.md")
  .map((path, index) => `| \`${contractRoles[index]}\` | \`${path}\` | 1.0 | test |`)
  .join("\n");
writeFileSync(join(contractRepo, "product", "run-contract.md"), `---\nstatus: APPROVED\nversion: "1.0"\nexecution_mode: autonomous\n---\n\n# Immutable autonomous run contract\n\n## Frozen artifact set\n\n| Role | Path | Version | Purpose |\n|---|---|---|---|\n${manifestRows}\n\n## Contract verification\n`);
const approvedFrontmatter = (extra = "") => `---\nstatus: APPROVED\nversion: "1.0"\n${extra}---\n\n`;
const artifactContents = {
  "product/00-brief.md": `${approvedFrontmatter("execution_mode: autonomous\ncontract_version: \"1.0\"\n")}# Product brief\n\n## Success contract\n\n| ID | Measure or binary condition | Baseline | Target | Window | Data source | Owner |\n|---|---|---|---|---|---|---|\n| KPI-1 | app completes the primary journey | not available before build | pass | immediate acceptance | acceptance test | product owner |\n\n## Guardrails\n\n| ID | Must not regress | Threshold | Measurement |\n|---|---|---|---|\n| G-1 | regression suite | all pass | test report |\n`,
  "product/01-prd.md": `${approvedFrontmatter()}# Product requirements document\n\n## 7. Acceptance traceability\n\n| Acceptance ID | Requirement IDs | Priority | Type | Frozen exact check or named rubric | Environment | Evidence path |\n|---|---|---|---|---|---|---|\n| AC-1 | FR-1 | Must | DETERMINISTIC | node --test | test | evidence/test.log |\n`,
  "product/02-tech-spec.md": `${approvedFrontmatter("prd_version: \"1.0\"\n")}# Technical specification\n\n## Decision summary\n\nUse the existing runtime and one local implementation.\n`,
  "product/03-ux-flow.md": `${approvedFrontmatter("prd_version: \"1.0\"\n")}# UX flow\n\n## Journey\n\nThe user starts, completes the primary action, and sees success or a recoverable error.\n`,
  "product/04-roadmap.md": `${approvedFrontmatter("prd_version: \"1.0\"\n")}# Vertical-slice roadmap\n\n## Phases\n\n| Phase | Demonstrable user/system outcome | PRD IDs | Depends on | Mandatory gates | Rollback | Status |\n|---|---|---|---|---|---|---|\n| P1 | primary journey works end to end | FR-1 AC-1 | none | node --test | revert integration commit | APPROVED |\n`,
  "product/observation/monitor-contract.md": `${approvedFrontmatter("contract_version: \"1.0\"\n")}# Observation monitor contract\n\n## Outcome measurements\n\n| KPI / guardrail ID | Kind | Exact formula | Baseline | Comparator | Target | Window | Data source | Evidence |\n|---|---|---|---|---|---|---|---|---|\n| KPI-1 | PRIMARY | acceptance pass rate | none | EQ | pass | 2026-07-17T12:00:00Z | test report | .loop/observation/kpi-result.json |\n| G-1 | GUARDRAIL | regression failures | zero | EQ | zero | 2026-07-17T12:00:00Z | test report | .loop/observation/regression-result.json |\n`,
  "product/phases/P1-contract.md": `${approvedFrontmatter("phase_id: \"P1\"\n")}# Phase P1: primary journey\n\n## Gate contract\n\n| Gate | Acceptance IDs | Type | Exact command/scenario/rubric | Expected |\n|---|---|---|---|---|\n| Acceptance | AC-1 | DETERMINISTIC | node --test | exit 0 |\n`
};
for (const [path, content] of Object.entries(artifactContents)) writeFileSync(join(contractRepo, path), content);
execFileSync("git", ["init", "-q"], { cwd: contractRepo });
execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: contractRepo });
execFileSync("git", ["config", "user.name", "Product Loop Test"], { cwd: contractRepo });
execFileSync("git", ["add", "product"], { cwd: contractRepo });
execFileSync("git", ["commit", "-qm", "frozen contract"], { cwd: contractRepo });
const fullSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: contractRepo, encoding: "utf8" }).trim();
const contractBranch = execFileSync("git", ["branch", "--show-current"], { cwd: contractRepo, encoding: "utf8" }).trim();
const candidateBranch = "candidate-test-worktree";
const candidateWorktreeRoot = mkdtempSync(join(tmpdir(), "product-loop-worktrees-"));
const candidateWorktree = join(candidateWorktreeRoot, "candidate");
execFileSync("git", ["worktree", "add", "-q", "-b", candidateBranch, candidateWorktree, fullSha], { cwd: contractRepo });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createCommit(message, parent = fullSha) {
  return execFileSync("git", ["commit-tree", `${parent}^{tree}`, "-p", parent, "-m", message], { cwd: contractRepo, encoding: "utf8" }).trim();
}

function createCommitWithPaths(message, changes, parent = fullSha) {
  const indexDirectory = mkdtempSync(join(tmpdir(), "product-loop-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(indexDirectory, "index") };
  execFileSync("git", ["read-tree", parent], { cwd: contractRepo, env });
  for (const [path, content] of Object.entries(changes)) {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: contractRepo, env, input: content, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "--add", "--cacheinfo", "100644", blob, path], { cwd: contractRepo, env });
  }
  const tree = execFileSync("git", ["write-tree"], { cwd: contractRepo, env, encoding: "utf8" }).trim();
  return execFileSync("git", ["commit-tree", tree, "-p", parent, "-m", message], { cwd: contractRepo, encoding: "utf8" }).trim();
}

function pointBranch(branch, sha) {
  execFileSync("git", ["branch", "-f", branch, sha], { cwd: contractRepo });
}

function deleteBranch(branch) {
  execFileSync("git", ["branch", "-D", branch], { cwd: contractRepo, stdio: "ignore" });
}

function writeState(directory, name, value) {
  const path = join(directory, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function materializeSelectionEvidence(state, repo) {
  for (const selection of state.selections ?? []) {
    const evaluator = state.children?.find((child) => child.run_id === selection.evaluator_run_id);
    if (!evaluator || !selection.evidence || selection.evidence.startsWith("/")) continue;
    const evidencePath = join(repo, selection.evidence);
    const manifestPath = join(dirname(evidencePath), "manifest.json");
    const manifest = `${JSON.stringify({ phase_id: selection.phase_id, candidate_shas: selection.candidate_shas, selected_sha: selection.selected_sha }, null, 2)}\n`;
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, manifest);
    selection.input_manifest_sha = sha256(manifest);

    if (!evaluator.artifact || evaluator.artifact.startsWith("/")) continue;
    const artifactPath = join(repo, evaluator.artifact);
    const metadata = `${JSON.stringify({ runId: evaluator.run_id, agent: evaluator.agent, exitCode: 0, model: evaluator.final_model, attemptedModels: evaluator.attempted_models }, null, 2)}\n`;
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, metadata);
    writeFileSync(evidencePath, `${JSON.stringify({ phase_id: selection.phase_id, evaluator_run_id: selection.evaluator_run_id, candidate_shas: selection.candidate_shas, selected_sha: selection.selected_sha, input_manifest_sha: selection.input_manifest_sha, evaluator_artifact: evaluator.artifact, evaluator_artifact_sha256: sha256(metadata) }, null, 2)}\n`);
  }
}

function materializeOutcomeEvidence(state, repo) {
  if (state.observation?.release_evidence && !state.observation.release_evidence.startsWith("/")) {
    const releasePath = join(repo, state.observation.release_evidence);
    const release = `---\nstatus: RELEASED\nrelease_sha: "${state.integration?.sha ?? ""}"\nenvironment: "test"\ncontract_commit: "${state.contract?.commit ?? ""}"\nreleased_at: "2026-07-10T12:00:00Z"\noutcome_status: OBSERVING\n---\n\n# Release evidence\n`;
    mkdirSync(dirname(releasePath), { recursive: true });
    writeFileSync(releasePath, release);
    state.observation.release_evidence_sha256 = sha256(release);
  }
  for (const measurement of state.observation?.measurements ?? []) {
    let evidence = "";
    if (measurement.evidence && !measurement.evidence.startsWith("/")) {
      const evidencePath = join(repo, measurement.evidence);
      evidence = `${JSON.stringify({ id: measurement.id, target: measurement.target, actual: measurement.actual, passed: measurement.passed })}\n`;
      mkdirSync(dirname(evidencePath), { recursive: true });
      writeFileSync(evidencePath, evidence);
    }
    if (measurement.source_artifact && !measurement.source_artifact.startsWith("/")) {
      const sourcePath = join(repo, measurement.source_artifact);
      const source = `${JSON.stringify({ id: measurement.id, actual: measurement.actual, measured_at: measurement.measured_at, contract_commit: state.contract?.commit ?? "", integration_sha: state.integration?.sha ?? "", evidence_sha256: sha256(evidence) })}\n`;
      mkdirSync(dirname(sourcePath), { recursive: true });
      writeFileSync(sourcePath, source);
      measurement.source_sha256 = sha256(source);
    }
  }
}

function run(next, previous, { archivePrevious = false, archiveValue = previous, repo = contractRepo, materializeSelections = true, materializeOutcomes = true } = {}) {
  if (materializeSelections) {
    materializeSelectionEvidence(next, repo);
    if (previous) materializeSelectionEvidence(previous, repo);
  }
  if (materializeOutcomes) {
    materializeOutcomeEvidence(next, repo);
    if (previous) materializeOutcomeEvidence(previous, repo);
  }
  const directory = mkdtempSync(join(tmpdir(), "product-loop-state-"));
  const args = [validator, writeState(directory, "next.json", next)];
  if (previous) {
    args.push(writeState(directory, "previous.json", previous));
    if (archivePrevious) {
      mkdirSync(join(directory, "runs"), { recursive: true });
      writeState(join(directory, "runs"), `${previous.run_id}.json`, archiveValue);
    }
  }
  args.push("--repo", repo);
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}

function createVariantContractRepo({ briefStatus = "APPROVED", secondPhase = false } = {}) {
  const repo = mkdtempSync(join(tmpdir(), "product-loop-variant-"));
  mkdirSync(join(repo, "product", "phases"), { recursive: true });
  mkdirSync(join(repo, "product", "observation"), { recursive: true });
  const rows = contractPaths.slice(1).map((path, index) => `| \`${contractRoles[index]}\` | \`${path}\` | 1.0 | test |`).join("\n");
  writeFileSync(join(repo, "product", "run-contract.md"), `---\nstatus: APPROVED\nversion: "1.0"\nexecution_mode: autonomous\n---\n\n# Contract\n\n## Frozen artifact set\n\n| Role | Path | Version | Purpose |\n|---|---|---|---|\n${rows}\n`);
  for (const [path, original] of Object.entries(artifactContents)) {
    let content = original;
    if (path === "product/00-brief.md" && briefStatus !== "APPROVED") content = content.replace("status: APPROVED", `status: ${briefStatus}`);
    if (path === "product/04-roadmap.md" && secondPhase) content += "| P2 | release hardening complete | FR-1 AC-1 | P1 | node --test | revert integration commit | APPROVED |\n";
    writeFileSync(join(repo, path), content);
  }
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Product Loop Test"], { cwd: repo });
  execFileSync("git", ["add", "product"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "variant contract"], { cwd: repo });
  return {
    repo,
    sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
    branch: execFileSync("git", ["branch", "--show-current"], { cwd: repo, encoding: "utf8" }).trim()
  };
}

function readyState() {
  const state = clone(template);
  state.run_id = "run-1";
  state.parent_run_id = "";
  state.lifecycle = "READY";
  state.contract.version = "1.0";
  state.contract.commit = fullSha;
  state.contract.paths = [...contractPaths];
  state.contract.verified_at = "2026-07-10T12:00:00Z";
  state.global_budget.wall_clock_limit_seconds = 3600;
  state.global_budget.turn_limit = 100;
  state.global_budget.consecutive_no_progress_limit = 3;
  state.next_action = "start kickoff";
  return state;
}

function runningPhaseState() {
  const state = readyState();
  state.lifecycle = "RUNNING";
  state.started_at = "2026-07-10T12:01:00Z";
  state.active_phase = {
    id: "P1",
    status: "RUNNING",
    contract_path: "product/phases/P1-contract.md",
    contract_commit: fullSha,
    evidence_path: "product/phases/P1-evidence.md",
    started_at: "2026-07-10T12:01:00Z",
    wall_clock_limit_seconds: 3600,
    turn_limit: 100,
    elapsed_seconds: 10,
    turns_used: 1
  };
  return state;
}

function completedPhaseState() {
  const state = runningPhaseState();
  state.active_phase.status = "VERIFIED";
  state.candidates.push({ phase_id: "P1", id: "A", worktree: "/tmp/removed-completed-a", branch: candidateBranch, base_sha: fullSha, head_sha: fullSha, owner: "worker-a", producer_run_id: "worker-completed", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], status: "INTEGRATED", evidence: ".loop/evaluation/P1/A.md" });
  state.children.push({ phase_id: "P1", run_id: "worker-completed", agent: "worker", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], cwd: "/tmp/removed-completed-a", status: "COMPLETE", started_at: "2026-07-10T11:00:00Z", completed_at: "2026-07-10T11:10:00Z", artifact: ".pi-subagents/artifacts/worker-completed_meta.json" });
  state.children.push({ phase_id: "P1", run_id: "judge-completed", agent: "blind-evaluator", requested_model: "llm-proxy/claude-opus-4-8", final_model: "llm-proxy/claude-opus-4-8:high", attempted_models: ["llm-proxy/claude-opus-4-8:high"], cwd: "/tmp/blind-completed", status: "COMPLETE", started_at: "2026-07-10T11:15:00Z", completed_at: "2026-07-10T11:20:00Z", artifact: ".pi-subagents/artifacts/judge-completed_meta.json" });
  state.selections.push({ phase_id: "P1", evaluator_run_id: "judge-completed", candidate_shas: [fullSha], selected_sha: fullSha, input_manifest_sha: "e".repeat(64), evidence: ".loop/evaluation/P1/selection.json", at: "2026-07-10T11:21:00Z" });
  state.integration = { branch: contractBranch, sha: fullSha, verified_at: "2026-07-10T11:30:00Z" };
  state.last_verified_gate = { name: "integrated release gate", tested_sha: fullSha, result: "PASS", evidence: ".loop/gates/P1-final.log", verified_at: "2026-07-10T11:31:00Z" };
  state.checkpoints.push({ at: "2026-07-10T11:32:00Z", phase: "P1", step: "phase verified", integration_sha: fullSha, evidence: [".loop/gates/P1-final.log"], next_action: "release" });
  return state;
}

function completeObservation(state) {
  state.observation = {
    status: "COMPLETE",
    window_ends_at: "2026-07-17T12:00:00Z",
    next_check_at: "",
    monitor_id: "monitor-1",
    release_evidence: ".loop/release-evidence.md",
    release_evidence_sha256: "",
    measurements: [
      { id: "KPI-1", kind: "PRIMARY", formula: "acceptance pass rate", comparator: "EQ", target: "pass", actual: "miss", passed: false, window_ends_at: "2026-07-17T12:00:00Z", source: "test report", source_artifact: ".loop/observation/kpi-source.json", source_sha256: "", measured_at: "2026-07-17T12:00:00Z", evidence: ".loop/observation/kpi-result.json" },
      { id: "G-1", kind: "GUARDRAIL", formula: "regression failures", comparator: "EQ", target: "zero", actual: "zero", passed: true, window_ends_at: "2026-07-17T12:00:00Z", source: "test report", source_artifact: ".loop/observation/regression-source.json", source_sha256: "", measured_at: "2026-07-17T12:00:00Z", evidence: ".loop/observation/regression-result.json" }
    ],
    evidence: ["kpi-report.json"]
  };
  return state;
}

test("accepts the untouched PREFLIGHT template", () => {
  const result = run(template);
  assert.equal(result.status, 0, result.stderr);
});

test("rejects READY without an immutable contract identity and budgets", () => {
  const state = clone(template);
  state.lifecycle = "READY";
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /READY requires contract\.commit/);
});

test("rejects READY when contract paths omit the manifest itself", () => {
  const state = readyState();
  state.contract.paths = ["product/00-brief.md", "product/phases/P1-contract.md"];
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contract\.paths must include contract\.manifest_path/);
});

test("rejects READY when contract paths do not exactly match the committed manifest", () => {
  const state = readyState();
  state.contract.paths = ["product/run-contract.md", "product/00-brief.md", "product/phases/P1-contract.md"];
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contract\.paths must exactly match the committed manifest/);
});

test("binds state contract version and execution mode to committed manifest frontmatter", () => {
  const wrongVersion = readyState();
  wrongVersion.contract.version = "2.0";
  const versionResult = run(wrongVersion);
  assert.notEqual(versionResult.status, 0);
  assert.match(versionResult.stderr, /contract\.version must match the committed manifest version/);

  const wrongMode = readyState();
  wrongMode.execution_mode = "supervised";
  const modeResult = run(wrongMode);
  assert.notEqual(modeResult.status, 0);
  assert.match(modeResult.stderr, /execution_mode must match the committed manifest/);
});

test("rejects READY when a frozen product artifact is not approved", () => {
  const variant = createVariantContractRepo({ briefStatus: "DRAFT" });
  const state = readyState();
  state.contract.commit = variant.sha;
  const result = run(state, null, { repo: variant.repo });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /committed brief artifact status must be APPROVED/);
});

test("accepts a committed contract without a UX role for non-user-facing work", () => {
  const repo = mkdtempSync(join(tmpdir(), "product-loop-no-ux-"));
  const paths = contractPaths.filter((path) => path !== "product/03-ux-flow.md");
  const roles = ["brief", "prd", "tech_spec", "roadmap", "observation_monitor", "first_phase"];
  mkdirSync(join(repo, "product", "phases"), { recursive: true });
  mkdirSync(join(repo, "product", "observation"), { recursive: true });
  const rows = paths.slice(1).map((path, index) => `| \`${roles[index]}\` | \`${path}\` | 1.0 | test |`).join("\n");
  writeFileSync(join(repo, "product", "run-contract.md"), `---\nstatus: APPROVED\nversion: "1.0"\nexecution_mode: autonomous\n---\n\n# Contract\n\n## Frozen artifact set\n\n| Role | Path | Version | Purpose |\n|---|---|---|---|\n${rows}\n\n## Contract verification\n`);
  for (const path of paths.slice(1)) writeFileSync(join(repo, path), artifactContents[path]);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Product Loop Test"], { cwd: repo });
  execFileSync("git", ["add", "product"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "contract without UX"], { cwd: repo });
  const state = readyState();
  state.contract.commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  state.contract.paths = paths;
  const result = run(state, null, { repo });
  assert.equal(result.status, 0, result.stderr);
});

test("rejects impossible 41-to-63-character Git object IDs", () => {
  const state = clone(template);
  state.contract.commit = "a".repeat(41);
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contract\.commit must be a full lowercase Git SHA/);
});

test("rejects OBSERVING without a durable monitor", () => {
  const state = readyState();
  state.lifecycle = "OBSERVING";
  state.started_at = "2026-07-10T12:01:00Z";
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OBSERVING requires observation\.monitor_id/);
});

test("rejects contract mutation after RUNNING", () => {
  const previous = runningPhaseState();
  const next = clone(previous);
  next.contract.commit = "b".repeat(40);
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contract identity cannot change after RUNNING/);
});

test("rejects decreasing global budget consumption", () => {
  const previous = runningPhaseState();
  previous.global_budget.turns_used = 10;
  previous.global_budget.elapsed_seconds = 120;
  previous.global_budget.cost_used_usd = 2;
  const next = clone(previous);
  next.global_budget.turns_used = 9;
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /global_budget\.turns_used cannot decrease/);
});

test("allows the consecutive no-progress streak to reset after progress", () => {
  const previous = runningPhaseState();
  previous.global_budget.consecutive_no_progress_count = 2;
  const next = clone(previous);
  const progressSha = createCommit("recorded integration progress");
  const progressBranch = "integration-progress";
  pointBranch(progressBranch, progressSha);
  next.global_budget.turns_used += 1;
  next.global_budget.consecutive_no_progress_count = 0;
  next.integration = { branch: progressBranch, sha: progressSha, verified_at: "2026-07-10T12:14:00Z" };
  next.last_verified_gate = {
    name: "targeted regression",
    tested_sha: progressSha,
    result: "PASS",
    evidence: ".loop/gates/P1-targeted.log",
    verified_at: "2026-07-10T12:15:00Z"
  };
  const result = run(next, previous);
  assert.equal(result.status, 0, result.stderr);
});

test("does not accept a blank checkpoint as no-progress reset evidence", () => {
  const previous = runningPhaseState();
  previous.global_budget.consecutive_no_progress_count = 2;
  const next = clone(previous);
  next.global_budget.turns_used += 1;
  next.global_budget.consecutive_no_progress_count = 0;
  next.checkpoints.push({ at: "", phase: "", step: "", integration_sha: "", evidence: [], next_action: "" });
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checkpoints\[0\]\.integration_sha must be a full lowercase Git SHA/);
  assert.match(result.stderr, /no-progress reset requires recorded progress evidence/);
});

test("rejects unavailable Git objects as verified-gate evidence", () => {
  const state = runningPhaseState();
  state.last_verified_gate = { name: "fake gate", tested_sha: "a".repeat(40), result: "PASS", evidence: "fake.log", verified_at: "2026-07-10T12:15:00Z" };
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /last_verified_gate\.tested_sha is not an available Git commit/);
});

test("rejects resetting the no-progress streak without recorded progress", () => {
  const previous = runningPhaseState();
  previous.global_budget.consecutive_no_progress_count = 2;
  const next = clone(previous);
  next.global_budget.turns_used += 1;
  next.global_budget.consecutive_no_progress_count = 0;
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no-progress reset requires recorded progress evidence/);
});

test("rejects spend above a zero-cost authority ceiling", () => {
  const state = readyState();
  state.global_budget.cost_limit_usd = 0;
  state.global_budget.cost_used_usd = 0.01;
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /global cost limit requires lifecycle BLOCKED/);
});

test("accepts READY with either a wall-clock or turn global ceiling", () => {
  const state = readyState();
  state.global_budget.turn_limit = 0;
  const result = run(state);
  assert.equal(result.status, 0, result.stderr);

  const turnOnly = readyState();
  turnOnly.global_budget.wall_clock_limit_seconds = 0;
  const turnOnlyResult = run(turnOnly);
  assert.equal(turnOnlyResult.status, 0, turnOnlyResult.stderr);
});

test("rejects changing execution mode after state creation", () => {
  const previous = runningPhaseState();
  const next = clone(previous);
  next.execution_mode = "supervised";
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /execution_mode cannot change/);
});

test("rejects a malformed previous state before evaluating a transition", () => {
  const previous = runningPhaseState();
  previous.global_budget.unexpected = true;
  const next = runningPhaseState();
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /previous state is invalid/);
});

test("allows READY to become BLOCKED before kickoff time is set", () => {
  const previous = readyState();
  const next = clone(previous);
  next.lifecycle = "BLOCKED";
  next.terminal = { state: "BLOCKED", reason: "required environment disappeared", evidence: ["preflight-recheck.log"] };
  const result = run(next, previous);
  assert.equal(result.status, 0, result.stderr);
});

test("allows an archived terminal BLOCKED run to seed a linked new PREFLIGHT", () => {
  const previous = readyState();
  previous.lifecycle = "BLOCKED";
  previous.terminal = { state: "BLOCKED", reason: "credential revoked", evidence: ["credential-check.log"] };
  const next = clone(template);
  next.run_id = "run-2";
  next.parent_run_id = previous.run_id;
  next.contract.version = "2.0";
  const result = run(next, previous, { archivePrevious: true });
  assert.equal(result.status, 0, result.stderr);
});

test("terminal rollover cannot carry stale run evidence into the new PREFLIGHT", () => {
  const previous = readyState();
  previous.lifecycle = "BLOCKED";
  previous.terminal = { state: "BLOCKED", reason: "credential revoked", evidence: ["credential-check.log"] };
  const next = clone(template);
  next.run_id = "run-2";
  next.parent_run_id = previous.run_id;
  next.contract.version = "2.0";
  next.last_verified_gate = { name: "stale", tested_sha: fullSha, result: "PASS", evidence: "stale.log", verified_at: "2026-07-10T12:00:00Z" };
  const result = run(next, previous, { archivePrevious: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /new PREFLIGHT must reset last_verified_gate/);
});

test("turns without progress must increment the no-progress streak", () => {
  const previous = runningPhaseState();
  const next = clone(previous);
  next.global_budget.turns_used += 1;
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /each turn without recorded progress must increment/);
});

test("rejects rewriting an existing external-effect audit record", () => {
  const previous = runningPhaseState();
  previous.external_effects.push({ id: "effect-1", type: "deploy", target: "staging", authority_source: "brief-v1", result: "ok", rollback: "not needed", evidence: "deploy.log", at: "2026-07-10T12:10:00Z" });
  const next = clone(previous);
  next.external_effects[0].authority_source = "rewritten";
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /external_effects records are append-only/);
});

test("rejects incomplete external-effect records before they become immutable", () => {
  const state = clone(template);
  state.external_effects.push({ id: "effect-1", type: "deploy", target: "staging", authority_source: "brief-v1", result: "", rollback: "", evidence: "", at: "" });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /external_effects\[0\]\.result must be a non-empty string/);
});

test("prevents same-class failure counts or evidence from being rewritten", () => {
  const previous = runningPhaseState();
  previous.failure = { class: "test-flake", count: 2, last_evidence: "attempt-2.log" };
  const decreased = clone(previous);
  decreased.failure.count = 1;
  const decreasedResult = run(decreased, previous);
  assert.notEqual(decreasedResult.status, 0);
  assert.match(decreasedResult.stderr, /failure\.count cannot decrease for the same class/);

  const inflated = clone(previous);
  inflated.failure.count = 3;
  const inflatedResult = run(inflated, previous);
  assert.notEqual(inflatedResult.status, 0);
  assert.match(inflatedResult.stderr, /incrementing failure\.count requires new evidence/);

  const changedClass = clone(previous);
  changedClass.failure = { class: "different-class", count: 1, last_evidence: "reset.log" };
  const changedResult = run(changedClass, previous);
  assert.notEqual(changedResult.status, 0);
  assert.match(changedResult.stderr, /failure class cannot change without recorded progress/);
});

test("rejects resetting phase consumption or changing its contract", () => {
  const previous = runningPhaseState();
  previous.active_phase.elapsed_seconds = 90;
  previous.active_phase.turns_used = 19;
  const next = clone(previous);
  next.active_phase.elapsed_seconds = 0;
  next.active_phase.turns_used = 0;
  next.active_phase.contract_commit = "b".repeat(40);
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active phase contract identity cannot change/);
  assert.match(result.stderr, /active_phase\.turns_used cannot decrease/);
});

test("rejects a running phase with no wall-clock or turn ceiling", () => {
  const state = runningPhaseState();
  state.active_phase.wall_clock_limit_seconds = 0;
  state.active_phase.turn_limit = 0;
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active phase requires a wall-clock or turn ceiling/);
});

test("rejects unexpected state properties", () => {
  const state = clone(template);
  state.unexpected = true;
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /state\.unexpected is not allowed/);
});

test("rejects unexpected nested control properties", () => {
  const state = clone(template);
  state.global_budget.unexpected = true;
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /global_budget\.unexpected is not allowed/);
});

test("requires a new contract version when recovering NOT_READY", () => {
  const previous = clone(template);
  previous.run_id = "run-1";
  previous.parent_run_id = "";
  previous.lifecycle = "NOT_READY";
  previous.contract.version = "1.0";
  const next = clone(previous);
  next.lifecycle = "PREFLIGHT";
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NOT_READY recovery requires a new contract version/);
});

test("allows an archived MISSED_TARGET run to seed a linked new PREFLIGHT", () => {
  const previous = completeObservation(completedPhaseState());
  previous.lifecycle = "MISSED_TARGET";
  previous.terminal = { state: "MISSED_TARGET", reason: "KPI target missed", evidence: ["kpi-report.json"] };
  const next = clone(template);
  next.run_id = "run-2";
  next.parent_run_id = previous.run_id;
  next.contract.version = "2.0";
  const result = run(next, previous, { archivePrevious: true });
  assert.equal(result.status, 0, result.stderr);
});

test("rejects a MISSED_TARGET rollover when the archive was rewritten", () => {
  const previous = completeObservation(completedPhaseState());
  previous.lifecycle = "MISSED_TARGET";
  previous.terminal = { state: "MISSED_TARGET", reason: "KPI target missed", evidence: ["kpi-report.json"] };
  const next = clone(template);
  next.run_id = "run-2";
  next.parent_run_id = previous.run_id;
  next.contract.version = "2.0";
  const archiveValue = clone(previous);
  archiveValue.terminal.reason = "rewritten";
  const result = run(next, previous, { archivePrevious: true, archiveValue });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /archived run must exactly match/);
});

test("accepts RUNNING to OBSERVING with a monitor and monotonic budgets", () => {
  const previous = completedPhaseState();
  previous.active_phase.status = "RUNNING";
  previous.global_budget.turns_used = 10;
  const next = clone(previous);
  next.lifecycle = "OBSERVING";
  next.active_phase.status = "VERIFIED";
  next.global_budget.turns_used = 11;
  next.observation.status = "SCHEDULED";
  next.observation.window_ends_at = "2026-07-17T12:00:00Z";
  next.observation.next_check_at = "2026-07-11T12:00:00Z";
  next.observation.monitor_id = "monitor-1";
  next.observation.release_evidence = ".loop/release-evidence.md";
  const result = run(next, previous);
  assert.equal(result.status, 0, result.stderr);
});

test("OBSERVING cannot start until every frozen roadmap phase is integrated", () => {
  const variant = createVariantContractRepo({ secondPhase: true });
  const state = completedPhaseState();
  state.contract.commit = variant.sha;
  state.contract.paths = [...contractPaths];
  state.active_phase.contract_commit = variant.sha;
  state.candidates[0].base_sha = variant.sha;
  state.candidates[0].head_sha = variant.sha;
  state.selections[0].candidate_shas = [variant.sha];
  state.selections[0].selected_sha = variant.sha;
  state.integration = { branch: variant.branch, sha: variant.sha, verified_at: "2026-07-10T11:30:00Z" };
  state.last_verified_gate.tested_sha = variant.sha;
  state.checkpoints[0].integration_sha = variant.sha;
  state.lifecycle = "OBSERVING";
  state.observation.status = "SCHEDULED";
  state.observation.window_ends_at = "2026-07-17T12:00:00Z";
  state.observation.next_check_at = "2026-07-11T12:00:00Z";
  state.observation.monitor_id = "monitor-1";
  state.observation.release_evidence = ".loop/release-evidence.md";
  const result = run(state, null, { repo: variant.repo });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /roadmap phase P2/);
});

test("terminal KPI outcomes require a completed observation with evidence", () => {
  const state = completedPhaseState();
  state.lifecycle = "MISSED_TARGET";
  state.terminal = { state: "MISSED_TARGET", reason: "target missed", evidence: ["terminal-summary.md"] };
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MISSED_TARGET requires observation\.status COMPLETE/);
});

test("terminal KPI verdicts must cover every frozen KPI and guardrail ID", () => {
  const state = completeObservation(completedPhaseState());
  state.lifecycle = "MISSED_TARGET";
  state.terminal = { state: "MISSED_TARGET", reason: "target missed", evidence: ["terminal-summary.md"] };
  state.observation.measurements.pop();
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /measurements must exactly match the frozen KPI and guardrail IDs/);
});

test("terminal KPI pass/fail is derived from frozen comparisons and hashed source artifacts", () => {
  const state = completeObservation(completedPhaseState());
  state.lifecycle = "VALIDATED";
  state.terminal = { state: "VALIDATED", reason: "claimed success", evidence: ["terminal-summary.md"] };
  state.observation.measurements[0].passed = true;
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /passed does not match the deterministic comparison/);
});

test("measurement actuals must match the canonical source receipt", () => {
  const state = completeObservation(completedPhaseState());
  materializeOutcomeEvidence(state, contractRepo);
  state.lifecycle = "VALIDATED";
  state.terminal = { state: "VALIDATED", reason: "claimed success", evidence: ["terminal-summary.md"] };
  state.observation.measurements[0].actual = "pass";
  state.observation.measurements[0].passed = true;
  const result = run(state, null, { materializeOutcomes: false });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source receipt does not match the measurement and run identities/);
});

test("release evidence is hash-bound to the integration and contract SHAs", () => {
  const state = completedPhaseState();
  state.lifecycle = "OBSERVING";
  state.observation.status = "SCHEDULED";
  state.observation.window_ends_at = "2026-07-17T12:00:00Z";
  state.observation.next_check_at = "2026-07-11T12:00:00Z";
  state.observation.monitor_id = "monitor-1";
  state.observation.release_evidence = ".loop/release-evidence.md";
  materializeOutcomeEvidence(state, contractRepo);
  writeFileSync(join(contractRepo, state.observation.release_evidence), "tampered\n");
  const result = run(state, null, { materializeOutcomes: false });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /release_evidence_sha256 does not match release evidence/);
});

test("observation monitor identity and evidence are append-only", () => {
  const previous = completedPhaseState();
  previous.lifecycle = "OBSERVING";
  previous.observation = { status: "SCHEDULED", window_ends_at: "2026-07-17T12:00:00Z", next_check_at: "2026-07-11T12:00:00Z", monitor_id: "monitor-1", release_evidence: ".loop/release-evidence.md", release_evidence_sha256: "", measurements: [], evidence: ["release.log"] };
  const next = clone(previous);
  next.observation.monitor_id = "monitor-rewritten";
  next.observation.evidence = [];
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /observation\.monitor_id cannot change once set/);
  assert.match(result.stderr, /observation\.evidence records are append-only/);
});

test("does not interpret negative prose containing pass-like words as a passing gate", () => {
  const state = completedPhaseState();
  state.last_verified_gate.result = "tests did not pass";
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /last_verified_gate\.result is invalid/);
});

test("accepts requested, attempted, and final model provenance records", () => {
  const state = clone(template);
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: "/tmp/candidate-a",
    branch: "codex/loop/p1/a",
    base_sha: fullSha,
    head_sha: "b".repeat(40),
    owner: "worker-a",
    producer_run_id: "run-a",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/gpt-5.6-sol",
    attempted_models: ["llm-proxy/grok-4.5", "llm-proxy/gpt-5.6-sol"],
    status: "COMPLETE",
    evidence: ".loop/evaluation/P1/A.md"
  });
  state.children.push({
    phase_id: "P1",
    run_id: "run-a",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/gpt-5.6-sol",
    attempted_models: ["llm-proxy/grok-4.5", "llm-proxy/gpt-5.6-sol"],
    cwd: "/tmp/candidate-a",
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/run-a_meta.json"
  });
  const result = run(state);
  assert.equal(result.status, 0, result.stderr);
});

test("accepts Pi thinking suffixes in actual attempted and final model IDs", () => {
  const state = clone(template);
  state.children.push({
    phase_id: "P1",
    run_id: "child-thinking",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5:high",
    attempted_models: ["llm-proxy/grok-4.5:high"],
    cwd: "/tmp/candidate-thinking",
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/child-thinking_meta.json"
  });
  const result = run(state);
  assert.equal(result.status, 0, result.stderr);
});

test("does not conflate distinct thinking-level attempts for final-model provenance", () => {
  const state = clone(template);
  state.children.push({
    phase_id: "P1",
    run_id: "child-thinking-mismatch",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5:high",
    attempted_models: ["llm-proxy/grok-4.5:low"],
    cwd: "/tmp/candidate-thinking-mismatch",
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/child-thinking-mismatch_meta.json"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final_model must appear in attempted_models/);
});

test("requires final_model to be the last ordered model attempt", () => {
  const state = clone(template);
  state.children.push({
    phase_id: "P1",
    run_id: "child-final-order",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5", "llm-proxy/gpt-5.6-sol"],
    cwd: "/tmp/candidate-final-order",
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/child-final-order_meta.json"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final_model must be the last attempted model/);
});

test("rejects decisive records without actual model provenance", () => {
  const state = clone(template);
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: "/tmp/candidate-a",
    branch: "codex/loop/p1/a",
    base_sha: fullSha,
    head_sha: "b".repeat(40),
    owner: "worker-a",
    producer_run_id: "missing-producer",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "",
    attempted_models: ["llm-proxy/grok-4.5"],
    status: "COMPLETE",
    evidence: ".loop/evaluation/P1/A.md"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /COMPLETE requires final_model/);
});

test("rejects a completed candidate without a matching producer child", () => {
  const state = clone(template);
  state.candidates.push({ phase_id: "P1", id: "A", worktree: "/tmp/unlinked-a", branch: "codex/loop/P1/unlinked-a", base_sha: fullSha, head_sha: "b".repeat(40), owner: "worker-a", producer_run_id: "missing-worker", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], status: "COMPLETE", evidence: ".loop/evaluation/P1/A.md" });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /producer_run_id does not identify a child/);
});

test("rejects final models that are absent from attempted model history", () => {
  const state = clone(template);
  state.children.push({
    phase_id: "P1",
    run_id: "child-1",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/gpt-5.6-sol",
    attempted_models: ["llm-proxy/grok-4.5"],
    cwd: "/tmp/candidate-a",
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/child-1_meta.json"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final_model must appear in attempted_models/);
});

test("rejects attempted-model history that does not start with the requested model", () => {
  const state = clone(template);
  state.children.push({
    phase_id: "P1",
    run_id: "child-1",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/claude-opus-4-8",
    attempted_models: ["llm-proxy/claude-opus-4-8"],
    cwd: "/tmp/candidate-a",
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/child-1_meta.json"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /attempted_models must start with requested_model/);
});

test("rejects a completed blind evaluator from a candidate owner's actual model family", () => {
  const state = clone(template);
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: "/tmp/candidate-a",
    branch: "codex/loop/p1/a",
    base_sha: fullSha,
    head_sha: "b".repeat(40),
    owner: "worker-a",
    producer_run_id: "worker-gpt",
    requested_model: "llm-proxy/gpt-5.6-sol",
    final_model: "llm-proxy/gpt-5.6-sol",
    attempted_models: ["llm-proxy/gpt-5.6-sol"],
    status: "COMPLETE",
    evidence: ".loop/evaluation/P1/A.md"
  });
  state.children.push({
    phase_id: "P1",
    run_id: "judge-1",
    agent: "blind-evaluator",
    requested_model: "llm-proxy/gpt-5.7",
    final_model: "llm-proxy/gpt-5.7",
    attempted_models: ["llm-proxy/gpt-5.7"],
    cwd: "/tmp/blind-eval",
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/judge-1_meta.json"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /different actual model family/);
});

test("requires a completed independent evaluator before candidate selection", () => {
  const state = runningPhaseState();
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: candidateWorktree,
    branch: candidateBranch,
    base_sha: fullSha,
    head_sha: fullSha,
    owner: "worker-a",
    producer_run_id: "producer-selection",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5"],
    status: "SELECTED",
    evidence: ".loop/evaluation/P1/A.md"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /candidate selection requires an immutable linked selection record/);
});

test("rejects a selection linked to a stale evaluator from another phase", () => {
  const state = runningPhaseState();
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: candidateWorktree,
    branch: candidateBranch,
    base_sha: fullSha,
    head_sha: fullSha,
    owner: "worker-a",
    producer_run_id: "producer-stale",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5"],
    status: "SELECTED",
    evidence: ".loop/evaluation/P1/A.md"
  });
  state.children.push({
    phase_id: "P0",
    run_id: "judge-old",
    agent: "blind-evaluator",
    requested_model: "llm-proxy/claude-opus-4-8",
    final_model: "llm-proxy/claude-opus-4-8:high",
    attempted_models: ["llm-proxy/claude-opus-4-8:high"],
    cwd: "/tmp/blind-eval-old",
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/judge-old_meta.json"
  });
  state.selections.push({
    phase_id: "P1",
    evaluator_run_id: "judge-old",
    candidate_shas: [fullSha],
    selected_sha: fullSha,
    input_manifest_sha: "e".repeat(64),
    evidence: ".loop/evaluation/P1/selection.json",
    at: "2026-07-10T12:11:00Z"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /selection P1 evaluator must be COMPLETE for the same phase/);
});

test("requires the decisive blind evaluator to complete without model fallback", () => {
  const state = completedPhaseState();
  const evaluator = state.children.find((child) => child.run_id === "judge-completed");
  evaluator.attempted_models = ["llm-proxy/claude-opus-4-8:high", "llm-proxy/gpt-5.6-sol:high"];
  evaluator.final_model = "llm-proxy/gpt-5.6-sol:high";
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /blind evaluator must have no fallback attempts/);
});

test("rejects selection before every candidate is verified or rejected", () => {
  const state = runningPhaseState();
  state.candidates.push({ phase_id: "P1", id: "A", worktree: candidateWorktree, branch: candidateBranch, base_sha: fullSha, head_sha: fullSha, owner: "worker-a", producer_run_id: "worker-early-selection", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], status: "COMPLETE", evidence: ".loop/evaluation/P1/A.md" });
  state.children.push({ phase_id: "P1", run_id: "worker-early-selection", agent: "worker", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], cwd: candidateWorktree, status: "COMPLETE", started_at: "2026-07-10T11:00:00Z", completed_at: "2026-07-10T11:10:00Z", artifact: ".pi-subagents/artifacts/worker-early-selection_meta.json" });
  state.children.push({ phase_id: "P1", run_id: "judge-early-selection", agent: "blind-evaluator", requested_model: "llm-proxy/claude-opus-4-8", final_model: "llm-proxy/claude-opus-4-8:high", attempted_models: ["llm-proxy/claude-opus-4-8:high"], cwd: "/tmp/blind-early-selection", status: "COMPLETE", started_at: "2026-07-10T11:15:00Z", completed_at: "2026-07-10T11:20:00Z", artifact: ".pi-subagents/artifacts/judge-early-selection_meta.json" });
  state.selections.push({ phase_id: "P1", evaluator_run_id: "judge-early-selection", candidate_shas: [fullSha], selected_sha: fullSha, input_manifest_sha: "e".repeat(64), evidence: ".loop/evaluation/P1/selection.json", at: "2026-07-10T11:21:00Z" });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /selection P1 requires every candidate to be resolved as VERIFIED, REJECTED, SELECTED, INTEGRATED, or FAILED/);
});

test("rejects selection while another competing candidate is still running", () => {
  const state = clone(template);
  const selectedSha = "b".repeat(40);
  state.candidates.push({ phase_id: "P1", id: "A", worktree: "/tmp/P1-a", branch: "codex/loop/P1/a", base_sha: fullSha, head_sha: selectedSha, owner: "worker-a", producer_run_id: "worker-a", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], status: "VERIFIED", evidence: ".loop/evaluation/P1/A.md" });
  state.candidates.push({ phase_id: "P1", id: "B", worktree: "/tmp/P1-b", branch: "codex/loop/P1/b", base_sha: fullSha, head_sha: "", owner: "worker-b", producer_run_id: "worker-b", requested_model: "llm-proxy/gpt-5.6-sol", final_model: "", attempted_models: ["llm-proxy/gpt-5.6-sol"], status: "RUNNING", evidence: "" });
  state.children.push({ phase_id: "P1", run_id: "worker-a", agent: "worker", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], cwd: "/tmp/P1-a", status: "COMPLETE", started_at: "2026-07-10T11:00:00Z", completed_at: "2026-07-10T11:10:00Z", artifact: "worker-a.json" });
  state.children.push({ phase_id: "P1", run_id: "worker-b", agent: "worker", requested_model: "llm-proxy/gpt-5.6-sol", final_model: "", attempted_models: ["llm-proxy/gpt-5.6-sol"], cwd: "/tmp/P1-b", status: "RUNNING", started_at: "2026-07-10T11:00:00Z", completed_at: "", artifact: "" });
  state.children.push({ phase_id: "P1", run_id: "judge-running", agent: "blind-evaluator", requested_model: "llm-proxy/claude-opus-4-8", final_model: "llm-proxy/claude-opus-4-8:high", attempted_models: ["llm-proxy/claude-opus-4-8:high"], cwd: "/tmp/blind-running", status: "COMPLETE", started_at: "2026-07-10T11:15:00Z", completed_at: "2026-07-10T11:20:00Z", artifact: "judge-running.json" });
  state.selections.push({ phase_id: "P1", evaluator_run_id: "judge-running", candidate_shas: [selectedSha], selected_sha: selectedSha, input_manifest_sha: "e".repeat(64), evidence: "selection.json", at: "2026-07-10T11:21:00Z" });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /selection P1 requires every candidate to be resolved/);
});

test("selection records are append-only and immutable", () => {
  const previous = clone(template);
  const candidateSha = "b".repeat(40);
  previous.candidates.push({ phase_id: "P1", id: "A", worktree: "/tmp/selection-a", branch: "codex/loop/P1/a", base_sha: fullSha, head_sha: candidateSha, owner: "worker-a", producer_run_id: "worker-selection", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], status: "VERIFIED", evidence: ".loop/evaluation/P1/A.md" });
  previous.children.push({ phase_id: "P1", run_id: "worker-selection", agent: "worker", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], cwd: "/tmp/selection-a", status: "COMPLETE", started_at: "2026-07-10T11:00:00Z", completed_at: "2026-07-10T11:10:00Z", artifact: ".pi-subagents/artifacts/worker-selection_meta.json" });
  previous.children.push({ phase_id: "P1", run_id: "judge-selection", agent: "blind-evaluator", requested_model: "llm-proxy/claude-opus-4-8", final_model: "llm-proxy/claude-opus-4-8:high", attempted_models: ["llm-proxy/claude-opus-4-8:high"], cwd: "/tmp/blind-selection", status: "COMPLETE", started_at: "2026-07-10T12:00:00Z", completed_at: "2026-07-10T12:10:00Z", artifact: ".pi-subagents/artifacts/judge-selection_meta.json" });
  previous.selections.push({ phase_id: "P1", evaluator_run_id: "judge-selection", candidate_shas: [candidateSha], selected_sha: candidateSha, input_manifest_sha: "e".repeat(64), evidence: ".loop/evaluation/P1/selection.json", at: "2026-07-10T12:11:00Z" });
  const next = clone(previous);
  next.selections[0].evidence = "rewritten.json";
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /selections records are append-only/);
});

test("selection receipts bind the sanitized manifest and Pi evaluator metadata", () => {
  const state = completedPhaseState();
  materializeSelectionEvidence(state, contractRepo);
  const manifestPath = join(contractRepo, dirname(state.selections[0].evidence), "manifest.json");
  writeFileSync(manifestPath, "tampered\n");
  const result = run(state, null, { materializeSelections: false });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /input_manifest_sha does not match the sanitized manifest/);
});

test("malformed selection arrays are rejected without crashing the validator", () => {
  const state = clone(template);
  state.selections.push({ phase_id: "P1", evaluator_run_id: "judge", candidate_shas: null, selected_sha: fullSha, input_manifest_sha: "e".repeat(64), evidence: "selection.json", at: "2026-07-10T12:00:00Z" });
  const result = run(state, null, { materializeSelections: false });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /candidate_shas must be an array/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

test("malformed evaluator model history is rejected without crashing the validator", () => {
  const state = completedPhaseState();
  const evaluator = state.children.find((child) => child.run_id === state.selections[0].evaluator_run_id);
  evaluator.attempted_models = null;
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /attempted_models must be an array/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

test("new ledger records must enter through their initial states", () => {
  const previous = runningPhaseState();
  const next = clone(previous);
  next.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: candidateWorktree,
    branch: candidateBranch,
    base_sha: fullSha,
    head_sha: fullSha,
    owner: "worker-a",
    producer_run_id: "child-1",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5"],
    status: "COMPLETE",
    evidence: ".loop/evaluation/P1/A.md"
  });
  next.children.push({
    phase_id: "P1",
    run_id: "child-1",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5"],
    cwd: candidateWorktree,
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/child-1_meta.json"
  });
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /new candidate A must start PLANNED/);
  assert.match(result.stderr, /new child child-1 must start QUEUED or RUNNING/);
});

test("requires canonical absolute candidate and child working directories", () => {
  const state = clone(template);
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: "relative/candidate-a",
    branch: "codex/loop/p1/a",
    base_sha: fullSha,
    head_sha: "",
    owner: "worker-a",
    producer_run_id: "",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "",
    attempted_models: [],
    status: "PLANNED",
    evidence: ""
  });
  state.children.push({
    phase_id: "P1",
    run_id: "child-1",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "",
    attempted_models: [],
    cwd: "relative/candidate-a",
    status: "QUEUED",
    started_at: "",
    completed_at: "",
    artifact: ""
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /candidates\[0\]\.worktree must be a canonical absolute path/);
  assert.match(result.stderr, /children\[0\]\.cwd must be a canonical absolute path/);
});

test("rejects a candidate that reuses the integration checkout or branch", () => {
  const state = runningPhaseState();
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: contractRepo,
    branch: contractBranch,
    base_sha: fullSha,
    head_sha: "",
    owner: "worker-a",
    producer_run_id: "producer-isolation",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "",
    attempted_models: ["llm-proxy/grok-4.5"],
    status: "RUNNING",
    evidence: ""
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /worktree must be isolated from the integration checkout/);
  assert.match(result.stderr, /branch must differ from the integration branch/);
});

test("allows candidate labels to repeat across phases", () => {
  const state = clone(template);
  for (const phase of ["P1", "P2"]) {
    state.candidates.push({
      phase_id: phase,
      id: "A",
      worktree: `/tmp/${phase}-candidate-a`,
      branch: `codex/loop/${phase}/a`,
      base_sha: fullSha,
      head_sha: "",
      owner: `${phase}-worker-a`,
      producer_run_id: "",
      requested_model: "llm-proxy/grok-4.5",
      final_model: "",
      attempted_models: [],
      status: "PLANNED",
      evidence: ""
    });
  }
  const result = run(state);
  assert.equal(result.status, 0, result.stderr);
});

test("rejects unavailable candidate and integration Git identities", () => {
  const state = runningPhaseState();
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: candidateWorktree,
    branch: candidateBranch,
    base_sha: "b".repeat(40),
    head_sha: "c".repeat(40),
    owner: "worker-a",
    producer_run_id: "missing-unavailable-producer",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5"],
    status: "COMPLETE",
    evidence: ".loop/evaluation/P1/A.md"
  });
  state.integration = { branch: contractBranch, sha: "d".repeat(40), verified_at: "2026-07-10T12:20:00Z" };
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /candidate A base_sha is not an available Git commit/);
  assert.match(result.stderr, /integration\.sha is not an available Git commit/);
});

test("rejects a candidate branch that does not point to its recorded head", () => {
  const state = runningPhaseState();
  state.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: candidateWorktree,
    branch: "codex/loop/nonexistent",
    base_sha: fullSha,
    head_sha: fullSha,
    owner: "worker-a",
    producer_run_id: "missing-branch-producer",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5"],
    status: "COMPLETE",
    evidence: ".loop/evaluation/P1/A.md"
  });
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /candidate A branch does not point to head_sha/);
});

test("rejects active-phase candidates created from different common bases", () => {
  const branch = "candidate-wrong-base";
  const later = createCommit("later candidate base");
  pointBranch(branch, later);
  try {
    const state = runningPhaseState();
    state.candidates.push({
      phase_id: "P1",
      id: "A",
      worktree: "/tmp/removed-candidate-a",
      branch,
      base_sha: later,
      head_sha: later,
      owner: "worker-a",
      producer_run_id: "missing-base-producer",
      requested_model: "llm-proxy/grok-4.5",
      final_model: "llm-proxy/grok-4.5",
      attempted_models: ["llm-proxy/grok-4.5"],
      status: "REJECTED",
      evidence: ".loop/evaluation/P1/A.md"
    });
    const result = run(state);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /candidate A base_sha must equal the active phase candidate base/);
  } finally {
    deleteBranch(branch);
  }
});

test("rejects an integration SHA unrelated to the integrated candidate", () => {
  const candidateBranch = "candidate-integration-link";
  const integrationBranch = "integration-unrelated";
  const candidateHead = createCommit("candidate head");
  const unrelatedIntegration = createCommit("unrelated integration");
  pointBranch(candidateBranch, candidateHead);
  pointBranch(integrationBranch, unrelatedIntegration);
  try {
    const state = runningPhaseState();
    state.active_phase.status = "VERIFIED";
    state.candidates.push({
      phase_id: "P1",
      id: "A",
      worktree: "/tmp/removed-integrated-a",
      branch: candidateBranch,
      base_sha: fullSha,
      head_sha: candidateHead,
      owner: "worker-a",
      producer_run_id: "worker-link",
      requested_model: "llm-proxy/grok-4.5",
      final_model: "llm-proxy/grok-4.5",
      attempted_models: ["llm-proxy/grok-4.5"],
      status: "INTEGRATED",
      evidence: ".loop/evaluation/P1/A.md"
    });
    state.children.push({
      phase_id: "P1",
      run_id: "worker-link",
      agent: "worker",
      requested_model: "llm-proxy/grok-4.5",
      final_model: "llm-proxy/grok-4.5",
      attempted_models: ["llm-proxy/grok-4.5"],
      cwd: "/tmp/removed-integrated-a",
      status: "COMPLETE",
      started_at: "2026-07-10T11:00:00Z",
      completed_at: "2026-07-10T11:10:00Z",
      artifact: ".pi-subagents/artifacts/worker-link_meta.json"
    });
    state.children.push({
      phase_id: "P1",
      run_id: "judge-link",
      agent: "blind-evaluator",
      requested_model: "llm-proxy/claude-opus-4-8",
      final_model: "llm-proxy/claude-opus-4-8:high",
      attempted_models: ["llm-proxy/claude-opus-4-8:high"],
      cwd: "/tmp/blind-eval-link",
      status: "COMPLETE",
      started_at: "2026-07-10T12:00:00Z",
      completed_at: "2026-07-10T12:10:00Z",
      artifact: ".pi-subagents/artifacts/judge-link_meta.json"
    });
    state.selections.push({ phase_id: "P1", evaluator_run_id: "judge-link", candidate_shas: [candidateHead], selected_sha: candidateHead, input_manifest_sha: "e".repeat(64), evidence: ".loop/evaluation/P1/selection.json", at: "2026-07-10T12:11:00Z" });
    state.integration = { branch: integrationBranch, sha: unrelatedIntegration, verified_at: "2026-07-10T12:20:00Z" };
    state.last_verified_gate = { name: "integration gate", tested_sha: unrelatedIntegration, result: "PASS", evidence: ".loop/gates/P1-final.log", verified_at: "2026-07-10T12:21:00Z" };
    const result = run(state);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /integrated candidate A head_sha must be an ancestor of integration\.sha/);
  } finally {
    deleteBranch(candidateBranch);
    deleteBranch(integrationBranch);
  }
});

test("freezes the integration branch once recorded", () => {
  const alternateBranch = "integration-branch-switch";
  pointBranch(alternateBranch, fullSha);
  try {
    const previous = completedPhaseState();
    const next = clone(previous);
    next.integration.branch = alternateBranch;
    const result = run(next, previous);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /integration\.branch cannot change once set/);
  } finally {
    deleteBranch(alternateBranch);
  }
});

test("requires every integration update to move forward by ancestry", () => {
  const integrationBranch = "integration-non-forward";
  const firstIntegration = createCommit("first forward integration");
  const unrelatedIntegration = createCommit("unrelated later integration");
  pointBranch(integrationBranch, unrelatedIntegration);
  try {
    const previous = completedPhaseState();
    previous.integration = { branch: integrationBranch, sha: firstIntegration, verified_at: "2026-07-10T12:20:00Z" };
    previous.last_verified_gate = { name: "first integration gate", tested_sha: firstIntegration, result: "PASS", evidence: ".loop/gates/P1-first.log", verified_at: "2026-07-10T12:20:30Z" };
    const next = clone(previous);
    next.integration = { branch: integrationBranch, sha: unrelatedIntegration, verified_at: "2026-07-10T12:21:00Z" };
    next.last_verified_gate = { name: "unrelated integration gate", tested_sha: unrelatedIntegration, result: "PASS", evidence: ".loop/gates/P1-unrelated.log", verified_at: "2026-07-10T12:21:30Z" };
    const result = run(next, previous);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /integration\.sha must move forward by ancestry/);
  } finally {
    deleteBranch(integrationBranch);
  }
});

test("rejects candidate commits that modify frozen global or phase contracts", () => {
  const branch = "candidate-mutates-frozen-input";
  const mutated = createCommitWithPaths("mutate frozen inputs", {
    "product/01-prd.md": "mutated PRD\n",
    "product/phases/P1-contract.md": "mutated phase contract\n"
  });
  pointBranch(branch, mutated);
  try {
    const state = runningPhaseState();
    state.candidates.push({ phase_id: "P1", id: "A", worktree: "/tmp/removed-frozen-mutator", branch, base_sha: fullSha, head_sha: mutated, owner: "worker-a", producer_run_id: "worker-frozen-mutator", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], status: "REJECTED", evidence: ".loop/evaluation/P1/A.md" });
    state.children.push({ phase_id: "P1", run_id: "worker-frozen-mutator", agent: "worker", requested_model: "llm-proxy/grok-4.5", final_model: "llm-proxy/grok-4.5", attempted_models: ["llm-proxy/grok-4.5"], cwd: "/tmp/removed-frozen-mutator", status: "COMPLETE", started_at: "2026-07-10T11:00:00Z", completed_at: "2026-07-10T11:10:00Z", artifact: ".pi-subagents/artifacts/worker-frozen-mutator_meta.json" });
    const result = run(state);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /candidate A modifies frozen contract paths/);
    assert.match(result.stderr, /candidate A modifies the active phase contract/);
  } finally {
    deleteBranch(branch);
  }
});

test("rejects marking an active phase VERIFIED without integrated selection evidence", () => {
  const state = runningPhaseState();
  state.active_phase.status = "VERIFIED";
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VERIFIED phase requires one integrated candidate and linked selection/);
});

test("previous snapshot validation tolerates a legitimately advanced live integration ref", () => {
  const integrationBranch = "integration-advanced-ref";
  const firstIntegration = createCommit("first integration");
  const evidenceFollowup = createCommit("evidence follow-up", firstIntegration);
  pointBranch(integrationBranch, evidenceFollowup);
  try {
    const previous = runningPhaseState();
    previous.active_phase.status = "VERIFIED";
    previous.candidates.push({
      phase_id: "P1",
      id: "A",
      worktree: "/tmp/removed-integrated-advance",
      branch: candidateBranch,
      base_sha: fullSha,
      head_sha: fullSha,
      owner: "worker-a",
      producer_run_id: "worker-advance",
      requested_model: "llm-proxy/grok-4.5",
      final_model: "llm-proxy/grok-4.5",
      attempted_models: ["llm-proxy/grok-4.5"],
      status: "INTEGRATED",
      evidence: ".loop/evaluation/P1/A.md"
    });
    previous.children.push({
      phase_id: "P1",
      run_id: "worker-advance",
      agent: "worker",
      requested_model: "llm-proxy/grok-4.5",
      final_model: "llm-proxy/grok-4.5",
      attempted_models: ["llm-proxy/grok-4.5"],
      cwd: "/tmp/removed-integrated-advance",
      status: "COMPLETE",
      started_at: "2026-07-10T11:00:00Z",
      completed_at: "2026-07-10T11:10:00Z",
      artifact: ".pi-subagents/artifacts/worker-advance_meta.json"
    });
    previous.children.push({
      phase_id: "P1",
      run_id: "judge-advance",
      agent: "blind-evaluator",
      requested_model: "llm-proxy/claude-opus-4-8",
      final_model: "llm-proxy/claude-opus-4-8:high",
      attempted_models: ["llm-proxy/claude-opus-4-8:high"],
      cwd: "/tmp/blind-eval-advance",
      status: "COMPLETE",
      started_at: "2026-07-10T12:00:00Z",
      completed_at: "2026-07-10T12:10:00Z",
      artifact: ".pi-subagents/artifacts/judge-advance_meta.json"
    });
    previous.selections.push({ phase_id: "P1", evaluator_run_id: "judge-advance", candidate_shas: [fullSha], selected_sha: fullSha, input_manifest_sha: "f".repeat(64), evidence: ".loop/evaluation/P1/selection.json", at: "2026-07-10T12:11:00Z" });
    previous.integration = { branch: integrationBranch, sha: firstIntegration, verified_at: "2026-07-10T12:20:00Z" };
    previous.last_verified_gate = { name: "integration gate", tested_sha: firstIntegration, result: "PASS", evidence: ".loop/gates/P1-first.log", verified_at: "2026-07-10T12:20:30Z" };
    const next = clone(previous);
    next.global_budget.turns_used += 1;
    next.integration = { branch: integrationBranch, sha: evidenceFollowup, verified_at: "2026-07-10T12:21:00Z" };
    next.last_verified_gate = { name: "evidence follow-up gate", tested_sha: evidenceFollowup, result: "PASS", evidence: ".loop/gates/P1-followup.log", verified_at: "2026-07-10T12:21:30Z" };
    const result = run(next, previous);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    deleteBranch(integrationBranch);
  }
});

test("rejects candidate identity rewrites and terminal child rewrites", () => {
  const previous = runningPhaseState();
  previous.candidates.push({
    phase_id: "P1",
    id: "A",
    worktree: candidateWorktree,
    branch: candidateBranch,
    base_sha: fullSha,
    head_sha: fullSha,
    owner: "worker-a",
    producer_run_id: "child-1",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5"],
    status: "COMPLETE",
    evidence: ".loop/evaluation/P1/A.md"
  });
  previous.children.push({
    phase_id: "P1",
    run_id: "child-1",
    agent: "worker",
    requested_model: "llm-proxy/grok-4.5",
    final_model: "llm-proxy/grok-4.5",
    attempted_models: ["llm-proxy/grok-4.5"],
    cwd: candidateWorktree,
    status: "COMPLETE",
    started_at: "2026-07-10T12:00:00Z",
    completed_at: "2026-07-10T12:10:00Z",
    artifact: ".pi-subagents/artifacts/child-1_meta.json"
  });
  const next = clone(previous);
  next.candidates[0].owner = "rewritten-owner";
  next.children[0].artifact = "rewritten.json";
  const result = run(next, previous);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /candidate A identity field owner cannot change/);
  assert.match(result.stderr, /terminal child child-1 is immutable/);
});

test("rejects working-tree edits to frozen contract paths", () => {
  const path = join(contractRepo, "product", "01-prd.md");
  const original = readFileSync(path, "utf8");
  try {
    writeFileSync(path, `${original}mutation\n`);
    const result = run(readyState());
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /frozen contract paths differ from contract\.commit/);
  } finally {
    writeFileSync(path, original);
  }
});
