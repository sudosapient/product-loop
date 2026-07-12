# Durable product observation and scheduled resume

## Purpose

`RELEASED` is not product success. A product-loop run remains `OBSERVING` until the frozen KPI window can be evaluated. The observation mechanism must survive the original terminal, Pi process, shell, and machine session; “leave tmux open” is not a scheduler contract.

Use `assets/product/observation/monitor-contract.md` to freeze one product-specific measurement and continuation design before autonomous kickoff. Copy it to `product/observation/monitor-contract.md` and include that path in `product/run-contract.md`.

## 1. Choose a durable scheduler

Use an existing reviewed scheduler whenever possible: a production job runner, Kubernetes CronJob, systemd timer on an always-on host, cloud scheduler, CI schedule, or the product's existing orchestration service. The chosen runtime must provide:

- persistent access to the exact repository checkout, `.loop/run-state.json`, Pi sessions, and logs;
- an atomic single-run lock or equivalent lease;
- a stable job ID that becomes `observation.monitor_id`;
- UTC scheduling, retry visibility, and delivery-lag evidence;
- minimum read-only telemetry credentials and no deployment/migration/product-write credentials; and
- an OS/container boundary appropriate to the repository trust level.

Do not claim that a laptop cron entry, an open terminal, or GitHub Actions `concurrency` is a durable ordered queue. If the chosen service cannot preserve the state boundary or wake the run after process/host restarts, autonomous preflight is `NOT_READY`.

## 2. Install the reviewed resume entrypoint

For a reviewed/trusted target, install or invoke the supplied entrypoint from the scheduler:

```sh
install -m 0755 \
  /absolute/path/to/product-loop/assets/observation/observation-resume.sh \
  /absolute/reviewed/bin/product-loop-observation-resume
```

Configure the scheduler with a minimal environment:

```text
PRODUCT_LOOP_REPO=/absolute/persistent/repository
PRODUCT_LOOP_SKILL=/absolute/path/to/product-loop
PRODUCT_LOOP_PI_TRUST=reviewed
PRODUCT_LOOP_PI_MODEL=llm-proxy/gpt-5.6-sol
PRODUCT_LOOP_LOCK_STALE_SECONDS=7200
```

Its command is:

```sh
/absolute/reviewed/bin/product-loop-observation-resume
```

The entrypoint validates the snapshot, acquires an atomic directory lock, exits harmlessly when the run is not `OBSERVING` or the check is not due, and otherwise launches one headless Pi observation continuation with the frozen monitor contract. Set the stale-lock threshold above the scheduler's maximum job runtime; an expired lock is recovered by atomic rename so competing invocations cannot both claim it. The entrypoint validates the resulting snapshot again, fails if durable state did not advance, and keeps JSON/stderr logs under `.loop/logs/`.

The supplied entrypoint deliberately requires `PRODUCT_LOOP_PI_TRUST=reviewed` and uses `--approve`. Do not use it directly for an untrusted target. Put the scheduled continuation in the OS/container/VM isolation already required by the trust policy, start Pi from a separate reviewed orchestration directory, use `--no-approve --no-context-files`, dispatch target work only through reviewed user-scope agents, and mount only the persistent run state, approved evidence destination, and read-only telemetry interfaces needed for observation.

## 3. Freeze product-specific measurement

The monitor contract must map every primary KPI and guardrail ID to:

- an exact formula or binary condition, baseline, target, and UTC window;
- one read-only query or command and a named source;
- data completeness/freshness requirements and a missing-data rule;
- an immutable evidence output with actual-versus-target results; and
- a deterministic aggregate rule for `VALIDATED` versus `MISSED_TARGET`.

At each completed measurement, append one closed `observation.measurements` record with the frozen `id`, `kind`, formula, comparator, target, window end, source/query identity, actual, source-receipt path and SHA-256, measurement timestamp, derived boolean `passed`, and evidence path. The source artifact is a canonical JSON receipt containing the same KPI ID, actual, measured time, frozen contract commit, integration SHA, and SHA-256 of the evidence artifact. The validator reads both regular files, recomputes both hashes, verifies every receipt identity, matches every frozen monitor field, requires measurement at or after the frozen window, and derives `passed` from `EQ`, `NE`, `GT`, `GTE`, `LT`, or `LTE`; the state writer cannot self-assert it. At terminal closure the measurement IDs must exactly equal every KPI and guardrail ID in the frozen brief. `VALIDATED` requires all records to pass; `MISSED_TARGET` requires at least one recorded miss. Observation measurements and evidence are append-only, while monitor ID, window, and release-evidence path/hash are immutable once scheduled.

Before entering `OBSERVING`, write the release-evidence manifest, record its SHA-256 in run state, and keep its frontmatter bound to `status: RELEASED`, the exact integration/release SHA, frozen contract commit, named environment, release time, and `outcome_status: OBSERVING`. The transition validator reads and hashes that file; a nonempty path alone is not release proof.

If interpretation is inherently subjective, the preflight contract must name the authorized independent evaluator and rubric. Never use a model to reinterpret a deterministic target after seeing a miss.

## 4. Test the wake before kickoff

Run a test wake with non-production or read-only credentials:

1. Point a test run at a due `next_check_at` and an observation query with a known result.
2. Launch the scheduler job, not the script manually, and record its stable job/run ID.
3. Confirm a second simultaneous invocation exits on the lock.
4. Confirm state and logs survive a fresh scheduler worker or host restart.
5. Confirm the query cannot deploy, migrate, write product data, or retrieve unrelated secrets.
6. Confirm the parent writes one evidence report and advances `next_check_at` or reaches the expected terminal result through the transition validator.
7. Simulate telemetry/provider failure and verify bounded retry followed by the frozen fallback or evidence-backed `BLOCKED`.

Record the test-wake evidence in the monitor contract. A scheduler name or arbitrary ID without this proof does not satisfy autonomous readiness.

## 5. Operate and close

Each scheduled invocation performs one due observation step and exits. The scheduler supplies future liveness; the model must not sleep until the next window. Keep measurement retries bounded and idempotent.

After `VALIDATED`, `MISSED_TARGET`, or `BLOCKED`, disable the scheduler job, revoke observation-only credentials, preserve logs/evidence according to retention policy, and archive the exact terminal run before any linked new preflight. Decommissioning must not delete the evidence needed to explain the product outcome.
