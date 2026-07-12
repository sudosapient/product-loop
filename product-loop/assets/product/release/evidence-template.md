---
status: DRAFT
release_sha: ""
environment: ""
release_owner: ""
approver: ""
production_approver: ""
production_approved_at: ""
execution_mode: ""
contract_commit: ""
released_at: ""
outcome_status: OBSERVING
observation_window_ends: ""
---

# Release evidence

## Delivery summary

| Phase | Selected SHA / PR | Attempts | Elapsed | Model/tool cost | Final gates | Decision log/review |
|---|---|---:|---:|---:|---|---|
|  |  |  |  |  |  |  |

Record wall-clock and actual billed cost when available; label estimates rather than presenting them as actuals.

## Requirement coverage

| PRD / acceptance ID | Priority | Type | Evidence | Result | Accepted lower-severity risk/owner |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

Must-have deterministic acceptance failures are P1 and cannot use the risk column as an exception. Change requires a versioned/reapproved PRD or a new autonomous run contract.

## Integrated quality gates

| Gate | Exact command/scenario | Tested SHA | Environment | Executor/independent? | Timestamp | Exit/result | Artifact/log |
|---|---|---|---|---|---|---|---|
| Build/install |  |  |  |  |  |  |  |
| Full regression |  |  |  |  |  |  |  |
| Security/privacy |  |  |  |  |  |  |  |
| Accessibility |  |  |  |  |  |  |  |
| UI/API computer-use E2E |  |  |  |  |  |  |  |
| Independent final review |  |  |  |  |  |  |  |

## Deployment and recovery

- Deployment ID/time:
- Migration result:
- Smoke result:
- Rollout/feature flag:
- Rollback command/owner and last verified time:
- Alerts/runbook:

## KPI observation

- Frozen monitor contract: `product/observation/monitor-contract.md`
- Durable scheduler/job ID and last test-wake evidence:

| KPI/guardrail | Baseline | Target/window | Live data source | Instrumentation validation | Owner/status |
|---|---:|---:|---|---|---|
|  |  |  |  |  |  |

Use `OBSERVING` in owner/status until the outcome window closes. Do not claim product impact solely from deployment.

## Documentation and decisions

- Product artifacts match release SHA:
- API/operations docs:
- OpenWiki source SHA/docs PR, if enabled:
- Decision/risk log:

## Final decision

- Open P0/P1 findings: must be none.
- Accepted P2/P3 items with owner/date:
- Human approvals or preauthorized autonomous gate evidence:
- Baseline/phase contract commits verified with zero frozen-path diff:
- Authority-envelope and budget compliance:
- Terminal run-state evidence:
- Release verdict and rationale:
- Post-window KPI verdict/date:

Set `outcome_status` to `VALIDATED` only when the target and guardrails pass. Set it to `MISSED_TARGET` and close this contract when they do not; any retry begins a new versioned preflight.
