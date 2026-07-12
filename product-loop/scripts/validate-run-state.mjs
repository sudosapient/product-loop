#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const cli = process.argv.slice(2);
const snapshotIndex = cli.indexOf("--snapshot-only");
const snapshotOnly = snapshotIndex >= 0;
if (snapshotOnly) cli.splice(snapshotIndex, 1);
const repoIndex = cli.indexOf("--repo");
const repoRoot = repoIndex >= 0 ? cli[repoIndex + 1] : process.cwd();
if (repoIndex >= 0) cli.splice(repoIndex, 2);
const [nextPath, previousPath] = cli;

if (!nextPath || cli.length > 2 || (repoIndex >= 0 && !repoRoot)) {
  console.error("Usage: node validate-run-state.mjs <next.json> [previous.json] [--repo <path>]");
  process.exit(2);
}

function load(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`${path}: ${error.message}`);
    process.exit(2);
  }
}

const next = load(nextPath);
const previous = previousPath ? load(previousPath) : null;

if (previousPath) {
  const previousCheck = spawnSync(process.execPath, [fileURLToPath(import.meta.url), previousPath, "--snapshot-only", "--repo", repoRoot], { encoding: "utf8" });
  if (previousCheck.status !== 0) {
    console.error("- previous state is invalid");
    if (previousCheck.stderr) process.stderr.write(previousCheck.stderr);
    process.exit(1);
  }
}

const errors = [];
const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const lifecycles = ["PREFLIGHT", "NOT_READY", "READY", "RUNNING", "OBSERVING", "VALIDATED", "MISSED_TARGET", "BLOCKED"];
const terminalStates = ["VALIDATED", "MISSED_TARGET", "BLOCKED"];
const requiredContractRoles = ["brief", "prd", "tech_spec", "roadmap", "observation_monitor", "first_phase"];
const transitions = {
  PREFLIGHT: ["PREFLIGHT", "NOT_READY", "READY"],
  NOT_READY: ["NOT_READY", "PREFLIGHT"],
  READY: ["READY", "RUNNING", "BLOCKED"],
  RUNNING: ["RUNNING", "OBSERVING", "BLOCKED"],
  OBSERVING: ["OBSERVING", "VALIDATED", "MISSED_TARGET", "BLOCKED"],
  VALIDATED: ["VALIDATED"],
  MISSED_TARGET: ["MISSED_TARGET"],
  BLOCKED: ["BLOCKED"]
};
const candidateTransitions = {
  PLANNED: ["PLANNED", "RUNNING", "FAILED"],
  RUNNING: ["RUNNING", "COMPLETE", "FAILED"],
  COMPLETE: ["COMPLETE", "VERIFIED", "REJECTED"],
  VERIFIED: ["VERIFIED", "SELECTED", "REJECTED"],
  SELECTED: ["SELECTED", "INTEGRATED", "REJECTED"],
  FAILED: ["FAILED"],
  REJECTED: ["REJECTED"],
  INTEGRATED: ["INTEGRATED"]
};
const childTransitions = {
  QUEUED: ["QUEUED", "RUNNING", "FAILED"],
  RUNNING: ["RUNNING", "NEEDS_ATTENTION", "PAUSED", "COMPLETE", "FAILED"],
  NEEDS_ATTENTION: ["NEEDS_ATTENTION", "RUNNING", "PAUSED", "FAILED"],
  PAUSED: ["PAUSED", "RUNNING", "FAILED"],
  COMPLETE: ["COMPLETE"],
  FAILED: ["FAILED"]
};
const phaseTransitions = {
  "": ["", "PLANNED", "RUNNING"],
  PLANNED: ["PLANNED", "RUNNING", "BLOCKED"],
  RUNNING: ["RUNNING", "VERIFIED", "BLOCKED"],
  VERIFIED: ["VERIFIED"],
  BLOCKED: ["BLOCKED"]
};

function fail(message) {
  errors.push(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, path) {
  if (!isObject(value)) {
    fail(`${path} must be an object`);
    return false;
  }
  return true;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
    return false;
  }
  return true;
}

function requireString(value, path, allowEmpty = true) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    fail(`${path} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
}

function requireNonnegative(value, path, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    fail(`${path} must be a non-negative ${integer ? "integer" : "number"}`);
  }
}

function requireSha(value, path, allowEmpty = true) {
  requireString(value, path);
  if (typeof value === "string" && !((allowEmpty && value === "") || shaPattern.test(value))) {
    fail(`${path} must be a full lowercase Git SHA`);
  }
}

function requireKeys(value, path, keys) {
  if (!requireObject(value, path)) return false;
  for (const key of keys) {
    if (!(key in value)) fail(`${path}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${path}.${key} is not allowed`);
  }
  return true;
}

function validRepoPath(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.startsWith("/")
    && !path.startsWith(":")
    && !path.includes("\\")
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function requireRepoPath(value, path, allowEmpty = true) {
  requireString(value, path, allowEmpty);
  if (typeof value === "string" && value !== "" && !validRepoPath(value)) fail(`${path} must be a safe repository-relative path`);
}

function requireCanonicalAbsolutePath(value, path) {
  requireString(value, path, false);
  if (typeof value === "string" && (!isAbsolute(value) || resolve(value) !== value)) fail(`${path} must be a canonical absolute path`);
}

function validateBudget(budget, path) {
  const keys = ["wall_clock_limit_seconds", "turn_limit", "cost_limit_usd", "elapsed_seconds", "turns_used", "cost_used_usd", "consecutive_no_progress_limit", "consecutive_no_progress_count"];
  if (!requireKeys(budget, path, keys)) return;
  requireNonnegative(budget.wall_clock_limit_seconds, `${path}.wall_clock_limit_seconds`, true);
  requireNonnegative(budget.turn_limit, `${path}.turn_limit`, true);
  if (budget.cost_limit_usd !== null) requireNonnegative(budget.cost_limit_usd, `${path}.cost_limit_usd`);
  requireNonnegative(budget.elapsed_seconds, `${path}.elapsed_seconds`, true);
  requireNonnegative(budget.turns_used, `${path}.turns_used`, true);
  requireNonnegative(budget.cost_used_usd, `${path}.cost_used_usd`);
  requireNonnegative(budget.consecutive_no_progress_limit, `${path}.consecutive_no_progress_limit`, true);
  requireNonnegative(budget.consecutive_no_progress_count, `${path}.consecutive_no_progress_count`, true);
}

function validateRecords(records, path, keys, validator) {
  if (!requireArray(records, path)) return;
  records.forEach((record, index) => {
    const itemPath = `${path}[${index}]`;
    if (requireKeys(record, itemPath, keys)) validator(record, itemPath);
  });
}

function validateAttemptedModels(record, path, decisiveStatuses) {
  requireString(record.final_model, `${path}.final_model`);
  if (requireArray(record.attempted_models, `${path}.attempted_models`)) {
    record.attempted_models.forEach((model, index) => requireString(model, `${path}.attempted_models[${index}]`, false));
    if (new Set(record.attempted_models).size !== record.attempted_models.length) fail(`${path}.attempted_models must be unique and ordered`);
  }
  if (record.final_model && Array.isArray(record.attempted_models) && !record.attempted_models.includes(record.final_model)) {
    fail(`${path}.final_model must appear in attempted_models`);
  }
  if (record.final_model && Array.isArray(record.attempted_models) && record.attempted_models.at(-1) !== record.final_model) {
    fail(`${path}.final_model must be the last attempted model`);
  }
  if (Array.isArray(record.attempted_models) && record.attempted_models.length > 0 && canonicalModel(record.attempted_models[0]) !== canonicalModel(record.requested_model)) {
    fail(`${path}.attempted_models must start with requested_model`);
  }
  if (decisiveStatuses.includes(record.status)) {
    if (!record.final_model) fail(`${path}.${record.status} requires final_model`);
    if (!Array.isArray(record.attempted_models) || record.attempted_models.length === 0) fail(`${path}.${record.status} requires attempted_models`);
  }
}

const topLevelKeys = ["schema_version", "run_id", "parent_run_id", "execution_mode", "lifecycle", "contract", "started_at", "updated_at", "global_budget", "active_phase", "candidates", "children", "selections", "external_effects", "last_verified_gate", "failure", "checkpoints", "integration", "observation", "next_action", "terminal"];
if (!requireKeys(next, "state", topLevelKeys)) finish();

if (next.schema_version !== 2) fail("schema_version must be 2");
requireString(next.run_id, "run_id");
requireString(next.parent_run_id, "parent_run_id");
if (next.run_id && !runIdPattern.test(next.run_id)) fail("run_id must be safe for use as an archive filename");
if (next.parent_run_id && !runIdPattern.test(next.parent_run_id)) fail("parent_run_id must be a valid run ID");
if (!["autonomous", "supervised"].includes(next.execution_mode)) fail("execution_mode must be autonomous or supervised");
if (!lifecycles.includes(next.lifecycle)) fail(`invalid lifecycle: ${next.lifecycle}`);
requireString(next.started_at, "started_at");
requireString(next.updated_at, "updated_at");
requireString(next.next_action, "next_action");

if (requireKeys(next.contract, "contract", ["version", "manifest_path", "commit", "paths", "verified_at"])) {
  requireString(next.contract.version, "contract.version");
  requireRepoPath(next.contract.manifest_path, "contract.manifest_path", false);
  requireSha(next.contract.commit, "contract.commit");
  if (requireArray(next.contract.paths, "contract.paths")) {
    next.contract.paths.forEach((path, index) => requireRepoPath(path, `contract.paths[${index}]`, false));
    if (new Set(next.contract.paths).size !== next.contract.paths.length) fail("contract.paths must be unique");
  }
  requireString(next.contract.verified_at, "contract.verified_at");
}

validateBudget(next.global_budget, "global_budget");

const phaseKeys = ["id", "status", "contract_path", "contract_commit", "evidence_path", "started_at", "wall_clock_limit_seconds", "turn_limit", "elapsed_seconds", "turns_used"];
if (requireKeys(next.active_phase, "active_phase", phaseKeys)) {
  requireString(next.active_phase.id, "active_phase.id");
  if (!["", "PLANNED", "RUNNING", "VERIFIED", "BLOCKED"].includes(next.active_phase.status)) fail("active_phase.status is invalid");
  requireRepoPath(next.active_phase.contract_path, "active_phase.contract_path");
  requireSha(next.active_phase.contract_commit, "active_phase.contract_commit");
  requireRepoPath(next.active_phase.evidence_path, "active_phase.evidence_path");
  requireString(next.active_phase.started_at, "active_phase.started_at");
  for (const field of ["wall_clock_limit_seconds", "turn_limit", "elapsed_seconds", "turns_used"]) {
    requireNonnegative(next.active_phase[field], `active_phase.${field}`, true);
  }
}

const candidateKeys = ["phase_id", "id", "worktree", "branch", "base_sha", "head_sha", "owner", "producer_run_id", "requested_model", "final_model", "attempted_models", "status", "evidence"];
validateRecords(next.candidates, "candidates", candidateKeys, (record, path) => {
  for (const field of ["phase_id", "id", "branch", "owner", "requested_model"]) requireString(record[field], `${path}.${field}`, false);
  requireString(record.producer_run_id, `${path}.producer_run_id`);
  requireCanonicalAbsolutePath(record.worktree, `${path}.worktree`);
  requireSha(record.base_sha, `${path}.base_sha`, false);
  requireSha(record.head_sha, `${path}.head_sha`);
  if (!(record.status in candidateTransitions)) fail(`${path}.status is invalid`);
  requireString(record.evidence, `${path}.evidence`);
  validateAttemptedModels(record, path, ["COMPLETE", "VERIFIED", "REJECTED", "SELECTED", "INTEGRATED"]);
  if (["COMPLETE", "VERIFIED", "REJECTED", "SELECTED", "INTEGRATED"].includes(record.status) && !record.head_sha) fail(`${path}.${record.status} requires head_sha`);
  if (["COMPLETE", "VERIFIED", "FAILED", "REJECTED", "SELECTED", "INTEGRATED"].includes(record.status) && !record.evidence) fail(`${path}.${record.status} requires evidence`);
  if (record.status === "FAILED" && (!Array.isArray(record.attempted_models) || record.attempted_models.length === 0)) fail(`${path}.FAILED requires attempted_models`);
});

const childKeys = ["phase_id", "run_id", "agent", "requested_model", "final_model", "attempted_models", "cwd", "status", "started_at", "completed_at", "artifact"];
validateRecords(next.children, "children", childKeys, (record, path) => {
  for (const field of ["phase_id", "run_id", "agent", "requested_model"]) requireString(record[field], `${path}.${field}`, false);
  requireCanonicalAbsolutePath(record.cwd, `${path}.cwd`);
  if (!(record.status in childTransitions)) fail(`${path}.status is invalid`);
  for (const field of ["started_at", "completed_at", "artifact"]) requireString(record[field], `${path}.${field}`);
  validateAttemptedModels(record, path, ["COMPLETE"]);
  if (record.status === "COMPLETE") {
    if (!record.completed_at) fail(`${path}.COMPLETE requires completed_at`);
    if (!record.artifact) fail(`${path}.COMPLETE requires artifact`);
  }
  if (record.status === "FAILED" && (!Array.isArray(record.attempted_models) || record.attempted_models.length === 0)) fail(`${path}.FAILED requires attempted_models`);
});

const selectionKeys = ["phase_id", "evaluator_run_id", "candidate_shas", "selected_sha", "input_manifest_sha", "evidence", "at"];
validateRecords(next.selections, "selections", selectionKeys, (record, path) => {
  for (const field of ["phase_id", "evaluator_run_id", "evidence", "at"]) requireString(record[field], `${path}.${field}`, false);
  requireSha(record.selected_sha, `${path}.selected_sha`, false);
  if (!/^[0-9a-f]{64}$/.test(record.input_manifest_sha)) fail(`${path}.input_manifest_sha must be a lowercase SHA-256`);
  if (requireArray(record.candidate_shas, `${path}.candidate_shas`)) {
    if (record.candidate_shas.length === 0) fail(`${path}.candidate_shas must not be empty`);
    record.candidate_shas.forEach((sha, index) => requireSha(sha, `${path}.candidate_shas[${index}]`, false));
    if (new Set(record.candidate_shas).size !== record.candidate_shas.length) fail(`${path}.candidate_shas must be unique`);
  }
});

const externalEffectKeys = ["id", "type", "target", "authority_source", "result", "rollback", "evidence", "at"];
validateRecords(next.external_effects, "external_effects", externalEffectKeys, (record, path) => {
  for (const field of ["id", "type", "target", "authority_source"]) requireString(record[field], `${path}.${field}`, false);
  for (const field of ["result", "rollback", "evidence", "at"]) requireString(record[field], `${path}.${field}`, false);
});

if (requireKeys(next.last_verified_gate, "last_verified_gate", ["name", "tested_sha", "result", "evidence", "verified_at"])) {
  requireString(next.last_verified_gate.name, "last_verified_gate.name");
  requireSha(next.last_verified_gate.tested_sha, "last_verified_gate.tested_sha");
  if (!["", "PASS", "FAIL", "BLOCKED"].includes(next.last_verified_gate.result)) fail("last_verified_gate.result is invalid");
  for (const field of ["evidence", "verified_at"]) requireString(next.last_verified_gate[field], `last_verified_gate.${field}`);
}

if (requireKeys(next.failure, "failure", ["class", "count", "last_evidence"])) {
  requireString(next.failure.class, "failure.class");
  requireNonnegative(next.failure.count, "failure.count", true);
  requireString(next.failure.last_evidence, "failure.last_evidence");
  if (!next.failure.class && (next.failure.count !== 0 || next.failure.last_evidence)) fail("empty failure.class requires zero count and empty evidence");
  if (next.failure.class && (!(next.failure.count > 0) || !next.failure.last_evidence)) fail("non-empty failure.class requires positive count and evidence");
}

const checkpointKeys = ["at", "phase", "step", "integration_sha", "evidence", "next_action"];
validateRecords(next.checkpoints, "checkpoints", checkpointKeys, (record, path) => {
  for (const field of ["at", "phase", "step", "next_action"]) requireString(record[field], `${path}.${field}`, false);
  requireSha(record.integration_sha, `${path}.integration_sha`, false);
  if (requireArray(record.evidence, `${path}.evidence`)) {
    if (record.evidence.length === 0) fail(`${path}.evidence must not be empty`);
    record.evidence.forEach((item, index) => requireString(item, `${path}.evidence[${index}]`, false));
  }
});

if (requireKeys(next.integration, "integration", ["branch", "sha", "verified_at"])) {
  requireString(next.integration.branch, "integration.branch");
  requireSha(next.integration.sha, "integration.sha");
  requireString(next.integration.verified_at, "integration.verified_at");
}

if (requireKeys(next.observation, "observation", ["status", "window_ends_at", "next_check_at", "monitor_id", "release_evidence", "release_evidence_sha256", "measurements", "evidence"])) {
  if (!["", "SCHEDULED", "RUNNING", "COMPLETE", "FAILED"].includes(next.observation.status)) fail("observation.status is invalid");
  for (const field of ["window_ends_at", "next_check_at", "monitor_id", "release_evidence", "release_evidence_sha256"]) requireString(next.observation[field], `observation.${field}`);
  if (next.observation.release_evidence_sha256 && !/^[0-9a-f]{64}$/.test(next.observation.release_evidence_sha256)) fail("observation.release_evidence_sha256 must be a lowercase SHA-256");
  const measurementKeys = ["id", "kind", "formula", "comparator", "target", "actual", "passed", "window_ends_at", "source", "source_artifact", "source_sha256", "measured_at", "evidence"];
  validateRecords(next.observation.measurements, "observation.measurements", measurementKeys, (record, path) => {
    for (const field of ["id", "formula", "target", "actual", "window_ends_at", "source", "source_artifact", "measured_at", "evidence"]) requireString(record[field], `${path}.${field}`, false);
    if (!["PRIMARY", "GUARDRAIL"].includes(record.kind)) fail(`${path}.kind is invalid`);
    if (!["EQ", "NE", "GT", "GTE", "LT", "LTE"].includes(record.comparator)) fail(`${path}.comparator is invalid`);
    if (typeof record.passed !== "boolean") fail(`${path}.passed must be a boolean`);
    if (!/^[0-9a-f]{64}$/.test(record.source_sha256)) fail(`${path}.source_sha256 must be a lowercase SHA-256`);
  });
  if (Array.isArray(next.observation.measurements)) {
    const ids = next.observation.measurements.map((record) => record?.id);
    if (new Set(ids).size !== ids.length) fail("observation.measurements ids must be unique");
  }
  if (requireArray(next.observation.evidence, "observation.evidence")) next.observation.evidence.forEach((item, index) => requireString(item, `observation.evidence[${index}]`, false));
}

if (requireKeys(next.terminal, "terminal", ["state", "reason", "evidence"])) {
  if (!(next.terminal.state === "" || terminalStates.includes(next.terminal.state))) fail("terminal.state is invalid");
  requireString(next.terminal.reason, "terminal.reason");
  if (requireArray(next.terminal.evidence, "terminal.evidence")) next.terminal.evidence.forEach((item, index) => requireString(item, `terminal.evidence[${index}]`, false));
}

if (Array.isArray(next.candidates)) {
  const identities = next.candidates.map((record) => `${record?.phase_id}\u0000${record?.id}`);
  if (new Set(identities).size !== identities.length) fail("candidate (phase_id, id) values must be unique");
}
for (const [field, records, identity] of [["children", next.children, "run_id"], ["external_effects", next.external_effects, "id"], ["selections", next.selections, "phase_id"]]) {
  if (!Array.isArray(records)) continue;
  const values = records.map((record) => record?.[identity]);
  if (new Set(values).size !== values.length) fail(`${field}.${identity} values must be unique`);
}

validateSelectionsAndIndependence(next);
validateSelectionArtifacts(next);
validateCandidateProducerLinks(next);

const requiresContract = ["READY", "RUNNING", "OBSERVING", "VALIDATED", "MISSED_TARGET", "BLOCKED"].includes(next.lifecycle);
if (requiresContract) {
  if (!next.run_id) fail(`${next.lifecycle} requires run_id`);
  if (!next.contract?.version) fail(`${next.lifecycle} requires contract.version`);
  if (!shaPattern.test(next.contract?.commit ?? "")) fail(`${next.lifecycle} requires contract.commit`);
  if (!Array.isArray(next.contract?.paths) || next.contract.paths.length === 0) fail(`${next.lifecycle} requires contract.paths`);
  if (Array.isArray(next.contract?.paths) && !next.contract.paths.includes(next.contract?.manifest_path)) fail("contract.paths must include contract.manifest_path");
  if (!next.contract?.verified_at) fail(`${next.lifecycle} requires contract.verified_at`);
  if (!(next.global_budget?.wall_clock_limit_seconds > 0 || next.global_budget?.turn_limit > 0)) fail(`${next.lifecycle} requires a wall-clock or turn global ceiling`);
  if (!(next.global_budget?.consecutive_no_progress_limit > 0)) fail(`${next.lifecycle} requires a positive no-progress limit`);
  validateCommittedContract(next);
  validateGitIdentities(next);
}

if (["RUNNING", "OBSERVING", "VALIDATED", "MISSED_TARGET"].includes(next.lifecycle) && !next.started_at) fail(`${next.lifecycle} requires started_at`);

if (next.lifecycle === "RUNNING") {
  if (!next.active_phase?.id || !next.active_phase?.contract_path || !shaPattern.test(next.active_phase?.contract_commit ?? "") || !next.active_phase?.evidence_path || !next.active_phase?.started_at) {
    fail("RUNNING requires a complete active phase identity");
  }
  if (!["RUNNING", "VERIFIED"].includes(next.active_phase?.status)) fail("RUNNING requires active_phase.status RUNNING or VERIFIED");
  if (!(next.active_phase?.wall_clock_limit_seconds > 0 || next.active_phase?.turn_limit > 0)) fail("active phase requires a wall-clock or turn ceiling");
}

if (next.active_phase?.id) validateActivePhaseCommit(next);
if (next.active_phase?.status === "VERIFIED") validateVerifiedPhaseEvidence(next);

if (next.lifecycle === "OBSERVING") {
  if (next.active_phase?.status !== "VERIFIED") fail("OBSERVING requires a VERIFIED active phase");
  if (!next.observation?.monitor_id) fail("OBSERVING requires observation.monitor_id");
  if (!next.observation?.next_check_at) fail("OBSERVING requires observation.next_check_at");
  if (!next.observation?.window_ends_at) fail("OBSERVING requires observation.window_ends_at");
  if (!next.observation?.release_evidence) fail("OBSERVING requires observation.release_evidence");
  if (!next.observation?.release_evidence_sha256) fail("OBSERVING requires observation.release_evidence_sha256");
  validateReleaseReadiness(next);
}

if (terminalStates.includes(next.lifecycle)) {
  if (next.terminal?.state !== next.lifecycle) fail("terminal.state must match terminal lifecycle");
  if (!next.terminal?.reason) fail("terminal lifecycle requires terminal.reason");
  if (!Array.isArray(next.terminal?.evidence) || next.terminal.evidence.length === 0) fail("terminal lifecycle requires terminal.evidence");
} else if (next.terminal?.state) {
  fail("non-terminal lifecycle must have an empty terminal.state");
}

if (["VALIDATED", "MISSED_TARGET"].includes(next.lifecycle)) {
  if (next.observation?.status !== "COMPLETE") fail(`${next.lifecycle} requires observation.status COMPLETE`);
  if (!next.observation?.window_ends_at) fail(`${next.lifecycle} requires observation.window_ends_at`);
  if (!next.observation?.monitor_id) fail(`${next.lifecycle} requires observation.monitor_id`);
  if (!Array.isArray(next.observation?.evidence) || next.observation.evidence.length === 0) fail(`${next.lifecycle} requires observation evidence`);
  validateOutcomeMeasurements(next);
  validateReleaseEvidence(next);
}

if (next.lifecycle !== "BLOCKED") {
  if (next.global_budget?.wall_clock_limit_seconds > 0 && next.global_budget.elapsed_seconds >= next.global_budget.wall_clock_limit_seconds) fail("reaching the global wall-clock limit requires lifecycle BLOCKED");
  if (next.global_budget?.turn_limit > 0 && next.global_budget.turns_used >= next.global_budget.turn_limit) fail("reaching the global turn limit requires lifecycle BLOCKED");
  if (next.global_budget?.cost_limit_usd !== null) {
    const costExhausted = next.global_budget.cost_limit_usd === 0
      ? next.global_budget.cost_used_usd > 0
      : next.global_budget.cost_used_usd >= next.global_budget.cost_limit_usd;
    if (costExhausted) fail("reaching the global cost limit requires lifecycle BLOCKED");
  }
  if (next.global_budget?.consecutive_no_progress_limit > 0 && next.global_budget.consecutive_no_progress_count >= next.global_budget.consecutive_no_progress_limit) fail("reaching the global no-progress limit requires lifecycle BLOCKED");
}

if (next.active_phase?.id && next.active_phase.status !== "VERIFIED" && next.active_phase.status !== "BLOCKED" && next.lifecycle !== "BLOCKED") {
  if (next.active_phase.wall_clock_limit_seconds > 0 && next.active_phase.elapsed_seconds >= next.active_phase.wall_clock_limit_seconds) fail("reaching the phase wall-clock limit requires a verified or blocked phase");
  if (next.active_phase.turn_limit > 0 && next.active_phase.turns_used >= next.active_phase.turn_limit) fail("reaching the phase turn limit requires a verified or blocked phase");
}

if (previous) validateTransition(previous, next);

finish();

function git(args) {
  return spawnSync("git", ["-C", resolve(repoRoot), ...args], { encoding: "utf8" });
}

function gitAt(cwd, args) {
  return spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function validateCommittedContract(state) {
  if (!shaPattern.test(state.contract?.commit ?? "") || !validRepoPath(state.contract?.manifest_path) || !Array.isArray(state.contract?.paths)) return;

  const commit = state.contract.commit;
  const commitCheck = git(["cat-file", "-e", `${commit}^{commit}`]);
  if (commitCheck.status !== 0) {
    fail(`contract.commit is not an available Git commit: ${commit}`);
    return;
  }

  const manifestResult = git(["show", `${commit}:${state.contract.manifest_path}`]);
  if (manifestResult.status !== 0) {
    fail("contract manifest does not exist at contract.commit");
    return;
  }

  const metadata = parseManifestFrontmatter(manifestResult.stdout);
  if (metadata) {
    if (metadata.status !== "APPROVED") fail("committed contract manifest status must be APPROVED");
    if (metadata.version !== state.contract.version) fail("contract.version must match the committed manifest version");
    if (metadata.execution_mode !== state.execution_mode) fail("execution_mode must match the committed manifest");
  }

  const manifestArtifacts = parseManifestArtifacts(manifestResult.stdout);
  if (manifestArtifacts) {
    const expected = [state.contract.manifest_path, ...[...manifestArtifacts.values()].map((entry) => entry.path)].sort();
    const actual = [...state.contract.paths].sort();
    if (!isDeepStrictEqual(actual, expected)) fail("contract.paths must exactly match the committed manifest");
    validateApprovedArtifacts(state, manifestArtifacts);
  }

  for (const path of state.contract.paths) {
    if (!validRepoPath(path)) continue;
    if (git(["cat-file", "-e", `${commit}:${path}`]).status !== 0) fail(`frozen contract path does not exist at contract.commit: ${path}`);
  }

  if (!snapshotOnly && state.contract.paths.every(validRepoPath) && git(["diff", "--exit-code", commit, "--", ...state.contract.paths]).status !== 0) {
    fail("frozen contract paths differ from contract.commit");
  }
}

function parseManifestFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    fail("committed contract manifest is missing required frontmatter");
    return null;
  }
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (!field) continue;
    metadata[field[1]] = field[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  for (const key of ["status", "version", "execution_mode"]) {
    if (!metadata[key]) fail(`committed contract manifest frontmatter is missing ${key}`);
  }
  return metadata;
}

function parseManifestArtifacts(markdown) {
  const sectionMatch = markdown.match(/## Frozen artifact set\s*([\s\S]*?)(?=\n## |$)/);
  if (!sectionMatch) {
    fail("committed contract manifest is missing the Frozen artifact set section");
    return null;
  }

  const roles = new Map();
  for (const line of sectionMatch[1].split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const role = cells[0].replace(/^`|`$/g, "");
    const path = cells[1].replace(/^`|`$/g, "");
    const version = cells[2].replace(/^`|`$/g, "");
    if (!/^[a-z][a-z0-9_]*$/.test(role) || !validRepoPath(path)) continue;
    if (roles.has(role)) fail(`committed contract manifest contains duplicate role: ${role}`);
    else if (!version) fail(`committed contract manifest role ${role} requires a version`);
    else roles.set(role, { path, version });
  }

  for (const role of requiredContractRoles) {
    if (!roles.has(role)) fail(`committed contract manifest is missing required role: ${role}`);
  }
  const paths = [...roles.values()].map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("committed contract manifest paths must be unique");
  return roles;
}

function parseMarkdownTable(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##+\\s+(?:\\d+\\.\\s+)?${escaped}\\s*$`).test(line));
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##+\s+/.test(line)) break;
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim().replace(/^`|`$/g, ""));
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.length > 0) rows.push(cells);
  }
  return rows.slice(1);
}

function hasUnresolvedPlaceholder(markdown) {
  return /\[(?:specific user|current behavior\/problem|observable outcome|time\/window|vertical-slice outcome|ID)\]|\b(?:TBD|TODO|FIXME)\b|\|[ \t]*\|/i.test(markdown);
}

function validateCompleteRows(markdown, heading, minimumCells, label) {
  const rows = parseMarkdownTable(markdown, heading).filter((row) => row.some(Boolean));
  if (rows.length === 0) {
    fail(`${label} requires at least one completed row`);
    return [];
  }
  for (const row of rows) {
    if (row.length < minimumCells || row.slice(0, minimumCells).some((cell) => !cell)) fail(`${label} contains an incomplete row`);
  }
  return rows;
}

function validateApprovedArtifacts(state, artifacts) {
  const contents = new Map();
  for (const [role, entry] of artifacts) {
    const result = git(["show", `${state.contract.commit}:${entry.path}`]);
    if (result.status !== 0) continue;
    contents.set(role, result.stdout);
    const metadata = parseArtifactFrontmatter(result.stdout, role);
    if (!metadata) continue;
    if (metadata.status !== "APPROVED") fail(`committed ${role} artifact status must be APPROVED`);
    if (metadata.version !== entry.version) fail(`committed ${role} artifact version must match the manifest`);
    if (hasUnresolvedPlaceholder(result.stdout)) fail(`committed ${role} artifact contains unresolved placeholders`);
    if (role === "brief") {
      validateCompleteRows(result.stdout, "Success contract", 7, "brief success contract");
      validateCompleteRows(result.stdout, "Guardrails", 4, "brief guardrails");
    } else if (role === "prd") {
      validateCompleteRows(result.stdout, "Acceptance traceability", 7, "PRD acceptance traceability");
    } else if (role === "roadmap") {
      validateCompleteRows(result.stdout, "Phases", 7, "roadmap phases");
    } else if (role === "first_phase") {
      validateCompleteRows(result.stdout, "Gate contract", 5, "first phase gate contract");
    } else if (role === "observation_monitor") {
      validateCompleteRows(result.stdout, "Outcome measurements", 9, "observation monitor measurements");
    }
  }
  const brief = contents.get("brief");
  const monitor = contents.get("observation_monitor");
  if (brief && monitor) {
    const expected = new Map();
    for (const row of validateCompleteRows(brief, "Success contract", 7, "brief success contract")) expected.set(row[0], "PRIMARY");
    for (const row of validateCompleteRows(brief, "Guardrails", 4, "brief guardrails")) expected.set(row[0], "GUARDRAIL");
    const actual = new Map(validateCompleteRows(monitor, "Outcome measurements", 9, "observation monitor measurements").map((row) => [row[0], row[1]]));
    if (!isDeepStrictEqual([...actual.keys()].sort(), [...expected.keys()].sort())) fail("observation monitor IDs must exactly match the brief KPI and guardrail IDs");
    for (const [id, kind] of expected) if (actual.get(id) !== kind) fail(`observation monitor ${id} has the wrong kind`);
  }
}

function parseArtifactFrontmatter(markdown, role) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    fail(`committed ${role} artifact is missing required frontmatter`);
    return null;
  }
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (field) metadata[field[1]] = field[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  for (const key of ["status", "version"]) if (!metadata[key]) fail(`committed ${role} artifact frontmatter is missing ${key}`);
  return metadata;
}

function readCommittedRole(state, role) {
  if (!shaPattern.test(state.contract?.commit ?? "") || !validRepoPath(state.contract?.manifest_path)) return null;
  const manifest = git(["show", `${state.contract.commit}:${state.contract.manifest_path}`]);
  if (manifest.status !== 0) return null;
  const artifacts = parseManifestArtifacts(manifest.stdout);
  const entry = artifacts?.get(role);
  if (!entry) return null;
  const artifact = git(["show", `${state.contract.commit}:${entry.path}`]);
  return artifact.status === 0 ? artifact.stdout : null;
}

function frozenRoadmapPhaseIds(state) {
  const roadmap = readCommittedRole(state, "roadmap");
  if (!roadmap) return [];
  return validateCompleteRows(roadmap, "Phases", 7, "roadmap phases").map((row) => row[0]);
}

function frozenOutcomeIds(state) {
  const brief = readCommittedRole(state, "brief");
  if (!brief) return new Map();
  const ids = new Map();
  for (const row of validateCompleteRows(brief, "Success contract", 7, "brief success contract")) ids.set(row[0], "PRIMARY");
  for (const row of validateCompleteRows(brief, "Guardrails", 4, "brief guardrails")) ids.set(row[0], "GUARDRAIL");
  return ids;
}

function frozenMeasurementContracts(state) {
  const monitor = readCommittedRole(state, "observation_monitor");
  if (!monitor) return new Map();
  return new Map(validateCompleteRows(monitor, "Outcome measurements", 9, "observation monitor measurements").map((row) => [row[0], {
    id: row[0],
    kind: row[1],
    formula: row[2],
    comparator: row[4],
    target: row[5],
    window_ends_at: row[6],
    source: row[7],
    evidence: row[8]
  }]));
}

function validateReleaseReadiness(state) {
  for (const phaseId of frozenRoadmapPhaseIds(state)) {
    const integrated = state.candidates.filter((candidate) => candidate.phase_id === phaseId && candidate.status === "INTEGRATED");
    const selections = state.selections.filter((selection) => selection.phase_id === phaseId);
    const checkpoints = state.checkpoints.filter((checkpoint) => checkpoint.phase === phaseId);
    if (integrated.length !== 1 || selections.length !== 1 || integrated[0]?.head_sha !== selections[0]?.selected_sha || checkpoints.length === 0) {
      fail(`OBSERVING requires completed integration, selection, and checkpoint evidence for roadmap phase ${phaseId}`);
    }
  }
  if (state.last_verified_gate?.result !== "PASS" || state.last_verified_gate?.tested_sha !== state.integration?.sha || !state.last_verified_gate?.evidence) {
    fail("OBSERVING requires a passing final release gate on integration.sha");
  }
  validateReleaseEvidence(state);
}

function validateOutcomeMeasurements(state) {
  const expectedKinds = frozenOutcomeIds(state);
  const expected = frozenMeasurementContracts(state);
  const actual = new Map((state.observation?.measurements ?? []).map((measurement) => [measurement.id, measurement]));
  if (!isDeepStrictEqual([...actual.keys()].sort(), [...expected.keys()].sort()) || !isDeepStrictEqual([...expectedKinds.keys()].sort(), [...expected.keys()].sort())) fail(`${state.lifecycle} measurements must exactly match the frozen KPI and guardrail IDs`);
  for (const [id, contract] of expected) {
    const measurement = actual.get(id);
    if (!measurement) continue;
    if (measurement.kind !== contract.kind || measurement.kind !== expectedKinds.get(id)) fail(`${state.lifecycle} measurement ${id} has the wrong kind`);
    for (const field of ["formula", "comparator", "target", "window_ends_at", "source", "evidence"]) {
      if (measurement[field] !== contract[field]) fail(`${state.lifecycle} measurement ${id} ${field} does not match the frozen monitor contract`);
    }
    const evidence = readRegularAuditFile(measurement.evidence, `${state.lifecycle} measurement ${id} evidence`);
    const source = readRegularAuditFile(measurement.source_artifact, `${state.lifecycle} measurement ${id} source artifact`);
    if (source && sha256Buffer(source) !== measurement.source_sha256) fail(`${state.lifecycle} measurement ${id} source_sha256 does not match the source artifact`);
    if (source) {
      try {
        const receipt = JSON.parse(source.toString("utf8"));
        if (receipt.id !== id || receipt.actual !== measurement.actual || receipt.measured_at !== measurement.measured_at || receipt.contract_commit !== state.contract?.commit || receipt.integration_sha !== state.integration?.sha) {
          fail(`${state.lifecycle} measurement ${id} source receipt does not match the measurement and run identities`);
        }
        if (!evidence || receipt.evidence_sha256 !== sha256Buffer(evidence)) fail(`${state.lifecycle} measurement ${id} source receipt does not bind the evidence artifact`);
      } catch (error) {
        fail(`${state.lifecycle} measurement ${id} source artifact is not a canonical JSON receipt: ${error.message}`);
      }
    }
    const measuredAt = Date.parse(measurement.measured_at);
    const windowEnds = Date.parse(contract.window_ends_at);
    if (!Number.isFinite(measuredAt) || !Number.isFinite(windowEnds) || measuredAt < windowEnds) fail(`${state.lifecycle} measurement ${id} must be taken at or after the frozen window end`);
    const derived = compareMeasurement(measurement.actual, contract.target, contract.comparator);
    if (derived === null) fail(`${state.lifecycle} measurement ${id} cannot apply comparator ${contract.comparator} to its values`);
    else if (measurement.passed !== derived) fail(`${state.lifecycle} measurement ${id} passed does not match the deterministic comparison`);
  }
  if (state.lifecycle === "VALIDATED" && [...actual.values()].some((measurement) => !measurement.passed)) fail("VALIDATED requires every KPI and guardrail measurement to pass");
  if (state.lifecycle === "MISSED_TARGET" && ![...actual.values()].some((measurement) => !measurement.passed)) fail("MISSED_TARGET requires at least one failed KPI or guardrail measurement");
}

function compareMeasurement(actual, target, comparator) {
  if (comparator === "EQ") return actual === target;
  if (comparator === "NE") return actual !== target;
  const actualNumber = Number(actual);
  const targetNumber = Number(target);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(targetNumber)) return null;
  if (comparator === "GT") return actualNumber > targetNumber;
  if (comparator === "GTE") return actualNumber >= targetNumber;
  if (comparator === "LT") return actualNumber < targetNumber;
  if (comparator === "LTE") return actualNumber <= targetNumber;
  return null;
}

function validateReleaseEvidence(state) {
  const evidence = readRegularAuditFile(state.observation?.release_evidence, "release evidence");
  if (!evidence) return;
  if (sha256Buffer(evidence) !== state.observation.release_evidence_sha256) fail("observation.release_evidence_sha256 does not match release evidence");
  const metadata = parseLooseFrontmatter(evidence.toString("utf8"));
  if (!metadata) {
    fail("release evidence is missing frontmatter");
    return;
  }
  if (metadata.status !== "RELEASED") fail("release evidence status must be RELEASED");
  if (metadata.release_sha !== state.integration?.sha) fail("release evidence release_sha must match integration.sha");
  if (metadata.contract_commit !== state.contract?.commit) fail("release evidence contract_commit must match contract.commit");
  if (!metadata.environment) fail("release evidence requires environment");
  if (!metadata.released_at) fail("release evidence requires released_at");
  if (metadata.outcome_status !== "OBSERVING") fail("release evidence outcome_status must be OBSERVING");
}

function parseLooseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (field) metadata[field[1]] = field[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return metadata;
}

function validateActivePhaseCommit(state) {
  if (!shaPattern.test(state.active_phase?.contract_commit ?? "") || !validRepoPath(state.active_phase?.contract_path)) return;
  const commit = state.active_phase.contract_commit;
  if (git(["cat-file", "-e", `${commit}^{commit}`]).status !== 0) {
    fail("active_phase.contract_commit is not an available Git commit");
    return;
  }
  if (git(["cat-file", "-e", `${commit}:${state.active_phase.contract_path}`]).status !== 0) fail("active phase contract does not exist at active_phase.contract_commit");
  if (shaPattern.test(state.contract?.commit ?? "") && git(["merge-base", "--is-ancestor", state.contract.commit, commit]).status !== 0) fail("active phase contract commit must descend from the frozen contract commit");
  if (!snapshotOnly && git(["diff", "--exit-code", commit, "--", state.active_phase.contract_path]).status !== 0) fail("active phase contract differs from active_phase.contract_commit");
}

function validateVerifiedPhaseEvidence(state) {
  const phaseId = state.active_phase.id;
  const integrated = Array.isArray(state.candidates)
    ? state.candidates.filter((candidate) => candidate.phase_id === phaseId && candidate.status === "INTEGRATED")
    : [];
  const selections = Array.isArray(state.selections)
    ? state.selections.filter((selection) => selection.phase_id === phaseId)
    : [];
  if (integrated.length !== 1 || selections.length !== 1 || integrated[0]?.head_sha !== selections[0]?.selected_sha) {
    fail("VERIFIED phase requires one integrated candidate and linked selection");
  }
  if (!state.integration?.sha || !state.integration?.verified_at) fail("VERIFIED phase requires a verified integration SHA");
  if (state.last_verified_gate?.tested_sha !== state.integration?.sha
    || state.last_verified_gate?.result !== "PASS"
    || !state.last_verified_gate?.name
    || !state.last_verified_gate?.evidence
    || !state.last_verified_gate?.verified_at) {
    fail("VERIFIED phase requires a passing final gate on integration.sha");
  }
}

function validateGitIdentities(state) {
  const repoTopResult = git(["rev-parse", "--show-toplevel"]);
  const repoTop = repoTopResult.status === 0 ? realpathSync(repoTopResult.stdout.trim()) : "";
  const checkoutBranchResult = git(["branch", "--show-current"]);
  const integrationBranch = state.integration?.branch || (checkoutBranchResult.status === 0 ? checkoutBranchResult.stdout.trim() : "");

  for (const candidate of Array.isArray(state.candidates) ? state.candidates : []) {
    const baseAvailable = shaPattern.test(candidate.base_sha ?? "") && git(["cat-file", "-e", `${candidate.base_sha}^{commit}`]).status === 0;
    if (!baseAvailable) fail(`candidate ${candidate.id} base_sha is not an available Git commit`);

    const headAvailable = !candidate.head_sha || (shaPattern.test(candidate.head_sha) && git(["cat-file", "-e", `${candidate.head_sha}^{commit}`]).status === 0);
    if (candidate.head_sha && !headAvailable) fail(`candidate ${candidate.id} head_sha is not an available Git commit`);

    if (baseAvailable && shaPattern.test(state.contract?.commit ?? "") && git(["merge-base", "--is-ancestor", state.contract.commit, candidate.base_sha]).status !== 0) {
      fail(`candidate ${candidate.id} base_sha must descend from contract.commit`);
    }
    if (baseAvailable && candidate.head_sha && headAvailable && git(["merge-base", "--is-ancestor", candidate.base_sha, candidate.head_sha]).status !== 0) {
      fail(`candidate ${candidate.id} head_sha must descend from base_sha`);
    }

    if (candidate.phase_id === state.active_phase?.id && candidate.base_sha !== state.active_phase.contract_commit) {
      fail(`candidate ${candidate.id} base_sha must equal the active phase candidate base`);
    }
    if (candidate.head_sha && headAvailable && ["COMPLETE", "VERIFIED", "REJECTED", "SELECTED", "INTEGRATED"].includes(candidate.status)) {
      if (Array.isArray(state.contract?.paths)
        && state.contract.paths.length > 0
        && git(["diff", "--exit-code", state.contract.commit, candidate.head_sha, "--", ...state.contract.paths]).status !== 0) {
        fail(`candidate ${candidate.id} modifies frozen contract paths`);
      }
      if (candidate.phase_id === state.active_phase?.id
        && validRepoPath(state.active_phase?.contract_path)
        && git(["diff", "--exit-code", state.active_phase.contract_commit, candidate.head_sha, "--", state.active_phase.contract_path]).status !== 0) {
        fail(`candidate ${candidate.id} modifies the active phase contract`);
      }
    }
    if (integrationBranch && candidate.branch === integrationBranch) fail(`candidate ${candidate.id} branch must differ from the integration branch`);
    if (repoTop && existsSync(candidate.worktree) && realpathSync(candidate.worktree) === repoTop) fail(`candidate ${candidate.id} worktree must be isolated from the integration checkout`);

    const requiresLiveCandidate = ["PLANNED", "RUNNING", "COMPLETE", "VERIFIED", "SELECTED"].includes(candidate.status);
    if (!snapshotOnly && requiresLiveCandidate && candidate.head_sha && headAvailable) {
      const branchHead = git(["rev-parse", "--verify", `refs/heads/${candidate.branch}^{commit}`]);
      if (branchHead.status !== 0 || branchHead.stdout.trim() !== candidate.head_sha) fail(`candidate ${candidate.id} branch does not point to head_sha`);
    }

    if (snapshotOnly || !requiresLiveCandidate) continue;
    if (!existsSync(candidate.worktree)) {
      fail(`candidate ${candidate.id} worktree does not exist`);
      continue;
    }

    const mainCommonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const candidateCommonDir = gitAt(candidate.worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (mainCommonDir.status !== 0 || candidateCommonDir.status !== 0 || resolve(mainCommonDir.stdout.trim()) !== resolve(candidateCommonDir.stdout.trim())) {
      fail(`candidate ${candidate.id} worktree does not belong to the target repository`);
      continue;
    }
    const worktreeBranch = gitAt(candidate.worktree, ["branch", "--show-current"]);
    if (worktreeBranch.status !== 0 || worktreeBranch.stdout.trim() !== candidate.branch) fail(`candidate ${candidate.id} worktree is not on its recorded branch`);
    if (candidate.head_sha) {
      const worktreeHead = gitAt(candidate.worktree, ["rev-parse", "HEAD"]);
      if (worktreeHead.status !== 0 || worktreeHead.stdout.trim() !== candidate.head_sha) fail(`candidate ${candidate.id} worktree HEAD does not equal head_sha`);
    }
    if (["COMPLETE", "VERIFIED", "SELECTED"].includes(candidate.status) && gitAt(candidate.worktree, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.trim()) {
      fail(`candidate ${candidate.id} completed worktree must be clean`);
    }
  }

  if (state.last_verified_gate?.tested_sha && git(["cat-file", "-e", `${state.last_verified_gate.tested_sha}^{commit}`]).status !== 0) {
    fail("last_verified_gate.tested_sha is not an available Git commit");
  }
  for (const [index, checkpoint] of (Array.isArray(state.checkpoints) ? state.checkpoints : []).entries()) {
    if (checkpoint.integration_sha && git(["cat-file", "-e", `${checkpoint.integration_sha}^{commit}`]).status !== 0) {
      fail(`checkpoints[${index}].integration_sha is not an available Git commit`);
    }
  }

  if (state.integration?.sha) {
    const integrationAvailable = shaPattern.test(state.integration.sha) && git(["cat-file", "-e", `${state.integration.sha}^{commit}`]).status === 0;
    if (!integrationAvailable) fail("integration.sha is not an available Git commit");
    if (!state.integration.branch) fail("integration.sha requires integration.branch");
    if (!state.integration.verified_at) fail("integration.sha requires integration.verified_at");
    if (integrationAvailable && state.integration.branch) {
      if (!snapshotOnly) {
        const branchHead = git(["rev-parse", "--verify", `refs/heads/${state.integration.branch}^{commit}`]);
        if (branchHead.status !== 0 || branchHead.stdout.trim() !== state.integration.sha) fail("integration.branch does not point to integration.sha");
      }
      if (shaPattern.test(state.contract?.commit ?? "") && git(["merge-base", "--is-ancestor", state.contract.commit, state.integration.sha]).status !== 0) fail("integration.sha must descend from contract.commit");
    }
  }

  for (const candidate of Array.isArray(state.candidates) ? state.candidates : []) {
    if (candidate.status !== "INTEGRATED") continue;
    if (!state.integration?.sha) {
      fail(`integrated candidate ${candidate.id} requires integration.sha`);
    } else if (shaPattern.test(candidate.head_sha ?? "") && shaPattern.test(state.integration.sha) && git(["merge-base", "--is-ancestor", candidate.head_sha, state.integration.sha]).status !== 0) {
      fail(`integrated candidate ${candidate.id} head_sha must be an ancestor of integration.sha`);
    }
  }
}

function validateTransition(before, after) {
  if (terminalStates.includes(before.lifecycle) && after.lifecycle === "PREFLIGHT") {
    validateRollover(before, after);
    return;
  }

  const allowed = transitions[before.lifecycle] ?? [];
  if (!allowed.includes(after.lifecycle)) fail(`invalid lifecycle transition ${before.lifecycle} -> ${after.lifecycle}`);

  if (before.execution_mode !== after.execution_mode) fail("execution_mode cannot change after state creation");
  if (before.run_id && before.run_id !== after.run_id) fail("run_id cannot change within a run");
  if (before.run_id && before.parent_run_id !== after.parent_run_id) fail("parent_run_id cannot change within a run");

  if (before.lifecycle === "NOT_READY" && after.lifecycle === "PREFLIGHT" && before.contract?.version === after.contract?.version) {
    fail("NOT_READY recovery requires a new contract version");
  }

  if (["READY", "RUNNING", "OBSERVING", ...terminalStates].includes(before.lifecycle)) {
    const oldIdentity = { version: before.contract?.version, manifest_path: before.contract?.manifest_path, commit: before.contract?.commit, paths: before.contract?.paths, verified_at: before.contract?.verified_at };
    const newIdentity = { version: after.contract?.version, manifest_path: after.contract?.manifest_path, commit: after.contract?.commit, paths: after.contract?.paths, verified_at: after.contract?.verified_at };
    if (!isDeepStrictEqual(oldIdentity, newIdentity)) fail("contract identity cannot change after RUNNING/READY");
    for (const field of ["wall_clock_limit_seconds", "turn_limit", "cost_limit_usd", "consecutive_no_progress_limit"]) {
      if (before.global_budget?.[field] !== after.global_budget?.[field]) fail(`global_budget.${field} cannot change after READY`);
    }
  }

  for (const field of ["elapsed_seconds", "turns_used", "cost_used_usd"]) {
    if ((after.global_budget?.[field] ?? 0) < (before.global_budget?.[field] ?? 0)) fail(`global_budget.${field} cannot decrease`);
  }

  const recordedProgress = hasRecordedProgress(before, after);
  const beforeNoProgress = before.global_budget?.consecutive_no_progress_count ?? 0;
  const afterNoProgress = after.global_budget?.consecutive_no_progress_count ?? 0;
  if (afterNoProgress < beforeNoProgress && !recordedProgress) fail("no-progress reset requires recorded progress evidence");
  const turnDelta = (after.global_budget?.turns_used ?? 0) - (before.global_budget?.turns_used ?? 0);
  if (turnDelta > 0 && !recordedProgress && afterNoProgress !== beforeNoProgress + turnDelta) {
    fail("each turn without recorded progress must increment the no-progress count");
  }

  if (before.failure?.class === after.failure?.class && before.failure?.class) {
    if (after.failure.count < before.failure.count) fail("failure.count cannot decrease for the same class");
    if (after.failure.count === before.failure.count && after.failure.last_evidence !== before.failure.last_evidence) {
      fail("failure.last_evidence cannot change without incrementing the same-class count");
    }
    if (after.failure.count > before.failure.count && after.failure.last_evidence === before.failure.last_evidence) {
      fail("incrementing failure.count requires new evidence");
    }
  } else if (before.failure?.class && before.failure.class !== after.failure?.class && !hasRecordedProgress(before, after)) {
    fail("failure class cannot change without recorded progress");
  }

  if (before.started_at && after.started_at !== before.started_at) fail("started_at cannot change once set");

  if (before.integration?.branch && after.integration?.branch !== before.integration.branch) fail("integration.branch cannot change once set");
  if (before.integration?.sha) {
    if (!after.integration?.sha) fail("integration.sha cannot be cleared once set");
    else if (shaPattern.test(after.integration.sha) && git(["merge-base", "--is-ancestor", before.integration.sha, after.integration.sha]).status !== 0) fail("integration.sha must move forward by ancestry");
    if (after.integration.sha === before.integration.sha && after.integration.verified_at !== before.integration.verified_at) fail("integration.verified_at cannot change without a new integration SHA");
  }

  validateActivePhaseTransition(before.active_phase, after.active_phase);
  validateCandidateTransitions(before.candidates, after.candidates);
  validateChildTransitions(before.children, after.children);
  validateStrictAppendOnly(before.selections, after.selections, "selections");
  validateStrictAppendOnly(before.external_effects, after.external_effects, "external_effects");
  validateStrictAppendOnly(before.checkpoints, after.checkpoints, "checkpoints");
  validateObservationTransition(before.observation, after.observation);

  if (terminalStates.includes(before.lifecycle) && !isDeepStrictEqual(before, after)) fail("terminal run state is immutable");
}

function validateRollover(before, after) {
  if (!before.run_id || !runIdPattern.test(before.run_id)) fail("archived run requires a valid previous run_id");
  if (!after.run_id || after.run_id === before.run_id) fail("new PREFLIGHT requires a distinct run_id");
  if (after.parent_run_id !== before.run_id) fail("new PREFLIGHT parent_run_id must link the archived run");
  if (!after.contract?.version || after.contract.version === before.contract?.version) fail("new PREFLIGHT requires a new contract version");

  const archivePath = resolve(dirname(previousPath), "runs", `${before.run_id}.json`);
  if (!existsSync(archivePath)) {
    fail(`terminal rollover requires archive: runs/${before.run_id}.json`);
  } else {
    try {
      const archived = JSON.parse(readFileSync(archivePath, "utf8"));
      if (!isDeepStrictEqual(archived, before)) fail("archived run must exactly match the previous terminal state");
    } catch (error) {
      fail(`cannot read archived run: ${error.message}`);
    }
  }

  for (const field of ["elapsed_seconds", "turns_used", "cost_used_usd", "consecutive_no_progress_count"]) {
    if (after.global_budget?.[field] !== 0) fail(`new PREFLIGHT must reset ${field}; prior consumption stays in the archive`);
  }
  for (const field of ["candidates", "children", "selections", "external_effects", "checkpoints"]) {
    if (!Array.isArray(after[field]) || after[field].length !== 0) fail(`new PREFLIGHT must start with an empty ${field} ledger`);
  }
  if (after.started_at) fail("new PREFLIGHT must have an empty started_at");
  if (after.contract?.commit || after.contract?.verified_at || !Array.isArray(after.contract?.paths) || after.contract.paths.length !== 0) fail("new PREFLIGHT must start with an unverified contract identity");
  const emptyPhase = { id: "", status: "", contract_path: "", contract_commit: "", evidence_path: "", started_at: "", wall_clock_limit_seconds: 0, turn_limit: 0, elapsed_seconds: 0, turns_used: 0 };
  if (!isDeepStrictEqual(after.active_phase, emptyPhase)) fail("new PREFLIGHT must reset active_phase");
  if (!isDeepStrictEqual(after.last_verified_gate, { name: "", tested_sha: "", result: "", evidence: "", verified_at: "" })) fail("new PREFLIGHT must reset last_verified_gate");
  if (!isDeepStrictEqual(after.failure, { class: "", count: 0, last_evidence: "" })) fail("new PREFLIGHT must reset failure");
  if (!isDeepStrictEqual(after.integration, { branch: "", sha: "", verified_at: "" })) fail("new PREFLIGHT must reset integration");
  if (!isDeepStrictEqual(after.observation, { status: "", window_ends_at: "", next_check_at: "", monitor_id: "", release_evidence: "", release_evidence_sha256: "", measurements: [], evidence: [] })) fail("new PREFLIGHT must reset observation");
  if (!isDeepStrictEqual(after.terminal, { state: "", reason: "", evidence: [] })) fail("new PREFLIGHT must reset terminal details");
}

function hasRecordedProgress(before, after) {
  const integrationAdvanced = shaPattern.test(after.integration?.sha ?? "")
    && after.integration.sha !== before.integration?.sha
    && (!before.integration?.sha || git(["merge-base", "--is-ancestor", before.integration.sha, after.integration.sha]).status === 0)
    && git(["cat-file", "-e", `${after.integration.sha}^{commit}`]).status === 0;
  const verifiedProgress = integrationAdvanced
    && after.last_verified_gate?.result === "PASS"
    && after.last_verified_gate?.tested_sha === after.integration.sha
    && Boolean(after.last_verified_gate?.verified_at)
    && Boolean(after.last_verified_gate?.evidence);
  const checkpointProgress = Array.isArray(before.checkpoints) && Array.isArray(after.checkpoints) && after.checkpoints.slice(before.checkpoints.length).some((checkpoint) =>
    integrationAdvanced
    &&
    Boolean(checkpoint.at)
    && Boolean(checkpoint.step)
    && Boolean(checkpoint.next_action)
    && [before.active_phase?.id, after.active_phase?.id].includes(checkpoint.phase)
    && Array.isArray(checkpoint.evidence)
    && checkpoint.evidence.length > 0
    && checkpoint.integration_sha === after.integration.sha);
  const phaseProgress = before.active_phase?.status !== "VERIFIED" && after.active_phase?.status === "VERIFIED";
  return verifiedProgress || checkpointProgress || phaseProgress;
}

function validateObservationTransition(before, after) {
  if (!isObject(before) || !isObject(after)) return;
  const allowed = {
    "": ["", "SCHEDULED", "RUNNING"],
    SCHEDULED: ["SCHEDULED", "RUNNING", "COMPLETE", "FAILED"],
    RUNNING: ["RUNNING", "COMPLETE", "FAILED"],
    COMPLETE: ["COMPLETE"],
    FAILED: ["FAILED"]
  };
  if (!(allowed[before.status] ?? []).includes(after.status)) fail(`invalid observation transition ${before.status} -> ${after.status}`);
  for (const field of ["monitor_id", "window_ends_at", "release_evidence", "release_evidence_sha256"]) {
    if (before[field] && after[field] !== before[field]) fail(`observation.${field} cannot change once set`);
  }
  validateStrictAppendOnly(before.measurements, after.measurements, "observation.measurements");
  validateStrictAppendOnly(before.evidence, after.evidence, "observation.evidence");
}

function validateActivePhaseTransition(before, after) {
  if (!isObject(before) || !isObject(after)) return;
  if (!before.id && !after.id) return;
  if (before.id && !after.id) {
    fail("active phase cannot be deleted");
    return;
  }
  if (!before.id) return;

  if (before.id !== after.id) {
    if (before.status !== "VERIFIED") fail("a new active phase requires the previous phase to be VERIFIED");
    if (!["PLANNED", "RUNNING"].includes(after.status)) fail("a new active phase must start PLANNED or RUNNING");
    return;
  }

  const identityFields = ["id", "contract_path", "contract_commit", "evidence_path", "started_at", "wall_clock_limit_seconds", "turn_limit"];
  if (identityFields.some((field) => before[field] !== after[field])) fail("active phase contract identity cannot change");
  for (const field of ["elapsed_seconds", "turns_used"]) {
    if ((after[field] ?? 0) < (before[field] ?? 0)) fail(`active_phase.${field} cannot decrease`);
  }
  if (!(phaseTransitions[before.status] ?? []).includes(after.status)) fail(`invalid active phase transition ${before.status} -> ${after.status}`);
}

function validateCandidateTransitions(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) return;
  if (after.length < before.length) fail("candidates records cannot be deleted");
  for (let index = 0; index < Math.min(before.length, after.length); index += 1) {
    const oldRecord = before[index];
    const newRecord = after[index];
    if (oldRecord.id !== newRecord.id) {
      fail("candidates records cannot be reordered or replaced");
      continue;
    }
    for (const field of ["phase_id", "id", "worktree", "branch", "base_sha", "owner", "requested_model"]) {
      if (oldRecord[field] !== newRecord[field]) fail(`candidate ${oldRecord.id} identity field ${field} cannot change`);
    }
    if (oldRecord.producer_run_id && oldRecord.producer_run_id !== newRecord.producer_run_id) fail(`candidate ${oldRecord.id} producer_run_id cannot change once set`);
    if (oldRecord.head_sha && oldRecord.head_sha !== newRecord.head_sha) fail(`candidate ${oldRecord.id} head_sha cannot change once set`);
    if (oldRecord.final_model && oldRecord.final_model !== newRecord.final_model) fail(`candidate ${oldRecord.id} final_model cannot change once set`);
    if (["COMPLETE", "VERIFIED", "SELECTED"].includes(oldRecord.status) && oldRecord.evidence !== newRecord.evidence) fail(`candidate ${oldRecord.id} evidence cannot change after completion`);
    validateArrayPrefix(oldRecord.attempted_models, newRecord.attempted_models, `candidate ${oldRecord.id} attempted_models`);
    if (!(candidateTransitions[oldRecord.status] ?? []).includes(newRecord.status)) fail(`invalid candidate transition ${oldRecord.status} -> ${newRecord.status}`);
    if (["FAILED", "REJECTED", "INTEGRATED"].includes(oldRecord.status) && !isDeepStrictEqual(oldRecord, newRecord)) fail(`terminal candidate ${oldRecord.id} is immutable`);
  }
  for (let index = before.length; index < after.length; index += 1) {
    if (after[index].status !== "PLANNED") fail(`new candidate ${after[index].id} must start PLANNED`);
  }
}

function validateChildTransitions(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) return;
  if (after.length < before.length) fail("children records cannot be deleted");
  for (let index = 0; index < Math.min(before.length, after.length); index += 1) {
    const oldRecord = before[index];
    const newRecord = after[index];
    if (oldRecord.run_id !== newRecord.run_id) {
      fail("children records cannot be reordered or replaced");
      continue;
    }
    for (const field of ["phase_id", "run_id", "agent", "requested_model", "cwd", "started_at"]) {
      if (oldRecord[field] !== newRecord[field]) fail(`child ${oldRecord.run_id} identity field ${field} cannot change`);
    }
    if (oldRecord.final_model && oldRecord.final_model !== newRecord.final_model) fail(`child ${oldRecord.run_id} final_model cannot change once set`);
    validateArrayPrefix(oldRecord.attempted_models, newRecord.attempted_models, `child ${oldRecord.run_id} attempted_models`);
    if (!(childTransitions[oldRecord.status] ?? []).includes(newRecord.status)) fail(`invalid child transition ${oldRecord.status} -> ${newRecord.status}`);
    if (["COMPLETE", "FAILED"].includes(oldRecord.status) && !isDeepStrictEqual(oldRecord, newRecord)) fail(`terminal child ${oldRecord.run_id} is immutable`);
  }
  for (let index = before.length; index < after.length; index += 1) {
    if (!["QUEUED", "RUNNING"].includes(after[index].status)) fail(`new child ${after[index].run_id} must start QUEUED or RUNNING`);
  }
}

function validateArrayPrefix(before, after, label) {
  if (!Array.isArray(before) || !Array.isArray(after) || after.length < before.length || !before.every((item, index) => isDeepStrictEqual(item, after[index]))) {
    fail(`${label} is append-only`);
  }
}

function validateStrictAppendOnly(before, after, label) {
  if (!Array.isArray(before) || !Array.isArray(after)) return;
  if (after.length < before.length || !before.every((record, index) => isDeepStrictEqual(record, after[index]))) fail(`${label} records are append-only`);
}

function canonicalModel(model) {
  return String(model).replace(/:(?:off|minimal|low|medium|high|xhigh)$/i, "");
}

function modelFamily(model) {
  const name = canonicalModel(model).toLowerCase().split("/").at(-1);
  for (const family of ["claude", "gpt", "grok", "gemini", "llama", "mistral", "qwen", "deepseek"]) {
    if (name.startsWith(family)) return family;
  }
  return name.split("-")[0];
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveAuditPath(path) {
  if (typeof path !== "string" || !path) return null;
  if (isAbsolute(path)) return resolve(path) === path ? path : null;
  return validRepoPath(path) ? resolve(repoRoot, path) : null;
}

function readRegularAuditFile(path, label) {
  const absolute = resolveAuditPath(path);
  if (!absolute || !existsSync(absolute)) {
    fail(`${label} does not exist`);
    return null;
  }
  try {
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`${label} must be a regular non-symlink file`);
      return null;
    }
    return readFileSync(absolute);
  } catch (error) {
    fail(`${label} cannot be read: ${error.message}`);
    return null;
  }
}

function validateSelectionArtifacts(state) {
  if (!Array.isArray(state.selections) || !Array.isArray(state.children)) return;
  for (const selection of state.selections) {
    if (!validRepoPath(selection.evidence)) {
      fail(`selection ${selection.phase_id} evidence must be a safe repository-relative path`);
      continue;
    }
    const evidenceDirectory = dirname(selection.evidence);
    const manifestPath = evidenceDirectory === "." ? "manifest.json" : `${evidenceDirectory}/manifest.json`;
    const manifest = readRegularAuditFile(manifestPath, `selection ${selection.phase_id} sanitized manifest`);
    if (manifest && sha256Buffer(manifest) !== selection.input_manifest_sha) fail(`selection ${selection.phase_id} input_manifest_sha does not match the sanitized manifest`);

    const receiptBuffer = readRegularAuditFile(selection.evidence, `selection ${selection.phase_id} receipt`);
    if (!receiptBuffer) continue;
    let receipt;
    try {
      receipt = JSON.parse(receiptBuffer.toString("utf8"));
    } catch (error) {
      fail(`selection ${selection.phase_id} receipt is invalid JSON: ${error.message}`);
      continue;
    }
    for (const [field, expected] of [["phase_id", selection.phase_id], ["evaluator_run_id", selection.evaluator_run_id], ["selected_sha", selection.selected_sha], ["input_manifest_sha", selection.input_manifest_sha]]) {
      if (receipt[field] !== expected) fail(`selection ${selection.phase_id} receipt ${field} does not match state`);
    }
    if (!isDeepStrictEqual(receipt.candidate_shas, selection.candidate_shas)) fail(`selection ${selection.phase_id} receipt candidate_shas do not match state`);

    const evaluator = state.children.find((child) => child.run_id === selection.evaluator_run_id);
    if (!evaluator) continue;
    if (receipt.evaluator_artifact !== evaluator.artifact || !/^[0-9a-f]{64}$/.test(receipt.evaluator_artifact_sha256 ?? "")) {
      fail(`selection ${selection.phase_id} receipt must bind the evaluator artifact`);
      continue;
    }
    const artifact = readRegularAuditFile(evaluator.artifact, `selection ${selection.phase_id} evaluator artifact`);
    if (!artifact) continue;
    if (sha256Buffer(artifact) !== receipt.evaluator_artifact_sha256) fail(`selection ${selection.phase_id} evaluator artifact hash does not match the receipt`);
    try {
      const metadata = JSON.parse(artifact.toString("utf8"));
      if (metadata.runId !== evaluator.run_id || metadata.agent !== evaluator.agent || metadata.exitCode !== 0 || metadata.model !== evaluator.final_model || !isDeepStrictEqual(metadata.attemptedModels, evaluator.attempted_models)) {
        fail(`selection ${selection.phase_id} evaluator metadata does not match the child ledger`);
      }
    } catch (error) {
      fail(`selection ${selection.phase_id} evaluator artifact is invalid JSON: ${error.message}`);
    }
  }
}

function validateSelectionsAndIndependence(state) {
  if (!Array.isArray(state.children) || !Array.isArray(state.candidates) || !Array.isArray(state.selections)) return;

  for (const child of state.children.filter((record) => record.agent === "blind-evaluator" && record.status === "COMPLETE")) {
    const candidateFamilies = new Set(state.candidates.filter((candidate) => candidate.phase_id === child.phase_id && candidate.final_model).map((candidate) => modelFamily(candidate.final_model)));
    if (child.final_model && candidateFamilies.has(modelFamily(child.final_model))) fail("completed blind evaluator must use a different actual model family from every candidate owner");
  }

  for (const selection of state.selections) {
    if (!Array.isArray(selection.candidate_shas)) continue;
    const allPhaseCandidates = state.candidates.filter((candidate) => candidate.phase_id === selection.phase_id);
    if (allPhaseCandidates.some((candidate) => ["PLANNED", "RUNNING", "COMPLETE"].includes(candidate.status))) {
      fail(`selection ${selection.phase_id} requires every candidate to be resolved as VERIFIED, REJECTED, SELECTED, INTEGRATED, or FAILED`);
    }
    const phaseCandidates = allPhaseCandidates.filter((candidate) => ["VERIFIED", "REJECTED", "SELECTED", "INTEGRATED"].includes(candidate.status));
    const expectedShas = phaseCandidates.map((candidate) => candidate.head_sha).sort();
    const recordedShas = [...selection.candidate_shas].sort();
    if (!isDeepStrictEqual(expectedShas, recordedShas)) fail(`selection ${selection.phase_id} candidate_shas must exactly match the evaluated phase candidates`);

    const selectedCandidates = phaseCandidates.filter((candidate) => candidate.head_sha === selection.selected_sha && ["VERIFIED", "SELECTED", "INTEGRATED"].includes(candidate.status));
    if (selectedCandidates.length !== 1) fail(`selection ${selection.phase_id} selected_sha must identify exactly one verified candidate`);

    const evaluator = state.children.find((child) => child.run_id === selection.evaluator_run_id);
    const allowedEvaluatorAgents = phaseCandidates.length === 1 ? ["reviewer", "blind-evaluator"] : ["blind-evaluator"];
    if (!evaluator || evaluator.phase_id !== selection.phase_id || !allowedEvaluatorAgents.includes(evaluator.agent) || evaluator.status !== "COMPLETE") {
      fail(`selection ${selection.phase_id} evaluator must be COMPLETE for the same phase`);
    } else {
      if (!Array.isArray(evaluator.attempted_models) || evaluator.attempted_models.length !== 1) fail(`selection ${selection.phase_id} blind evaluator must have no fallback attempts`);
      const candidateFamilies = new Set(phaseCandidates.filter((candidate) => candidate.final_model).map((candidate) => modelFamily(candidate.final_model)));
      if (candidateFamilies.has(modelFamily(evaluator.final_model))) fail(`selection ${selection.phase_id} evaluator must use a different actual model family`);
    }
  }

  const decisivePhases = new Set(state.candidates.filter((candidate) => ["SELECTED", "INTEGRATED"].includes(candidate.status)).map((candidate) => candidate.phase_id));
  for (const phaseId of decisivePhases) {
    const records = state.selections.filter((selection) => selection.phase_id === phaseId);
    if (records.length !== 1) fail("candidate selection requires an immutable linked selection record");
    const decisive = state.candidates.filter((candidate) => candidate.phase_id === phaseId && ["SELECTED", "INTEGRATED"].includes(candidate.status));
    if (decisive.length !== 1 || (records[0] && decisive[0]?.head_sha !== records[0].selected_sha)) fail(`phase ${phaseId} must have exactly one selected/integrated candidate matching the selection record`);
  }
}

function validateCandidateProducerLinks(state) {
  if (!Array.isArray(state.candidates) || !Array.isArray(state.children)) return;
  for (const candidate of state.candidates) {
    if (candidate.status === "PLANNED" && !candidate.producer_run_id) continue;
    if (!candidate.producer_run_id) {
      fail(`candidate ${candidate.phase_id}/${candidate.id} requires producer_run_id`);
      continue;
    }

    const producer = state.children.find((child) => child.run_id === candidate.producer_run_id);
    if (!producer) {
      fail(`candidate ${candidate.phase_id}/${candidate.id} producer_run_id does not identify a child`);
      continue;
    }
    if (producer.phase_id !== candidate.phase_id) fail(`candidate ${candidate.phase_id}/${candidate.id} producer must belong to the same phase`);
    if (producer.agent !== "worker") fail(`candidate ${candidate.phase_id}/${candidate.id} producer must use the worker agent`);
    if (producer.cwd !== candidate.worktree) fail(`candidate ${candidate.phase_id}/${candidate.id} producer cwd must equal the candidate worktree`);
    if (producer.requested_model !== candidate.requested_model) fail(`candidate ${candidate.phase_id}/${candidate.id} requested_model must match its producer`);
    if (!isDeepStrictEqual(producer.attempted_models, candidate.attempted_models)) fail(`candidate ${candidate.phase_id}/${candidate.id} attempted_models must match its producer`);
    if (producer.final_model !== candidate.final_model) fail(`candidate ${candidate.phase_id}/${candidate.id} final_model must match its producer`);

    if (["COMPLETE", "VERIFIED", "REJECTED", "SELECTED", "INTEGRATED"].includes(candidate.status) && producer.status !== "COMPLETE") {
      fail(`candidate ${candidate.phase_id}/${candidate.id} ${candidate.status} requires a COMPLETE producer child`);
    }
    if (candidate.status === "FAILED" && producer.status !== "FAILED") fail(`candidate ${candidate.phase_id}/${candidate.id} FAILED requires a FAILED producer child`);
    if (candidate.status === "RUNNING" && !["QUEUED", "RUNNING", "NEEDS_ATTENTION", "PAUSED", "COMPLETE"].includes(producer.status)) {
      fail(`candidate ${candidate.phase_id}/${candidate.id} RUNNING has an incompatible producer status`);
    }
  }
}

function finish() {
  if (errors.length > 0) {
    for (const error of [...new Set(errors)]) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`${nextPath}: valid product-loop run state`);
}
