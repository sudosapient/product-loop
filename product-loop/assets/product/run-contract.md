---
status: DRAFT
version: "0.1"
execution_mode: autonomous
created_at: ""
owner: ""
---

# Immutable autonomous run contract

This manifest and every path below are frozen by one baseline Git commit before kickoff. The canonical identity is the full commit returned by `git rev-parse HEAD` after committing the complete set. Store that value as `contract.commit` in `.loop/run-state.json`; do not write it back into this manifest. Store `product/run-contract.md` itself plus every table path in `contract.paths`.

## Frozen artifact set

List exact repository-relative paths. The set must include the brief, PRD, technical specification, roadmap, product-specific observation monitor contract, and first phase contract. Keep the `ux` row only when the product has a user-facing interaction; for non-user-facing work, delete that row and record the `not applicable` rationale in the technical specification instead of creating a ceremonial UX file.

| Role | Path | Version | Purpose |
|---|---|---|---|
| `brief` | `product/00-brief.md` |  | KPI, authority, budgets, decision policy |
| `prd` | `product/01-prd.md` |  | Scope, requirements, acceptance, instrumentation |
| `tech_spec` | `product/02-tech-spec.md` |  | Simplest viable design, verification, rollback |
| `ux` | `product/03-ux-flow.md` |  | User-visible flow, states, accessibility, copy, and rubric |
| `roadmap` | `product/04-roadmap.md` |  | Frozen phase outcomes, dependencies, and ceilings |
| `observation_monitor` | `product/observation/monitor-contract.md` |  | KPI queries, durable scheduler, least privilege, and terminal result rule |
| `first_phase` | `product/phases/P1-contract.md` |  | First executable phase contract |

## Contract verification

Before resume, any external effect, or release:

1. Resolve `contract.commit` from `.loop/run-state.json` as a full Git commit.
2. Confirm the commit exists with `git cat-file -e "$contract_commit^{commit}"`.
3. Compare this manifest and every listed path against that commit with `git diff --exit-code "$contract_commit" -- <contract.paths...>`.
4. Confirm the active phase evidence points to a phase contract committed before that phase started.
5. On mismatch, stop mutation and record `BLOCKED`; never silently refresh the baseline.

Later phase contracts may be derived at phase boundaries only within this frozen roadmap, PRD, authority envelope, decision policy, and global budgets. Commit each later contract before its first mutation and record its full commit separately in run state/evidence. Any expansion starts a new contract version and a new preflight.

## Kickoff gate

- [ ] Every frozen artifact is `APPROVED` and contains no placeholders or unresolved material decision.
- [ ] First phase entry criteria and exact gates are executable.
- [ ] An empty `product/phases/P1-evidence.md` seed is included in the same baseline commit but is intentionally absent from the frozen-path table so candidates can update it.
- [ ] Commit/worktree authority is granted and the integration base is clean.
- [ ] Required environments, credentials, rollback path, approved observation monitor contract, stable scheduler/job ID, and successful test-wake evidence exist.
- [ ] `.loop/run-state.json` records this artifact set, the full contract commit, budgets, and lifecycle `READY` before it changes to `RUNNING`.
