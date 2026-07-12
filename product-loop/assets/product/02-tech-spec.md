---
status: DRAFT
version: "0.1"
prd_version: ""
base_sha: ""
owner: ""
reviewers: []
approver: ""
approved_at: ""
approved_commit: ""
approval_scope: ""
updated: ""
---

# Technical specification

## 1. Current system evidence

- Relevant files/modules and conventions:
- Existing tests/build/deploy commands:
- Data/integration boundaries:
- Constraints discovered in code or production evidence:

## 2. Decision summary

State the smallest architecture that satisfies the approved PRD and why it is reversible.

### Ponytail decision ladder

| Check | Evidence | Decision |
|---|---|---|
| Does this code/feature need to exist? |  |  |
| Existing repository solution? |  |  |
| Standard library? |  |  |
| Native platform/framework/database feature? |  |  |
| Installed dependency? |  |  |
| Direct local implementation? |  |  |
| New dependency/service/abstraction justified? |  |  |

## 3. Architecture and interfaces

- Components and responsibilities:
- Request/event/data flow:
- Public API or schema changes:
- Compatibility/versioning:
- External services and permissions:

Use the smallest diagram that clarifies a non-obvious relationship.

## 4. Data, security, and privacy

- Data model/migration and invariants:
- Trust boundaries, validation, authorization:
- Sensitive data classification, retention, deletion:
- Abuse/rate-limit/audit needs:
- Failure atomicity, retry, idempotency:

## 5. Verification design

| Gate | Command/scenario | Maps to | Expected evidence |
|---|---|---|---|
| Unit/static |  |  |  |
| Integration/contract |  |  |  |
| UI/API E2E |  |  |  |
| Security/privacy |  |  |  |
| Performance/reliability |  |  |  |

Protect approved acceptance tests from being weakened to fit the implementation.

## 6. Delivery and operations

- Feature flag / rollout:
- Migration and backward compatibility:
- Observability / alerts / KPI events:
- Rollback and data recovery:
- Deployment verification:
- Generated-media pipeline, storage/CDN, optimization, provenance, and cache invalidation (when applicable):

## 7. Alternatives and decision record

| Option | Why considered | Evidence | Decision / rejection reason |
|---|---|---|---|
|  |  |  |  |

## Review gate

- [ ] Design traces to approved PRD/acceptance IDs.
- [ ] Existing/native solution and minimum diff were considered.
- [ ] Security, privacy, failures, migration, telemetry, and rollback are proportionate to risk.
- [ ] No speculative infrastructure or dependency remains.
- [ ] Verification can falsify the design.
- [ ] Human approver (supervised) or independent autonomous design gate and contract source are recorded before implementation.
- [ ] Approved version/commit and authority scope are recorded.
