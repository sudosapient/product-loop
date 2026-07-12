---
status: DRAFT
version: "0.1"
owner: ""
approver: ""
approved_at: ""
updated: ""
---

# Product requirements document

## 1. Problem and user

- Primary user / segment:
- Job to be done:
- Current pain and evidence:
- Why now:

## 2. Outcome and KPI contract

Link to `00-brief.md`, then state the primary KPI, target/window, measurement event/query, owner, and guardrails. Explain how the product can be technically accepted before the longer outcome window closes.

## 3. Scope

### In scope

-

### Non-goals

-

## 4. User journey and requirements

Give every requirement a stable ID.

| ID | User/system requirement | Priority | Rationale |
|---|---|---|---|
| FR-1 |  | Must |  |

## 5. States and edge cases

- Happy path:
- Loading / empty / first-use:
- Invalid input / permissions:
- Network or dependency failure:
- Partial success / retry / idempotency:
- Destructive action / recovery:

## 6. Instrumentation

| Event/metric | Trigger/formula | Properties/dimensions | Privacy class | Validation |
|---|---|---|---|---|
|  |  |  |  |  |

## 7. Acceptance traceability

Classify each item once at approval. Use `SUBJECTIVE` only for an inherently qualitative judgment such as visual preference—not to bypass a testable behavior. Name its evaluator; an autonomous model/council evaluator is valid only when preauthorized in `00-brief.md`.

| Acceptance ID | Requirement IDs | Priority | Type (`DETERMINISTIC`/`SUBJECTIVE`) | Frozen exact check or named rubric | Environment | Evidence path |
|---|---|---|---|---|---|---|
| AC-1 | FR-1 | Must | DETERMINISTIC |  |  |  |

A failed must-have deterministic item cannot be excepted, weakened, or replaced with sign-off. Changing its type/check requires a new PRD version plus supervised reapproval or a new autonomous run contract; never mutate it inside an active autonomous run.

## 8. Risks, assumptions, dependencies

| Item | Type | Impact | Mitigation / falsifying test | Owner |
|---|---|---|---|---|
|  |  |  |  |  |

## 9. Open questions and decisions

| Question/decision | Owner | Due | Resolution / decision-log link |
|---|---|---|---|
|  |  |  |  |

## Approval gate

- [ ] Every must-have requirement maps to acceptance.
- [ ] Every acceptance item has a frozen type; subjective rubrics are inherently subjective.
- [ ] KPI instrumentation and guardrails are testable.
- [ ] Scope, non-goals, risks, privacy, and dependencies are explicit.
- [ ] Material UX direction is linked or scheduled.
- [ ] Approver or autonomous contract source, version, and approval timestamp are recorded.
