---
status: DRAFT
execution_mode: supervised
contract_version: "0.1"
version: "0.1"
owner: ""
updated: ""
---

# Product brief

## One-sentence outcome

For **[specific user]**, change **[current behavior/problem]** to **[observable outcome]** by **[time/window]**.

## Evidence of the problem

- Source:
- What was observed:
- Confidence / unknowns:

## Success contract

| ID | Measure or binary condition | Baseline | Target | Window | Data source | Owner |
|---|---|---:|---:|---|---|---|
| KPI-1 |  |  |  |  |  |  |

If the baseline is unknown, write `unknown—measure in Phase 0`; do not guess.

## Guardrails

| ID | Must not regress | Threshold | Measurement |
|---|---|---:|---|
| G-1 |  |  |  |

## Acceptance signal

- Reproducible product/technical check:
- Subjective decision and named approver, if any:

## Constraints and non-goals

- Constraint:
- Explicit non-goal:

## Execution contract

- Mode: `supervised` or `autonomous`
- Maximum run/phase wall time or turns:
- Consecutive no-progress threshold:
- Cost ceiling, or `none—record actual`:
- Target environments in order:
- Allowed reversible defaults:
- Decisions that must be resolved before autonomous kickoff:
- Observation monitor contract path, scheduler/job ID, and test-wake evidence:
- Transient-failure retry/backoff policy:
- Health, rollout, and rollback thresholds:
- Delivery milestone: `RELEASED`; lifecycle then `OBSERVING`
- Terminal run states: `VALIDATED`, `MISSED_TARGET`, or evidence-backed `BLOCKED`
- Immutable manifest path: `product/run-contract.md`
- Mutable state path: `.loop/run-state.json` (outside the integration diff)

### Frozen autonomous decision policy

| Decision class | Rule/default | Evidence source | Evaluator | Outside-contract action |
|---|---|---|---|---|
| Product scope |  |  |  | `BLOCKED` |
| UX/copy |  |  |  | `BLOCKED` |
| Architecture/dependency |  |  |  | `BLOCKED` |
| Privacy/security |  |  |  | `BLOCKED` |
| Release/rollback |  |  |  | `BLOCKED` |

## Authority envelope

Use `allowed`, `not allowed`, or `approval required`. Cite the user request or repository policy that grants it.

| Action | Authority | Target/limits | Source/approver |
|---|---|---|---|
| Local edits and tests |  |  |  |
| Commits, branches, and worktrees |  |  |  |
| Dependency install / network reads |  |  |  |
| Push, open PR, or merge PR |  |  |  |
| External data write or message |  |  |  |
| Database/schema migration |  |  |  |
| Staging deployment |  |  |  |
| Secret/credential access |  |  |  |
| Production deployment |  | Exact target plus health/rollback limits required for autonomous mode | Named human in supervised mode; explicit kickoff grant in autonomous mode |

An autonomous run may enter `RUNNING` only when every required action is `allowed` within exact limits. `Approval required` means `NOT_READY` for that action; it must not become a mid-run prompt.

## Readiness gate

- [ ] Specific user and problem are named.
- [ ] Outcome is observable.
- [ ] Primary target, window, data source, and owner exist.
- [ ] Guardrails and acceptance method exist.
- [ ] Unknown baseline has a measurement phase.
- [ ] Material constraints/non-goals are explicit.
- [ ] Authority is explicit before any commit, remote write, migration, or deployment.
- [ ] Execution mode, ceilings, no-progress rule, decision defaults, retry policy, terminal states, and rollback thresholds are frozen.
- [ ] Every required credential/environment exists, or the missing item is recorded and lifecycle is `NOT_READY`.
- [ ] The product-specific observation monitor contract is approved and its durable scheduled wake was tested with least-privilege credentials.
- [ ] `product/run-contract.md` lists the immutable artifact set and first phase contract.
- [ ] `.loop/run-state.json` exists and records the full baseline contract commit before autonomous kickoff.

Do not set this artifact to `APPROVED` or let run state enter `READY`/`RUNNING` until all applicable items pass. After the manifest/artifact set is committed, do not mutate this file inside that autonomous run.
