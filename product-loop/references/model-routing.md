# Model routing and escalation

## Contents

1. Rules
2. Current catalog facts
3. Verified Pi model IDs
4. Legacy priors completed
5. Provisional role routes
6. Local evaluation and escalation

## 1. Rules

- Filter first for actual availability in the active harness, required computer/browser/shell/vision tools, context, privacy/data policy, region, and task risk.
- Among eligible models, choose the lowest expected cost per accepted artifact whose project/task-specific quality clears the gate.
- For UI, copy, and API design, require a blind artifact rubric, screenshots/E2E where relevant, and a reviewer with demonstrated taste. A model-name score alone never satisfies the taste gate.
- Use a different model/provider for independent review when practical. Deterministic tests outrank all model opinions.
- Automatically escalate on evidence. Do not ask the user merely to spend more when escalation remains inside the approved task.
- Treat an inline/project model as the requested first choice, not proof of the actual executor when fallbacks exist. Record final and attempted models from Pi artifacts; a decisive reviewer is independent only if its actual family differs from the implementer.
- Pin canonical model IDs. `Luna`, `Terra`, and `Sonnet` without provider/version are ambiguous.

## 2. Current catalog facts

Recheck availability and price at run time. These facts were verified on 2026-07-10.

| Model | Canonical ID / surface | Input / output USD per 1M tokens | Useful prior | Important constraint |
|---|---|---:|---|---|
| Claude Fable 5 | `claude-fable-5` | 10 / 50 | Hardest long-horizon planning, architecture, premium judge | Expensive; safeguards can route some topics to Opus 4.8 |
| GPT-5.6 Sol | `gpt-5.6-sol` | 5 / 30 | Hard reasoning, final synthesis, computer-use E2E/visual QA | Verify access and tool support in the active workspace |
| GPT-5.6 Terra | `gpt-5.6-terra` | 2.5 / 15 | Balanced PRD/spec/generalist candidate | Let local evals prove it beats Luna/Sol for the task |
| GPT-5.6 Luna | `gpt-5.6-luna` | 1 / 6 | Exploration, repo mapping, high-volume routine work | Escalate when gates expose long-horizon/reasoning limits |
| Claude Sonnet 5 | `claude-sonnet-5` | 2 / 10 through 2026-08-31; then 3 / 15 | Sustained implementation/debugging and independent review | Token sticker price may understate verbose-run cost |
| Composer 2.5 | Cursor model picker / `composer-2.5` | Standard 0.5 / 2.5; Fast 3 / 15 | Cheap Cursor-native code edits, refactors, tests | Do not assume a general standalone API or non-Cursor tool parity |
| Grok 4.5 | `grok-4.5` | 2 / 6 | Cost-efficient worker and alternate-provider second opinion | Revalidate tool/harness quality on the target repo |

Official sources:

- OpenAI GPT-5.6 family: https://openai.com/index/gpt-5-6/
- Anthropic Fable 5: https://www.anthropic.com/news/claude-fable-5-mythos-5
- Anthropic Sonnet 5: https://www.anthropic.com/news/claude-sonnet-5
- Cursor Composer 2.5: https://cursor.com/blog/composer-2-5
- xAI Grok 4.5: https://docs.x.ai/developers/grok-4-5

Vendor and general benchmarks are priors, not acceptance evidence. Model+harness+effort combinations matter more than a universal rank.

## 3. Verified Pi model IDs

The active Pi `0.80.5` runtime exposed these `llm-proxy` IDs again on 2026-07-11:

```text
llm-proxy/claude-fable-5
llm-proxy/claude-opus-4-8
llm-proxy/claude-sonnet-5
llm-proxy/gpt-5.6-luna
llm-proxy/gpt-5.6-sol
llm-proxy/gpt-5.6-terra
llm-proxy/grok-4.5
llm-proxy/grok-composer-2.5-fast
```

Recheck each target machine with `pi --list-models llm-proxy`; local availability is not a universal guarantee. The recommended three-model starting route is:

| Pi role | Initial model | Why / gate |
|---|---|---|
| Parent orchestrator, difficult synthesis, computer-use UI E2E | `llm-proxy/gpt-5.6-sol` | Strong default for coordination and visual/behavioral final checks; actual browser/computer tools must still be available |
| Implementation candidate, routine repair, alternate-provider exploration | `llm-proxy/grok-4.5` | Cost-efficient writer prior; promote only outputs that pass the same gates |
| Independent architecture, correctness, security, or taste reviewer | `llm-proxy/claude-opus-4-8` | Different-family review and escalation; keep review blind to model identity |

Start a top-level Pi process with:

```sh
pi --model llm-proxy/gpt-5.6-sol
pi --model llm-proxy/grok-4.5
pi --model llm-proxy/claude-opus-4-8
```

Those commands create separate top-level Pi sessions, not parent-tracked children. Use `pi-subagents` model overrides for tracked subagents; see [pi-orchestration.md](pi-orchestration.md).

## 4. Legacy priors completed

The user's original 1–10 table is preserved only as a human preference seed. Rename `cost` to `affordability` so higher consistently means better/cheaper. Do not route automatically from this table.

| Model | Intelligence prior | Affordability prior | Taste prior | Source/confidence |
|---|---:|---:|---:|---|
| Fable 5 | 9 | 1 | 9 | User-provided |
| GPT-5.6 Sol | 8 | 4 | 7 | User-provided |
| Composer 2.5 | 6 | 9 | 8 | User-provided |
| Grok 4.5 | 7 | 8 | 8 | User-provided |
| GPT-5.6 Luna | 6 | 9 | 7 | Provisional/low confidence; validate locally |
| GPT-5.6 Terra | 7 | 6 | 7 | Provisional/low confidence; validate locally |
| Claude Sonnet 5 | 8 | 6 | 9 | Provisional/low confidence; validate locally |

“Taste” has no credible universal benchmark. Replace provisional values with blind project-specific results as soon as samples exist.

## 5. Provisional role routes

| Work | Default candidates | Escalation / review |
|---|---|---|
| Repo discovery and research | Luna; Composer inside Cursor | Grok cross-check when sources/interpretation conflict |
| PRD and tech-spec draft | Terra or Sonnet | Sol review for high-impact ambiguity; Fable only when complexity warrants it |
| Routine implementation | Composer Standard in Cursor; otherwise Luna or Grok | Sonnet for sustained brownfield/debugging; Sol after evidence-backed failure |
| Hard architecture / repeated failure | Sol | Fable for the hardest long-horizon case; use a council if tradeoffs remain |
| UI, copy, API design | Sonnet, Grok, Composer, or other locally proven worker | Sol computer-use E2E + visual review; if Sol implemented, use Sonnet/Fable reviewer |
| Code/security review | Strong model different from implementer plus deterministic scanners/tests | Sol/Fable for high-risk findings; frozen policy/authorized evaluator or terminal block for an irreversible choice |
| Final merge gate | No model alone | Integrated deterministic CI, independent review, and the evaluator/authority evidence frozen by the execution mode |

Do not force every model into a project. Availability and local evidence decide whether a candidate earns a route.

## 6. Local evaluation and escalation

Record one result per task class and harness/version:

```yaml
model_id: gpt-5.6-luna
task_class: frontend-brownfield
harness_version: product-loop-v1
sample_n: 0
first_pass_gate_rate: null
accepted_rate: null
mean_cost_per_accepted_usd: null
p95_latency_s: null
median_human_rework_min: null
escaped_defect_rate: null
design_blind_win_rate: null
measured_at: null
```

Use `total generation + tool + review + retry cost / accepted artifacts`, not raw token price. For enough samples, route on a conservative lower confidence bound, not the mean alone.

### Escalation ladder

1. Run the cheapest eligible model with demonstrated gate performance.
2. On a localized first failure, give the worker the exact failing evidence and one repair attempt.
3. On a second failure or repeated signature, switch to a stronger or different model family and reconsider the approach—not just the wording.
4. On a third failure, invoke the focused council/spike protocol or mark `BLOCKED` if the remaining decision needs authority, credentials, contract changes, or external input the run does not have.
5. Keep the higher-quality result even when it costs more. Use cheaper models to explore and generate testable candidates, never to lower acceptance quality.
