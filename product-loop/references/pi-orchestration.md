# Pi subagents and hands-off execution

## Contents

1. Verify the runtime
2. Understand parent versus child sessions
3. Route the available models
4. Configure project defaults
5. Launch the parent
6. Delegate and monitor children
7. Run the autonomous product pipeline
8. Keep worktrees and merges safe
9. Run headlessly and recover

## 1. Verify the runtime

Run these checks in the target repository before kickoff:

```sh
pi --version
pi --list-models llm-proxy
pi list
git rev-parse --show-toplevel
git status --short
```

The verified local setup is Pi `0.80.5` plus the active user-installed `pi-subagents` `0.34.0`. Install the extension only if `pi list` does not show it:

```sh
pi install npm:pi-subagents
```

Confirm the exact IDs needed by this route appear in `pi --list-models llm-proxy`:

```text
llm-proxy/gpt-5.6-sol
llm-proxy/grok-4.5
llm-proxy/claude-opus-4-8
```

Do not start implementation if the repository has no baseline commit, the integration checkout is dirty, the success contract is incomplete, or a required model/tool/credential is unavailable. Complete safe preflight work and record `NOT_READY` instead.

Before the first child launch, keep private/runtime artifacts out of Git. Add both paths to the repository's `.gitignore` before the baseline commit or to the local exclude file, then assert they are ignored:

```sh
set -eu

exclude_file="$(git rev-parse --git-path info/exclude)"
for path in '.loop/' '.pi-subagents/'; do
  grep -qxF "$path" "$exclude_file" || printf '%s\n' "$path" >> "$exclude_file"
done
test -z "$(git ls-files -- .loop .pi-subagents)"
git check-ignore -q --no-index .loop/probe
git check-ignore -q --no-index .pi-subagents/probe
```

Pi-subagents keeps useful debug artifacts on by default under `.pi-subagents/`; they may contain prompts, code, paths, or tool output. Never broad-stage these directories.

## 2. Understand parent versus child sessions

These commands launch separate top-level Pi processes:

```sh
pi --model llm-proxy/gpt-5.6-sol
pi --model llm-proxy/grok-4.5
pi --model llm-proxy/claude-opus-4-8
```

They are not automatically tracked as subagents. To create parent-owned children, start one parent Pi and use the installed `pi-subagents` extension through natural language, slash commands, or its `subagent(...)` tool.

Built-in roles are enough; do not create a custom agent framework:

- `scout` / `researcher`: local and external discovery;
- `planner` / `context-builder`: PRD, specification, and phase planning;
- `worker`: the role authorized to write in its assigned checkout;
- `reviewer`: fresh independent verification;
- `oracle`: difficult decision/architecture second opinion.

Ordinary children must not launch further children. Keep orchestration, selection, and merge authority in the parent.

Role names and prompt instructions are authorization policy, not a technical sandbox. Builtin agents may still receive write-capable tools. For technical write isolation, use a custom agent with an explicit tool allowlist, a disposable/detached worktree, post-run `HEAD`/clean assertions, and OS containment where the read boundary matters.

## 3. Route the available models

Use this as a starting route, then override it from gate evidence:

| Role | Model | Escalate when |
|---|---|---|
| Parent, hard synthesis, final UI computer-use E2E | `llm-proxy/gpt-5.6-sol` | Use Opus as independent judge when Sol wrote the artifact or review disagreement remains |
| Default implementation worker / cheap competing candidate | `llm-proxy/grok-4.5` | Move the repair to Sol after repeated gate failure; use a different approach, not only a larger prompt |
| Independent architecture/security/code/taste reviewer | `llm-proxy/claude-opus-4-8` | Cross-check with Sol plus deterministic evidence on a release blocker |

All user-facing UI, copy, and API design still need a frozen rubric and an independent reviewer with taste quality that has passed local examples. A model label does not satisfy that gate.

## 4. Configure project defaults

For a trusted project, copying `assets/pi/settings.json` to `.pi/settings.json` is an optional convenience. Project settings/agents override user settings, so inspect project-local settings, extensions, packages, and agents first, then either run interactive `/trust` and restart Pi, or use one-run `--approve` immediately.

Project trust is only an input-loading decision, not a sandbox. Pi core's `--no-approve` suppresses project resources for the parent, but ordinary `AGENTS.md`/`CLAUDE.md` context still loads unless `--no-context-files` is set, and parent trust flags are not propagated to child Pi processes. In `pi-subagents` 0.34.0, default execution discovery is `agentScope: "both"`; it can read target-project agents/settings/packages independently of Pi's trust decision, project definitions win name collisions, and a shadow agent can add explicit child extensions. Never run an unattended untrusted repository directly with host secrets or broad filesystem/network access.

Install the reviewed blind evaluator at user scope so secure dispatch does not depend on a target repository definition. Define the skill path before using it:

```sh
set -eu
export PI_SKILL=/absolute/path/to/product-loop
mkdir -p ~/.pi/agent/agents
user_evaluator=~/.pi/agent/agents/blind-evaluator.md
if [ -e "$user_evaluator" ]; then
  cmp -s "$PI_SKILL/assets/pi/agents/blind-evaluator.md" "$user_evaluator"
else
  install -m 0600 "$PI_SKILL/assets/pi/agents/blind-evaluator.md" "$user_evaluator"
fi
```

For untrusted input, use an OS/container/VM sandbox or disposable account with minimum mounts, no unrelated host credentials, constrained network, and short-lived scoped project credentials. Start the parent from a separate reviewed orchestration directory, not from the target. Never give an untrusted execution a top-level `cwd`; give the target path only as each task's `cwd`. Set `agentScope: "user"` on every `subagent(...)` execution and avoid `/run`, `/parallel`, and saved slash workflows because version 0.34.0 hardcodes those routes to `both` scope. Before kickoff, run `subagent({ action: "list", agentScope: "user" })` from the trusted orchestration cwd to enumerate the allowed names and sources. Then inspect each role with `action: "get"` from that same cwd and verify its returned path, tools including any `mcp:*` direct tools, named skills, `inheritSkills`, memory configuration, extensions, and `subagentOnlyExtensions`; reject collisions, ambiguity, any target-dependent skill/MCP lookup, or any unexpected memory/extension. In 0.34.0, `agentScope` filters agent discovery but not named-skill or MCP configuration resolution: skills can resolve project-first from the task `cwd`, and a declared MCP direct tool can read target `.mcp.json`/`.pi/mcp.json`. Require `inheritSkills: false`, no named skills, no `mcpDirectTools`, and no agent memory for the untrusted route unless a specific read-only memory file was separately reviewed and authorized; also set per-task `skill: false` as defense-in-depth. `get` searches all scopes regardless of its `agentScope` argument, so its explicit returned source must be checked and it is never proof of filtered execution discovery.

As defense-in-depth, launch the parent with `--no-approve --no-context-files` and force the same flags on children through the supplied wrapper:

```sh
export PI_REAL_BINARY="$(command -v pi)"
export PI_SUBAGENT_PI_BINARY="$PI_SKILL/assets/pi/pi-untrusted-child-wrapper.sh"
test -x "$PI_REAL_BINARY"
test -x "$PI_SUBAGENT_PI_BINARY"
```

The wrapper does not prevent extension discovery by itself and does not replace containment. The separate orchestration cwd plus top-level `agentScope: "user"` closes target-agent/package discovery; the OS sandbox limits what any remaining runtime or repository code can reach. Verify child arguments/artifacts before mounting a deployment secret.

The settings file changes builtin role defaults; it does not remove the ability to override one child:

Trusted interactive projects may use the slash shortcut below after reviewing project discovery. Do not use it for untrusted input:

```text
/run worker[model=llm-proxy/gpt-5.6-sol] "Repair the exact failing gate..."
```

`fallbackModels` handles provider/model failures such as quota, auth, timeout, or unavailability. It does not detect mediocre code. Quality escalation remains the parent's job: feed the exact failed gate to a stronger/different model and change the approach.

## 5. Launch the parent

Interactive launch for a trusted repository:

```sh
PI_SKILL=/absolute/path/to/product-loop
PRD=/absolute/path/to/prd.md
RUN_PROMPT="$PI_SKILL/assets/pi/autonomous-run-prompt.md"

pi \
  --model llm-proxy/gpt-5.6-sol \
  --thinking high \
  --name product-loop \
  --skill "$PI_SKILL" \
  --approve \
  @"$PRD" \
  @"$RUN_PROMPT"
```

For contained untrusted-input analysis, `cd` to the separate trusted orchestration directory before launching, use both `--no-approve` and `--no-context-files`, and use the child wrapper plus user-scope task dispatch above. These flags reduce loaded instructions; they do not make executed repository code safe.

The parent first performs `PREFLIGHT`. It may gather repository facts, research current documentation, create product artifacts, and—in an interactive supervised intake—ask high-leverage questions. It must not mark `RUNNING` until every autonomous readiness check passes.

## 6. Delegate and monitor children

Human-friendly interactive commands for a reviewed trusted project:

```text
/run scout[model=llm-proxy/grok-4.5] "Map the relevant repository and return evidence. Do not edit."
/run worker[model=llm-proxy/grok-4.5] "Implement the frozen phase contract in your assigned worktree."
/run reviewer[model=llm-proxy/claude-opus-4-8] "Review the candidate SHA against the frozen gates. Do not edit."
/parallel reviewer[model=llm-proxy/claude-opus-4-8] "Correctness/security review" -> reviewer[model=llm-proxy/gpt-5.6-sol] "UI/API behavior review"
```

For agent-authored workflows, have the parent call the tool directly. Builtin reviewers are not technically read-only, so this example is advisory only and must run in disposable detached worktrees whose exact `HEAD` and clean status are asserted again afterward. Use the stricter exact-SHA flow in [worktrees.md](worktrees.md) for a gating decision:

```typescript
subagent({
  tasks: [
    { agent: "reviewer", model: "llm-proxy/claude-opus-4-8", cwd: "/private/tmp/eval-correctness", task: "Assert the supplied immutable SHA, review correctness/security/regressions, and do not edit.", output: false },
    { agent: "reviewer", model: "llm-proxy/gpt-5.6-sol", cwd: "/private/tmp/eval-behavior", task: "Assert the supplied immutable SHA, run the frozen UI/API rubric, and do not edit.", output: false }
  ],
  concurrency: 2,
  agentScope: "user",
  context: "fresh",
  async: true,
  timeoutMs: 1200000
})
```

Checkpoint the returned run ID. Continue independent parent verification, then call `wait({ id: "<run-id>", timeoutMs: 1200000 })` or `wait({ all: true })` before synthesis. `wait()` wakes on completion or needs-attention; inspect status, resolve the condition, and keep the same turn alive.

Use one-run model overrides in the child object even when defaults exist when independence matters. A requested model is the first choice, not a hard pin when the role still has fallback models. Read each child's artifact metadata; record requested model, ordered `attemptedModels`, and final actual model. Compare the request to the first attempt after stripping only Pi's recognized thinking suffix; the exact final ID must be the last attempt. Link each non-planned candidate to its producer child run and require matching phase, cwd, requested/attempted/final models, and completion state. Reroute a decisive review if its actual family overlaps any implementer. Avoid duplicate output paths. Use `context: "fresh"` for adversarial reviewers and competing candidates; forked context inherits the parent history and requires a persisted parent session.

Save every async run ID in `.loop/run-state.json`, then inspect or control it with:

```typescript
subagent({ action: "status" })
subagent({ action: "status", id: "<run-id>" })
subagent({ action: "resume", id: "<run-id>", agentScope: "user", skill: false, message: "Continue from the recorded failing gate." })
subagent({ action: "interrupt", id: "<run-id>" })
subagent({ action: "doctor" })
wait()
wait({ all: true })
wait({ id: "<run-id>", timeoutMs: 1200000 })
```

For the untrusted route, every resumed execution must also set `agentScope: "user"`; resume performs execution discovery again and must not fall back to the default `both` scope. `pi-subagents` 0.34.0 emits some “Nudge”/“Revive” suggestions without `agentScope`; treat those generated snippets as unsafe templates and never execute them verbatim. Do not revive a completed untrusted child by default. Prefer a fresh child only after writer-lease reconciliation; if the frozen contract requires completed-session revival, reverify the exact user agent source/capabilities and call `resume` manually with `agentScope: "user"`.

Interrupt only on an explicit needs-attention signal, proven drift, or a hard conflict. A soft interrupt pauses a child; it does not complete or fail the task. The autonomous parent must decide and record the next action immediately.

## 7. Run the autonomous product pipeline

The parent owns this sequence:

1. `PREFLIGHT`: inspect, research, complete the PRD/KPI/authority contract, create `product/run-contract.md` plus `.loop/run-state.json`, freeze the first phase contract, and resolve all choices that would otherwise require a mid-run question.
2. `READY`: commit the manifest, all listed global artifacts, and first phase contract together. Record the full baseline commit/frozen paths, budgets, retry ceilings, environment credentials, rollout, rollback, and post-release scheduler in mutable run state.
3. `RUNNING`: verify the contract commit/paths and record kickoff. From this point do not ask routine questions or open Pi's clarify UI.
4. For every vertical phase: derive immutable contract + empty evidence seed → commit both as the one common candidate base → set active phase `RUNNING` → create durable worktree(s) → failure-first check → implement → deterministic/exact-SHA detached verification → repair and reverify until the survivor SHA set is immutable → use an independent exact-SHA reviewer for one survivor or identity-scanned, mount-confined blind synthesis with no evaluator fallback for competing survivors → write the hash-bound selection receipt → exact-SHA integrate without changing the selected candidate → evidence-only follow-up commit → final integration gate → set phase `VERIFIED` and append a complete checkpoint.
5. Run integrated security/accessibility/UI/API E2E and final independent review.
6. Release only within the authority envelope, verify health/rollback/telemetry, set delivery `RELEASED`, set run lifecycle `OBSERVING`, and persist the KPI monitor ID/next check.
7. Terminate this contract only as `VALIDATED`, `MISSED_TARGET`, or evidence-backed `BLOCKED`. Any later iteration or resolved blocker starts a linked new versioned preflight; never reopen a terminal run.

Use parallelism for independent discovery, read-only review, validation, or intentionally isolated candidate writers. Use one integrator and never let two children write the same checkout, database namespace, port, cache, or external sandbox.

## 8. Keep worktrees and merges safe

Read [worktrees.md](worktrees.md) before launching writers.

- Use parent-created durable worktrees and per-child absolute `cwd` for any candidate that must be committed, evaluated, and merged by SHA.
- Use Pi-native `worktree: true` only for disposable spikes or patch-returning candidates where loss is acceptable. Patch capture, dependency linking, and temporary cleanup are best-effort; verify any retained artifact.
- Freeze one common base SHA, give each child one worktree, require a clean commit/full SHA, and keep model identity hidden from the evaluator.
- Reject failed mandatory gates before scoring. Merge the selected exact SHA through one clean integration worktree; rerun targeted gates after each merge and the full relevant suite at the end.
- Never force-remove dirty worktrees or delete unmerged branches merely to keep the loop moving.

## 9. Run headlessly and recover

A one-shot/headless Pi parent exits after its agent turn. During preflight, call `wait()` with no active runs: an enabled tool returns “No active async runs”; a disabled tool explicitly says it is disabled. Choose `async: false` before the first launch when disabled. Otherwise launch children with `async: true`, do useful independent parent work, then call `wait()` before the turn ends. Use `wait({ all: true })` to drain every critical run or a bounded `wait({ id, timeoutMs })` plus status/recovery for one run. Tool calls launch directly by default; do not opt into `clarify: true` after kickoff.

Headless JSON-event launch for a reviewed/trusted project:

```sh
mkdir -p .loop/pi-sessions .loop/logs

pi \
  --mode json \
  --model llm-proxy/gpt-5.6-sol \
  --thinking high \
  --session-dir "$PWD/.loop/pi-sessions" \
  --name product-loop \
  --skill "$PI_SKILL" \
  --approve \
  @"$PRD" \
  @"$RUN_PROMPT" \
  > .loop/logs/product-loop.jsonl \
  2> .loop/logs/product-loop.stderr.log
```

Use tmux or the host's normal process supervisor for terminal disconnects; do not hide the process in an unobservable background shell. Pi session files, JSON events, git commits, evidence artifacts, `.loop/run-state.json`, and parent-owned writer leases are the recovery boundary.

Before launching a writer, atomically create a lease outside its worktree, for example `.loop/leases/<candidate-id>.lock/`, and record a nonce, candidate/phase ID, canonical worktree path, owned external namespaces, launch time, and `launching` status. After Pi returns the child run ID, add it to the lease and record the child in durable run state before doing other work. Lease directories are a separate ignored/private recovery primitive; do not add an undeclared lease field to the closed run-state shape. Remove the lease only after Pi status/session reconciliation proves the child is terminal and the worktree plus external resources have been inspected. A lease left at `launching`, an unknown run ID, PID reuse, missing session artifact, or disagreement between Pi status and the worktree is ambiguous ownership—not proof that the writer is dead.

Keep both `.loop/` and `.pi-subagents/` outside version control (or place session/log/artifact directories outside the repository) and re-run `git check-ignore` before child launches and broad staging. Pi transcripts and tool output can contain source, paths, environment details, or secrets; do not publish them as ordinary build artifacts.

Validate each state transition before replacing the live file:

```sh
node "$PI_SKILL/scripts/validate-run-state.mjs" \
  .loop/run-state.next.json \
  .loop/run-state.json \
  --repo "$(git rev-parse --show-toplevel)" \
  && mv .loop/run-state.next.json .loop/run-state.json
```

The script is the transition authority; the JSON Schema documents its closed record shape. The validator checks the prior snapshot too, rejects unknown fields, verifies committed contract/phase/candidate/integration Git identities, freezes contract and execution identity, enforces ordered ledger transitions and actual-model provenance, checks budgets, and requires observation/terminal evidence without a runtime dependency. Persist an effect/checkpoint only when its record is complete because those ledgers are append-only.

After any terminal state (`VALIDATED`, `MISSED_TARGET`, or `BLOCKED`), preserve the closed run before creating a later iteration. A resolved blocker is a new run, not a mutation of the blocked record; a validated product may likewise seed a separately authorized improvement contract. Atomically copy the exact terminal snapshot to `.loop/runs/<run_id>.json`; never overwrite or edit it. Initialize a fresh template with a distinct `run_id`, `parent_run_id` equal to the archived ID, a new contract version, zero new-run consumption, and empty ledgers. The normal validator command above accepts the rollover only when that sibling archive exists and exactly matches the previous state:

```sh
set -eu
run_id="$(node -e 'const s=require("./.loop/run-state.json"); process.stdout.write(s.run_id)')"
archive=".loop/runs/$run_id.json"
test -n "$run_id"
test ! -e "$archive"
mkdir -p .loop/runs
cp .loop/run-state.json "$archive.tmp"
cmp -s .loop/run-state.json "$archive.tmp"
mv "$archive.tmp" "$archive"
```

On restart, launch the same parent model with the persisted session or a new parent instructed to validate `.loop/run-state.json` with the transition script and use `assets/pi/run-state.schema.json` as shape documentation. Before any resume or replacement launch, reconcile every persisted or discovered Pi run/session and writer lease: inspect fleet/status/transcript artifacts, verify the lease owner and canonical worktree, assert branch/`HEAD`/status, and check owned ports, databases, caches, sandboxes, deployment locks, and other external namespaces. Wait for, safely interrupt, or explicitly retire the old owner before replacing it. If the parent crashed between process launch and run-ID persistence, a `launching` lease or unexplained worktree/resource activity prevents automatic relaunch; preserve evidence and record `BLOCKED` when ownership cannot be proven. Only after reconciliation may the parent verify the global and active-phase contract commits/paths and resume the earliest non-terminal artifact. Before exiting or changing phase, persist consumed/global budgets, active phase status, child IDs, phase-keyed candidate worktree/branch/base/head/status and producer run IDs, immutable selection records, external effects/rollback, last verified gate, failure signature/count, observation schedule, and next action; keep the separate lease directories durable alongside that state.

“No stopping” means no routine mid-run human handoff and automatic recovery from transient failures. It cannot honestly mean infinite retries, self-granted permissions, or guaranteed survival of host/provider outages. Exhaust safe alternatives, then emit a truthful terminal `BLOCKED` record rather than claiming completion.
