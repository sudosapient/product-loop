---
status: DRAFT
phase_id: "P0"
version: "0.1"
owner: ""
parent_integration_sha: ""
roadmap_version: ""
frozen_at: ""
---

# Phase [ID]: [vertical-slice outcome]

## Contract

- Demonstrable outcome:
- PRD / acceptance IDs:
- In scope:
- Out of scope:
- Dependencies / entry criteria:
- Owned files/components/interfaces:
- External resource namespace:
- Inherited authority envelope / brief version:
- Phase-specific authority narrowing (optional):
- Authority expansion: prohibited during an active autonomous run; start a new preflight/contract

## Gate contract

| Gate | Acceptance IDs | Type | Exact command/scenario/rubric | Expected |
|---|---|---|---|---|
| Acceptance |  | DETERMINISTIC |  |  |
| Regression |  | DETERMINISTIC |  |  |
| Security/privacy |  | DETERMINISTIC |  |  |
| UI/API E2E |  | DETERMINISTIC |  |  |
| Independent review |  | SUBJECTIVE |  |  |

## Worktree plan

| Candidate | Branch | Path | Owner/requested model+harness | Approach | Candidate base source |
|---|---|---|---|---|---|
| A |  |  |  |  | Phase contract commit recorded after freeze |

Explain why multiple candidates are worth their cost, or state `one candidate; independent evaluator`.

## Budgets and stop conditions

- Maximum phase iterations:
- Maximum repeated repair attempts (default 3):
- Wall-clock or turn ceiling (required):
- Cost ceiling (optional; never lower the quality gate):
- No-progress signature:
- External block condition:

## Freeze gate

- [ ] Outcome, scope, entry criteria, gates, resource namespaces, authority narrowing, and budgets fit the frozen global contract.
- [ ] No placeholder or unresolved material decision remains.
- [ ] `parent_integration_sha` identifies the clean integration state before this contract/evidence seed commit.
- [ ] This file and the evidence seed are committed before implementation; record the resulting full commit as the candidate base in `.loop/run-state.json` and the phase evidence file. Do not write that self-referential commit back into this frozen file.
- [ ] This contract file will not be edited during the phase. Execution results go in `P<ID>-evidence.md`.
