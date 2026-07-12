---
name: product-loop
description: Orchestrate a measurable product from an incomplete idea or PRD through specification, UX, implementation, independent verification, worktree evaluation, integration, release, and KPI observation. Use for new products, MVPs, multi-phase features, or requests to run an autonomous/Ralph-style development loop from PRD to a working product.
---

# Product Loop

Run a bounded, evidence-driven delivery state machine. Treat files and git as durable memory. Do not treat repeated prompting, a completion phrase, or an agent's confidence as proof of completion. Support both `supervised` execution and an explicitly requested `autonomous` mode.

## Enforce the non-negotiables

- Refuse to implement an abstract outcome. Require a named user/problem, observable outcome, metric or binary success condition, target, measurement method, and acceptance test. A small technical task may use a binary check; do not invent a vanity KPI.
- Do not enter `RUNNING` until preflight has frozen the success contract, constraints, decision defaults, authority envelope, budgets, target environment, rollback rules, and terminal conditions. An incomplete run remains `PREFLIGHT`/`NOT_READY`; this is not a mid-run interruption.
- Inspect the relevant repository and code path before proposing architecture.
- After inspection and before implementation, invoke the Ponytail skill in full mode when available. Otherwise apply its portable ladder: remove needless scope; reuse existing code; prefer standard-library, native-platform, and installed-dependency solutions; add the smallest safe implementation only after those fail.
- Never simplify away trust-boundary validation, data-loss protection, security, accessibility, error handling, or a useful smoke test.
- Use deterministic checks before model judgment. Use an independent reviewer for semantic or subjective gates; do not let the implementer be the only evaluator.
- Use an isolated git worktree for every implementation candidate. Keep the integration checkout clean. Create multiple candidates only when their expected decision value exceeds their cost.
- Bound every loop by a wall-clock or turn ceiling plus a consecutive-no-progress rule. After three failures of the same class, stop repeating that approach and escalate model/technique or redesign inside the frozen contract; mark `BLOCKED` only after safe alternatives or the global ceiling are exhausted.
- Preserve user changes. Never force-remove a worktree, discard uncommitted work, weaken tests, or change an approved requirement merely to make a gate pass.
- In `supervised` mode, pause for human judgment at product-scope approval, material UX choices, destructive or irreversible actions, sensitive permissions/data, production release, and changed acceptance criteria.
- In `autonomous` mode, gather or resolve those decisions during preflight and then run without routine questions or approval pauses. Use only frozen decision rules and granted authority; never invent credentials, permissions, product policy, or consent. A hard external/safety block may end the run as `BLOCKED` with evidence, but it is never reported as success.

## Start or resume

1. Inspect the repository, git status, existing instructions, available tools/models, test commands, deployment boundary, and authority granted by the user's request or established workflow. When Product Loop CLI is available, run `product-loop models` so routing reflects the live proxy rather than a stale list. Record the authority envelope in `product/00-brief.md` before any commit, remote write, migration, or deployment.
2. Read [protocol.md](references/protocol.md). For an existing run, resume at the earliest missing, stale, or non-terminal artifact: planning artifacts end at `APPROVED`, phase/review artifacts at `VERIFIED`, delivery at `RELEASED`, and outcome at `VALIDATED` or `MISSED_TARGET` after `OBSERVING`.
3. Set `execution_mode` to `autonomous` only when the user/PRD explicitly requests hands-off execution; otherwise use `supervised`. Track run lifecycle separately as `PREFLIGHT`, `NOT_READY`, `READY`, `RUNNING`, `OBSERVING`, `VALIDATED`, `MISSED_TARGET`, or `BLOCKED`. A resumed autonomous run whose durable state says `RUNNING`/`OBSERVING` continues without reopening routine decisions.
4. If the repository already uses BMAD (`_bmad/` or `_bmad-output/`), reuse its brief, PRD, UX, architecture, epics, and stories as the source artifacts and add only missing loop/evidence fields. Otherwise, copy only the needed templates from `assets/product/` into `product/`. For autonomous mode copy `assets/product/run-contract.md` to `product/run-contract.md`, `assets/product/observation/monitor-contract.md` to `product/observation/monitor-contract.md`, and `assets/pi/run-state.json` to ignored/private `.loop/run-state.json`. Read [observation.md](references/observation.md), choose a durable scheduler, and test a scheduled wake before kickoff. Before each atomic replacement, run `scripts/validate-run-state.mjs` with the proposed state, prior state when present, and repository root; `assets/pi/run-state.schema.json` documents the closed shape but is not the transition authority. Commit the manifest, its frozen global artifact paths, first phase contract, and empty first-phase evidence seed together; exclude only that mutable evidence seed from the manifest's frozen paths. Record the full commit only in run state. Update run state atomically at budget consumption, phase boundaries, child launches/completions, candidate SHAs, immutable selection records, external effects, verified gates, observation scheduling, and terminal transitions. Do not create duplicate planning systems or leave placeholder text in an approved artifact.
5. Maintain delivery status as one of `DRAFT`, `APPROVED`, `IN_PROGRESS`, `BLOCKED`, `VERIFIED`, or `RELEASED`. After release, track product outcome separately as `OBSERVING`, `VALIDATED`, or `MISSED_TARGET`. Record the approving person/date or autonomous decision source and source commit where applicable.
6. Tell the user the current gate, important assumptions, and next evidence during preflight/supervised work. After autonomous kickoff, record progress durably and continue rather than pausing for status narration.

## Run the workflow

### 1. Qualify the outcome

Fill `product/00-brief.md`, including the authority envelope and autonomous decision policy. Research repository facts and current documentation before asking. In supervised preflight, ask at most three high-leverage questions per round. In autonomous preflight, use documented reversible defaults where the run contract permits them; if a required KPI, credential, irreversible preference, authority grant, or post-release scheduler/monitor cannot be derived, set `NOT_READY` before kickoff and list the exact missing input. `NOT_READY` returns to a new-version `PREFLIGHT` when inputs arrive; it never jumps directly to `READY`. Do not design a system while the product outcome is still ambiguous. Missing authority blocks only the affected mutation; continue safe read-only/local discovery when useful.

### 2. Baseline and approve the product

Create and cross-check:

- `product/01-prd.md`: problem evidence, users, primary and guardrail KPIs, scope/non-goals, requirements, acceptance tests, instrumentation, risks, and approval.
- `product/03-ux-flow.md` for user-facing work: journey/flow diagram, all states, responsive/accessibility behavior, copy, and linked mockups.

For user-facing work, explicitly decide whether imagery, illustration, video, audio, or other generated assets are necessary. Read [media-generation.md](references/media-generation.md) when they are. Freeze each required asset's purpose, model capability, prompt constraints, aspect/crops, accessibility fallback, provenance, optimization target, and in-context evaluator; do not leave media as an implementation afterthought.

In supervised mode, require human approval of the PRD and material UX direction before detailed technical design. In autonomous mode, require the frozen preflight contract to contain deterministic acceptance or a named subjective rubric, decision policy, and evaluator that the user preauthorized. Record the contract version and, after freezing, its full baseline commit in mutable run state as the approval source. After kickoff, never silently change scope, KPI, acceptance type, or a user-visible contract; repair within the contract or terminate `BLOCKED`.

### 3. Design and approve the solution

Create `product/02-tech-spec.md` from the approved product baseline: current-system evidence, simplest viable design, interfaces/data, security/privacy, failure handling, verification, migration, observability, rollback, and required authority. Apply Ponytail before selecting new code, dependencies, or infrastructure.

In supervised mode, require human approval of the versioned technical specification and authority scope. In autonomous mode, require an independent design gate against the frozen PRD, Ponytail simplicity ladder, and authority envelope; material decisions must follow the preflight decision policy. Then create `product/04-roadmap.md` as dependency-ordered vertical slices that each demonstrate end-to-end value. For an existing BMAD project, map approved epics/stories into phase contracts instead of rewriting them. A material change outside the frozen autonomous contract is a terminal block, not a reason to guess or weaken the contract.

### 4. Route and delegate

Read [model-routing.md](references/model-routing.md). Filter by availability, tools, policy, task risk, and project-specific pass-rate evidence. Use price and the user's model priors only as tie-breakers after quality eligibility. When Pi is the harness, also read [pi-orchestration.md](references/pi-orchestration.md) before launching children or worktrees.

Delegate bounded outputs with explicit artifacts and gates. Parallelize dependency-independent research, reviews, or disjoint implementation slices. Use a council only for high-impact ambiguity, conflicting reviews, or two failed approaches; follow the blind council protocol in [protocol.md](references/protocol.md).

### 5. Execute one phase loop

For the next ready phase:

1. Fill an immutable phase contract from `assets/product/phases/phase-template.md` and an empty mutable evidence seed from `assets/product/phases/phase-evidence-template.md`. Record the pre-contract integration SHA in the contract, commit both to the clean integration branch, and record the resulting full commit only in run state/evidence as the common candidate base; do not create a self-referential SHA inside the frozen contract. Pin the inherited authority envelope and at least one required wall-clock/turn ceiling. Preflight freezes only the roadmap and first phase contract; derive later contracts at phase boundaries inside the frozen global limits.
2. Follow [worktrees.md](references/worktrees.md) to create isolated candidate branches/worktrees. Use durable pre-created worktrees for candidates that must be evaluated and merged by SHA; Pi's native temporary `worktree: true` mode is for disposable spikes or patch-returning candidates.
3. Add or identify a failing acceptance check before changing behavior when feasible.
4. Implement only the phase contract, applying Ponytail full mode or the portable ladder before new code or dependencies.
5. Run the verification cascade from cheapest deterministic checks through behavioral/UI checks and independent review. Run `ponytail-review` when available as an additional diff-simplification pass; it never replaces correctness, security, performance, or product review. Stop expensive checks when a cheaper gate fails.
6. Convert findings into concrete repair tasks, fix them in the candidate worktree, and rerun every affected gate. Do not repeat an unchanged approach against the same failure.
7. If multiple candidates exist, reject any that fail a mandatory gate, resolve every candidate before selection, then evaluate the verified survivors blind using the frozen rubric. A merely `COMPLETE` or still-running candidate keeps selection closed. Prefer the smallest safe diff when outcomes tie.
8. Integrate the selected commit through the integration worktree, rerun affected and full regression gates, and record evidence. Push/open/update/merge a phase PR only when the authority envelope permits those remote writes.

### 6. Integrate, document, and release

- Merge dependency order through one integrator. Verify after each merge; never assume separately passing candidates pass together.
- Run the full product acceptance suite, security/privacy checks appropriate to the risk, UI computer-use E2E for user-facing flows, and an independent final review.
- Configure LangChain OpenWiki only when repository documentation freshness is a real requirement. Read [openwiki.md](references/openwiki.md), choose and record either coalesced latest-head PR mode or the explicit read-only literal per-commit audit mode, and copy that guarded workflow plus the locked runner from `assets/`. Never claim the coalesced workflow covers every SHA or that GitHub concurrency provides a FIFO queue. Keep generation isolated from repository write credentials and do not expose secrets to untrusted PR code. Default latest-head mode to a reviewed docs-only PR; autonomous merge requires exact preflight authority plus every deterministic and independent-review guard in the reference.
- Deploy first to the safest authorized representative environment. Verify smoke tests, migrations, telemetry, alerting, and rollback. In supervised mode, obtain explicit human approval immediately before production. In autonomous mode, production is allowed only when the preflight authority envelope names the exact target, grants deployment, defines health/rollback thresholds, and makes required credentials available; otherwise stop after the highest authorized environment and report production as not authorized.
- On successful delivery, set delivery status `RELEASED` and run lifecycle `OBSERVING`. Follow [observation.md](references/observation.md): verify the frozen product-specific monitor contract and test-wake evidence, then keep the durable scheduler/monitor ID and next check in run state. A technically deployed product is not a validated or terminal product outcome unless its frozen success window is immediate.

## Grant completion only from evidence

Declare delivery `RELEASED` only when:

- every approved `DETERMINISTIC` acceptance item passes its frozen check, and every `SUBJECTIVE` item passes its frozen evaluator/rubric (human in supervised mode; an independent model/council only when that autonomous evaluator was explicitly preauthorized);
- no open P0/P1 finding remains and every accepted lower-severity risk has an owner;
- build, tests, security/privacy checks, accessibility where relevant, and UI/API E2E pass on the integrated commit;
- deployment and rollback evidence exist for the target environment;
- KPI instrumentation is live and the observation owner/window are recorded with outcome status `OBSERVING`;
- the frozen observation monitor maps every KPI/guardrail to a read-only measurement and a durable scheduled continuation has passed its test wake;
- documentation and decision logs match the released commit; and
- every remaining subjective product/UX judgment has the evaluator required by the frozen execution contract; and
- no autonomous step exceeded its authority envelope, budget, or terminal rules.

Use `assets/product/release/evidence-template.md` for the final evidence manifest. A completion token may request evaluation, but it cannot override a failed gate.

Autonomous execution promises no routine mid-run handoff, not magical uptime or unlimited authority. On transient failure, retry with backoff, change approach, escalate model, or resume from durable state. `RELEASED` is a delivery milestone; the run remains `OBSERVING` until the KPI window closes. Terminate this contract only as `VALIDATED`, `MISSED_TARGET`, or evidence-backed `BLOCKED`; never loop forever or call a blocked run complete. Before any terminal run seeds a later versioned preflight—including continuation after a blocker is resolved—archive its exact state under `.loop/runs/<run_id>.json`; the new state gets a distinct ID and `parent_run_id`, while the finished run's budgets, ledgers, and selection records never reset or change.

After the KPI window, set outcome status to `VALIDATED` only if the primary target is met and guardrails hold. If it is `MISSED_TARGET`, record the evidence and close the current contract; when the authority envelope permits another iteration, start a new versioned preflight rather than reopening budgets or claiming product success.

## Load references selectively

- Read [protocol.md](references/protocol.md) before intake, phase planning, council use, or completion decisions.
- Read [worktrees.md](references/worktrees.md) before creating, evaluating, merging, or cleaning worktrees.
- Read [model-routing.md](references/model-routing.md) before assigning models or escalating a failed gate.
- Read [pi-orchestration.md](references/pi-orchestration.md) when using Pi, `pi-subagents`, model overrides, or headless execution.
- Read [observation.md](references/observation.md) before autonomous kickoff, release, scheduler installation, observation resume, or terminal KPI evaluation.
- Read [openwiki.md](references/openwiki.md) only when documentation automation is in scope.
- Read [media-generation.md](references/media-generation.md) when a UI, campaign, demo, content product, or acceptance criterion requires generated image/video/audio assets.
