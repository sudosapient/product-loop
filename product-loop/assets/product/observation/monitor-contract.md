---
status: DRAFT
version: "0.1"
run_id: ""
contract_version: ""
release_sha: ""
environment: ""
monitor_id: ""
scheduler_kind: ""
owner: ""
timezone: UTC
updated: ""
---

# Product observation monitor contract

Freeze this product-specific contract before autonomous kickoff. It defines how a released product is observed and how the parent is durably resumed without a routine human prompt. Store credentials only in the scheduler's secret store; never put secret values here.

## 1. Outcome measurements

Every row maps to a frozen KPI or guardrail in the approved brief/PRD. The query must be read-only and reproducible.

| KPI / guardrail ID | Kind (`PRIMARY`/`GUARDRAIL`) | Exact formula or binary condition | Baseline | Comparator (`EQ`/`NE`/`GT`/`GTE`/`LT`/`LTE`) | Target | Window closes at | Read-only data source / query | Evidence artifact |
|---|---|---|---:|---|---:|---|---|---|
| KPI-1 | PRIMARY |  |  |  |  |  |  |  |

## 2. Result rule

- `VALIDATED` rule: every primary target is met and every guardrail holds.
- `MISSED_TARGET` rule: the window is complete and at least one primary target or guardrail fails.
- Minimum sample/completeness rule:
- Late, missing, partial, or contradictory data rule:
- Named preauthorized evaluator for any inherently subjective interpretation:

Do not treat missing data as a pass. If the frozen window cannot be evaluated after the bounded retry policy, end `BLOCKED` with the missing-data evidence unless the contract explicitly defines another deterministic result.

## 3. Durable scheduler and resume command

| Field | Frozen value |
|---|---|
| Scheduler provider / job ID (`monitor_id`) |  |
| Scheduler configuration path or external record |  |
| Cadence and first due time (UTC) |  |
| Exact resume entrypoint | `<skill-root>/assets/observation/observation-resume.sh` |
| Persistent repository/state path |  |
| Session/log path | `.loop/pi-sessions`, `.loop/logs/observation-*` |
| Concurrency lock | `.loop/locks/observation-resume.lock` |
| Stale-lock threshold (greater than maximum continuation runtime) |  |
| Scheduler service account / runtime identity |  |
| Last test-wake time and evidence |  |
| Expected next check after release |  |

The scheduler must invoke the resume entrypoint in a runtime that preserves the repository, `.loop/run-state.json`, Pi sessions, and logs across invocations. A terminal multiplexer or a still-open laptop is not a durable scheduler.

## 4. Authority and least privilege

| Capability | Allowed target / limit | Credential reference | Required? |
|---|---|---|---|
| Read product telemetry |  |  | yes |
| Read deployment/release metadata |  |  | as needed |
| Write `.loop/run-state.json` and local evidence | This run only | local filesystem | yes |
| Send notifications |  |  | optional |
| Deploy, migrate, modify product data, merge, or broaden scope | prohibited during observation | none | no |

- Network allowlist / egress boundary:
- Secret-store path names, never values:
- Data privacy/retention limits:
- OS/container isolation used by the scheduled continuation:
- Trusted-project review evidence, or contained untrusted-execution route:

## 5. Idempotency, locking, and recovery

- Lock acquisition is atomic and a second invocation exits without mutation.
- A check before `observation.next_check_at` exits successfully without launching Pi.
- The measurement query is safe to repeat and identifies its window explicitly.
- Evidence filenames include the run ID and observation timestamp/window.
- The parent validates the current snapshot before work and every proposed transition before atomic replacement.
- Maximum transient retries / backoff:
- Scheduler delivery-lag threshold:
- Stale-lock threshold/recovery (`PRODUCT_LOOP_LOCK_STALE_SECONDS`, greater than the scheduler job timeout):
- Provider outage fallback permitted by the frozen authority envelope:
- Condition that ends the run `BLOCKED`:

## 6. Evidence and terminal output

For each observation, write an immutable report containing:

- run ID, contract commit, release SHA, environment, monitor ID, and observed window;
- KPI/guardrail IDs, exact query/formula, raw source reference, actual value, target, and pass/fail;
- query timestamp, data completeness/freshness, executor identity, and retry history;
- the deterministic aggregate verdict and any preauthorized evaluator result; and
- the next check or terminal transition proposed.

Append the report path to `observation.evidence`. A terminal transition also records it in `terminal.evidence`. Never put raw credentials or unrestricted sensitive data into the report.

## 7. Readiness and test-wake gate

- [ ] Every frozen KPI and guardrail maps to one executable read-only measurement.
- [ ] Result, missing-data, and window-completion rules are deterministic or name the preauthorized evaluator.
- [ ] The scheduler job exists and its stable ID is recorded.
- [ ] Persistent state/session/log storage survives a fresh scheduler invocation.
- [ ] The runtime has only the minimum telemetry and local-state permissions; product mutation authority is absent.
- [ ] A test wake acquired/released the lock, validated state, honored `next_check_at`, launched the reviewed continuation when due, and preserved logs.
- [ ] Retry, stale-lock, provider-outage, and terminal `BLOCKED` behavior were exercised or safely simulated.
- [ ] The decommission rule removes the scheduled job and credentials after a terminal run without deleting run evidence.

Do not set this artifact to `APPROVED` or enter autonomous `READY` until every applicable item passes.
