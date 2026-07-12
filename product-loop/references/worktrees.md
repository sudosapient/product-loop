# Worktree isolation, evaluation, and integration

## Contents

1. Decide the topology
2. Create isolated candidates
3. Evaluate candidates
4. Integrate safely
5. Clean up and recover

## 1. Decide the topology

Use at least one implementation worktree per phase so the integration checkout remains clean.

- **One candidate:** default for clear, low-risk work. A separate agent still evaluates it.
- **Competing candidates:** use two by default, and at most three, only for a consequential uncertain design or when a small spike is cheaper than extended debate.
- **Parallel slices:** use only for dependency-independent tasks with disjoint ownership. These are combined, not compared.

Do not create multiple worktrees merely to satisfy an agent-count target. Research, deterministic checks, and read-only reviews do not require write worktrees unless they need isolation.

### Choose the Pi isolation mode deliberately

Pi's `pi-subagents` extension offers two different patterns; do not confuse them:

| Pattern | Use when | Lifecycle |
|---|---|---|
| Native `subagent({tasks: [...], worktree: true})` | Disposable spikes, experiments, or competing patches where artifact/cleanup loss is acceptable | Pi attempts to create branches/worktrees from `HEAD`, append diff stats, save patch artifacts, and clean temporary worktrees/branches; linking, patch capture, and cleanup are best-effort |
| Parent-created durable worktrees plus per-task `cwd` | A candidate must commit, be evaluated by immutable SHA, survive the child run, and merge exactly | Parent owns branch/worktree creation, child owns one checkout, evaluator selects a SHA, integrator merges it, parent cleans up after evidence is retained |

The product loop defaults to the durable pattern. Native `worktree: true` requires a clean repository, task `cwd` values omitted or equal to the shared cwd, and a valid setup hook when configured. It attempts to symlink an existing `node_modules/` into temporary worktrees. Never make native mode the sole copy of important work or promise its patch/branch will survive; use it only when loss is acceptable, verify the retained artifact, then reimplement/apply the selected approach in a durable worktree.

### Preconditions

- Git has at least one commit and the approved baseline is committed.
- The integration checkout is clean. If the user's primary checkout contains unrelated changes, preserve it untouched and create a dedicated clean integration branch/worktree instead of merging around those changes.
- Every candidate uses the same pinned base SHA for a fair comparison.
- Branch, directory, external port, database/schema, cache, and sandbox names are unique.
- Secrets are referenced through the approved environment mechanism, never copied into a worktree.
- `.loop/` and `.pi-subagents/` are ignored or locally excluded and verified with `git check-ignore` before any child launch.

If a greenfield repository has no commit, finish the approved product/spec bootstrap and create the baseline commit only when commits are within the user's requested workflow. Do not invent a fake base or initialize unrelated infrastructure.

Before creating phase worktrees, write the pre-contract integration SHA and resource/ownership plan inside the immutable `P<ID>-contract.md`, then commit that contract and an empty `P<ID>-evidence.md` seed to the clean integration branch. Record the resulting full commit as both the phase contract commit and pinned candidate base in mutable run state/evidence—never inside the contract that commit contains. The contract path is frozen; candidates may update their own copy of the evidence seed. Keep pre-merge reviewer/synthesis output under ignored `.loop/evaluation/<phase>/`, not in the integration checkout.

## 2. Create isolated candidates

Prefer worktrees outside the repository directory. Use the Codex branch prefix unless the user/project specifies another convention.

```sh
set -eu

repo="$(git rev-parse --show-toplevel)"
base_sha="$(git rev-parse HEAD)"
worktree_root="$(dirname "$repo")/.$(basename "$repo")-worktrees"
branch="codex/loop/phase-01/candidate-a"
path="$worktree_root/phase-01-candidate-a"

mkdir -p "$worktree_root"
git worktree add -b "$branch" "$path" "$base_sha"
```

Record the intended branch/path, owner role, approach boundary, file boundary, and resource namespace in the phase contract. After committing it, record the resulting `base_sha`, concrete worktree/branch identity, and child run ID in the existing mutable run-state fields. Keep the writer lease separately under ignored/private `.loop/leases/` and reference its path from ordinary evidence/next-action text rather than adding an undeclared state field. Never let two agents write the same worktree.

Each candidate must finish with:

- a clean, committed diff owned by its branch;
- exact verification commands and results;
- a short decision/assumption log;
- known risks and remaining findings; and
- no generated credentials, local databases, build caches, or unrelated artifacts staged.

### Delegate durable candidates through Pi

Create the durable worktrees first with the shell commands above, then have the parent Pi call its `subagent` tool. Give every child a distinct absolute `cwd`; do not also set `worktree: true`:

```typescript
subagent({
  tasks: [
    {
      agent: "worker",
      model: "llm-proxy/grok-4.5",
      cwd: "/abs/repo-worktrees/phase-01-candidate-a",
      skill: false,
      task: "Implement the frozen phase contract at /abs/repo/product/phases/P1-contract.md. Put execution results in the assigned evidence artifact, stay inside owned files, run the listed gates, commit a clean candidate, and return the full SHA plus exact evidence. Do not launch subagents."
    },
    {
      agent: "worker",
      model: "llm-proxy/gpt-5.6-sol",
      cwd: "/abs/repo-worktrees/phase-01-candidate-b",
      skill: false,
      task: "Implement an independent smallest-safe candidate for the same frozen contract. Put execution results in this worktree's evidence seed, stay inside owned files, run the listed gates, commit a clean candidate, and return the full SHA plus exact evidence. Do not launch subagents."
    }
  ],
  concurrency: 2,
  agentScope: "user",
  context: "fresh",
  async: true,
  timeoutMs: 1800000
})
```

Checkpoint the returned run ID in `.loop/run-state.json`, continue independent parent work, then call `wait({ id: "<run-id>", timeoutMs: 1800000 })` or `wait({ all: true })` before evaluation. In a one-shot/headless parent, never end the turn while critical children remain live. If the active Pi runtime has no enabled `wait` tool, use `async: false` instead.

Every state record includes the phase ID. Append each candidate as `PLANNED` after its isolated worktree exists. A child record may first appear as `QUEUED` or already-observed `RUNNING` because Pi assigns the run ID during launch. Set the candidate's `producer_run_id` when that worker is known; from `RUNNING` onward its phase, cwd, requested model, exact ordered attempts, final model, and completion state must match the producer child. Preserve Pi thinking suffixes in actual IDs; compare only request versus first attempt canonically, while the exact final ID must be the last attempt. Before `SELECTED`, append one immutable selection record for the phase binding the completed no-fallback evaluator run ID, exact evaluated SHA set, selected SHA, SHA-256 of the sanitized input manifest, evidence, and timestamp. Store `manifest.json` beside the selection receipt. The receipt JSON repeats the phase/run/SHA fields and binds the evaluator's immutable Pi metadata artifact path plus SHA-256; the transition validator recomputes both hashes and checks the metadata run ID, agent, exit code, final model, and ordered attempts against the child ledger.

## 3. Evaluate candidates

Use a fresh evaluator that did not implement the candidate. Give it the approved PRD/phase contract, common base SHA, candidate SHAs, gate commands, and rubric—without telling it which model produced which candidate. A one-candidate phase needs an independent exact-SHA `reviewer`, but not the comparative blind-bundle ceremony; record its verified survivor decision through the same immutable selection receipt. Two or more candidates require the identity-sanitized `blind-evaluator` flow below.

### Mandatory gates

Reject a candidate before scoring if any required acceptance, regression, security/privacy, accessibility, build, or UI/API E2E gate fails. Also reject candidates that weaken protected tests, exceed the frozen scope without supervised reapproval or a new autonomous run contract, or lack a safe migration/rollback when one is required.

Before a candidate can become `COMPLETE`/`VERIFIED`, compare its head directly to the global contract commit on every frozen path and to the active phase contract commit on the phase-contract path. Both diffs must be empty. This check is candidate-SHA based; checking only the integration working tree is too late and the sanitized blind bundle intentionally excludes planning/evidence paths.

### Default survivor rubric

Freeze weights before seeing candidates and adjust them to the phase if needed.

| Dimension | Weight | Evidence |
|---|---:|---|
| Requirement correctness | 40 | Acceptance traceability and deterministic results |
| User outcome / UX quality | 20 | E2E, screenshots, content/API checks, and frozen subjective rubric approval where inherently subjective |
| Simplicity / maintainability | 20 | Diff, new dependencies/services, duplication, local conventions |
| Verification quality | 10 | Failure-first proof, regression coverage, non-flaky evidence |
| Integration / rollback risk | 10 | Conflict surface, migration safety, observability, reversibility |

Do not average away a P0/P1. On a score tie, prefer in order: smaller safe diff, fewer new dependencies/services, closer adherence to existing patterns, stronger evidence, easier rollback.

Prefer a complete winning candidate over a “Frankenstein” merge of attractive fragments. Combine fragments only when interfaces are explicit, the integration cost is justified, and the combined result reruns all gates.

Keep pre-merge verifier and synthesis reports under ignored `.loop/evaluation/<phase>/`. Freeze the selected SHA after any base update and final candidate rerun. Only after exact-SHA integration should the integrator copy the reports into `product/reviews/<phase>/` and commit an evidence-only follow-up.

### Pi exact-SHA verification and blind synthesis

First create detached evaluation worktrees at the immutable SHAs, never at a moving branch:

```sh
set -eu

require_full_sha() {
  value="$1"
  case "$value" in ''|*[!0-9a-f]*) return 1 ;; esac
  [ "${#value}" -eq 40 ] || [ "${#value}" -eq 64 ]
}

eval_root="$(mktemp -d "${TMPDIR:-/tmp}/product-loop-eval.XXXXXX")"
eval_a="$eval_root/A"
eval_b="$eval_root/B"
sha_a="<candidate-a-full-sha>"
sha_b="<candidate-b-full-sha>"

require_full_sha "$sha_a"
require_full_sha "$sha_b"
git worktree add --detach "$eval_a" "$sha_a"
git worktree add --detach "$eval_b" "$sha_b"
test "$(git -C "$eval_a" rev-parse HEAD)" = "$sha_a"
test "$(git -C "$eval_b" rev-parse HEAD)" = "$sha_b"
test -z "$(git -C "$eval_a" status --porcelain=v1 --untracked-files=all)"
test -z "$(git -C "$eval_b" status --porcelain=v1 --untracked-files=all)"
```

Launch one verifier per detached worktree with an absolute `cwd`. Give both the same contract/gates and anonymous label, store reports under `.loop`, and require no edits:

```typescript
subagent({
  tasks: [
    { agent: "reviewer", model: "llm-proxy/claude-opus-4-8", cwd: "/private/tmp/product-loop-eval/A", skill: false, output: "/abs/repo/.loop/evaluation/P1/A.md", outputMode: "file-only", task: "Candidate A: assert HEAD equals <SHA-A>, run the frozen mandatory gates, inspect the diff from <BASE>, do not edit, and report evidence without model/owner identity." },
    { agent: "reviewer", model: "llm-proxy/claude-opus-4-8", cwd: "/private/tmp/product-loop-eval/B", skill: false, output: "/abs/repo/.loop/evaluation/P1/B.md", outputMode: "file-only", task: "Candidate B: assert HEAD equals <SHA-B>, run the same frozen mandatory gates, inspect the diff from <BASE>, do not edit, and report evidence without model/owner identity." }
  ],
  concurrency: 2,
  agentScope: "user",
  context: "fresh",
  async: true,
  timeoutMs: 1200000
})
```

After `wait({ all: true })`, independently repeat the assertions in a fail-fast block. A dirty/moved evaluation worktree invalidates that report; preserve it for inspection rather than cleaning it by force:

```sh
set -eu
test "$(git -C "$eval_a" rev-parse HEAD)" = "$sha_a"
test "$(git -C "$eval_b" rev-parse HEAD)" = "$sha_b"
test -z "$(git -C "$eval_a" status --porcelain=v1 --untracked-files=all)"
test -z "$(git -C "$eval_b" status --porcelain=v1 --untracked-files=all)"
```

Then build a fresh temporary synthesis directory containing only:

- an identity-free extract of outcome, scope, gates, rubric, and common base SHA—never the phase worktree/owner table;
- `A.patch` / `B.patch` generated from the same base and the phase's explicit implementation-path allowlist, excluding `product/`, evidence, planning, `.loop/`, and `.pi-subagents/` metadata;
- normalized candidate-specific gate reports containing commands, exit status/actual result, and findings labeled only A/B—not raw verifier prose/log paths; and
- a manifest mapping A/B to full candidate SHA, with no owner, requested/final model, run ID, worktree, or source-repository path.

Generate patches from explicit allowlisted source/test/config/migration paths, never from the entire commit. Keep the allowlist and identity token list outside the blind directory. Before launch, scan the completed bundle for every exact owner/agent name, requested/attempted/final model ID, run ID, absolute repository/worktree/report path, and other known identity token. Any hit invalidates the bundle; rebuild/redact it instead of waiving the scan. For example:

```bash
set -euo pipefail
require_full_sha() {
  value="$1"
  case "$value" in ''|*[!0-9a-f]*) return 1 ;; esac
  [ "${#value}" -eq 40 ] || [ "${#value}" -eq 64 ]
}

blind_dir="$(mktemp -d "${TMPDIR:-/tmp}/product-loop-blind-P1.XXXXXX")"
identity_tokens="$eval_root/identity-tokens.txt"
implementation_paths_file="$eval_root/implementation-paths.txt"
command -v rg >/dev/null 2>&1
test -s "$identity_tokens"
test -f "$identity_tokens"
test ! -L "$identity_tokens"
test -s "$implementation_paths_file"
test -f "$implementation_paths_file"
test ! -L "$implementation_paths_file"
require_full_sha "$base_sha"
require_full_sha "$sha_a"
require_full_sha "$sha_b"

implementation_paths=()
while IFS= read -r path || [ -n "$path" ]; do
  [ -n "$path" ] || continue
  implementation_paths[${#implementation_paths[@]}]="$path"
done < "$implementation_paths_file"
test "${#implementation_paths[@]}" -gt 0

for path in "${implementation_paths[@]}"; do
  case "$path" in
    :*|/*|*'..'*|product/*|.loop/*|.pi-subagents/*) printf 'unsafe blind path: %s\n' "$path" >&2; exit 1 ;;
  esac
done

git --literal-pathspecs diff --binary "$base_sha" "$sha_a" -- "${implementation_paths[@]}" > "$blind_dir/A.patch"
git --literal-pathspecs diff --binary "$base_sha" "$sha_b" -- "${implementation_paths[@]}" > "$blind_dir/B.patch"

# The parent separately writes identity-free rubric.md, A-gates.json,
# B-gates.json, and manifest.json into $blind_dir.
for name in A.patch B.patch rubric.md A-gates.json B-gates.json manifest.json; do
  test -f "$blind_dir/$name"
  test ! -L "$blind_dir/$name"
done
test "$(find "$blind_dir" -type f | wc -l | tr -d ' ')" -eq 6
test -z "$(find "$blind_dir" -type l -print -quit)"
test -z "$(find "$blind_dir" ! -type d ! -type f -print -quit)"

while IFS= read -r token; do
  [ -n "$token" ] || continue
  if rg --hidden --no-ignore -a -n -F -- "$token" "$blind_dir"; then
    printf 'identity leak in blind bundle\n' >&2
    exit 1
  else
    status=$?
    [ "$status" -eq 1 ] || exit "$status"
  fi
done < "$identity_tokens"
```

Do not expose `.loop/run-state.json`, phase evidence/model ledgers, Pi artifacts, raw reports, or parent history. Install the supplied custom agent at reviewed user scope as described in [pi-orchestration.md](pi-orchestration.md). Use the one-item `tasks` form below: agent discovery stays at the parent's reviewed orchestration cwd while only the task `cwd` points at the bundle. A top-level `cwd` would move discovery into the temporary directory and fail to find the reviewed agent.

The custom tool allowlist prevents writes but its `read`/`grep`/`find` tools can still accept absolute paths. A genuine decisive blind evaluation therefore runs in an OS/container/VM sandbox whose mount policy exposes only the sanitized bundle plus the minimum reviewed Pi runtime, user-agent definition, and model credential. If that confinement is unavailable, label the result `prompt-blinded` and do not use it as the required independent selection gate.

```typescript
subagent({
  tasks: [{
    agent: "blind-evaluator",
    model: "llm-proxy/claude-opus-4-8",
    cwd: "/actual/absolute/path/returned/by-mktemp",
    skill: false,
    task: "Read only the sanitized A/B contract, patches, gate reports, and manifest in this directory. Reject mandatory failures, score survivors with the frozen rubric, and return the selected label/full SHA. Do not seek any other path or identity."
  }],
  concurrency: 1,
  agentScope: "user",
  context: "fresh",
  async: true,
  timeoutMs: 1200000
})
```

For competing candidates, wait in the same parent turn, confirm the custom blind evaluator had no fallback, inspect the exact actual final model/ordered attempts, and reject the independence claim if its canonical family overlaps any candidate owner's actual final family. For one candidate, apply the same no-fallback/model-independence checks to the normal exact-SHA reviewer. Before either selection path, resolve every phase candidate as `VERIFIED`, `REJECTED`, `SELECTED`, `INTEGRATED`, or `FAILED`; `PLANNED`, `RUNNING`, and merely `COMPLETE` candidates keep selection closed. The evaluator SHA set contains exactly the `VERIFIED`/`REJECTED`/`SELECTED`/`INTEGRATED` candidates, excludes `FAILED` candidates, and selects exactly one verified survivor. Record the complete evaluator child and immutable phase selection receipt before marking exactly one candidate `SELECTED`. The parent then asserts the selected SHA is in the evaluated-SHA allowlist and reproduces mandatory results before merge.

## 4. Integrate safely

One integrator owns the integration checkout and merge queue.

Preflight and the immediate pre-merge check must resolve and review the effective Git hook configuration (`core.hooksPath` plus the applicable merge/commit hooks). Hooks stay enabled, but they must be compatible with unattended execution, operate within the authority envelope, avoid undeclared credential/network/external mutations, and finish inside a hard deadline. An unknown, interactive, or unbounded required hook makes autonomous integration `BLOCKED` until the contract provides a safe noninteractive path.

1. Confirm the integration checkout is clean and at the expected base/branch with an assertion, not a visual-only status command.
2. Confirm the selected SHA is one of the evaluated candidates, its branch/worktree is clean, and the pinned integration/base commit is its ancestor.
3. Bring the current integration branch into the candidate and resolve/test there when it has moved. Do not rewrite shared remote history.
4. Rerun candidate gates on the updated candidate.
5. Assert the candidate branch still points to the evaluated SHA. Merge that exact SHA with history preserved, then verify in the integration checkout.

Once recorded, the integration branch identity never changes. Every later integration/evidence SHA must descend from the previously recorded integration SHA; rollback is a new forward commit, not a backward state rewrite.

```sh
set -eu

require_full_sha() {
  value="$1"
  case "$value" in ''|*[!0-9a-f]*) return 1 ;; esac
  [ "${#value}" -eq 40 ] || [ "${#value}" -eq 64 ]
}

integration_branch="codex/loop/product-integration"
candidate_branch="codex/loop/phase-01/candidate-a"
candidate_path="/abs/repo-worktrees/phase-01-candidate-a"
expected_integration_sha="<pinned-integration-full-sha>"
base_sha="<phase-base-full-sha>"
evaluated_shas_file="/abs/repo/.loop/evaluation/P1/evaluated-shas.txt"
selected_sha="<evaluated-full-sha>"

require_full_sha "$expected_integration_sha"
require_full_sha "$base_sha"
require_full_sha "$selected_sha"
test -s "$evaluated_shas_file"
selected_found=0
while IFS= read -r evaluated_sha || [ -n "$evaluated_sha" ]; do
  [ -n "$evaluated_sha" ] || continue
  require_full_sha "$evaluated_sha"
  [ "$selected_sha" = "$evaluated_sha" ] && selected_found=1
done < "$evaluated_shas_file"
test "$selected_found" -eq 1
test -z "$(git status --porcelain=v1 --untracked-files=all)"
test "$(git branch --show-current)" = "$integration_branch"
test "$(git rev-parse HEAD)" = "$expected_integration_sha"
test "$(git rev-parse "$selected_sha^{commit}")" = "$selected_sha"
git merge-base --is-ancestor "$base_sha" "$selected_sha"
git merge-base --is-ancestor "$expected_integration_sha" "$selected_sha"
test -z "$(git -C "$candidate_path" status --porcelain=v1 --untracked-files=all)"
test "$(git rev-parse "$candidate_branch^{commit}")" = "$selected_sha"
GIT_TERMINAL_PROMPT=0 GIT_EDITOR=: GIT_MERGE_AUTOEDIT=no \
  git merge --no-ff --no-edit --no-gpg-sign "$selected_sha" </dev/null
test "$(git branch --show-current)" = "$integration_branch"
git merge-base --is-ancestor "$selected_sha" HEAD
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

Execute the merge block through the parent shell/process tool with a hard watchdog timeout shorter than the remaining phase/global deadline; shell environment variables and `</dev/null` prevent ordinary prompts but cannot stop an arbitrary hook from hanging. Capture hook output and the timeout result as evidence. This example assumes the frozen authority and repository policy permit an unsigned local merge commit. If signing is required, configure a noninteractive signer in preflight and omit `--no-gpg-sign`; if the signer is unavailable, record `BLOCKED` rather than prompting mid-run. Keep reviewed repository hooks enabled.

If the repository uses protected remote branches, do not merge directly into the protected target locally. Push the selected immutable candidate/phase branch, open the required phase PR against the integration target, wait for its CI/review gates, and merge through the repository's approved mechanism. A local-only repository may use the exact-SHA merge above. After all phase PRs land on an integration branch, open the final integration PR to the default branch when that is the project's workflow.

For parallel slices, merge dependency order and rerun targeted checks after each merge plus the full relevant suite after the final merge. Resolve conflicts according to the approved behavior—not merely to make git clean. Ask the original worker/reviewer to inspect semantic conflicts.

After the exact candidate merge and its regression gate, copy the retained `.loop/evaluation/<phase>/` reports into `product/reviews/<phase>/`, update the phase evidence, inspect that only evidence paths changed, and create a separate evidence-only commit. Rerun diff/static metadata checks and the full release suite on the final integration SHA so evidence publication cannot smuggle product changes.

Never merge merely because an agent reports success. The integration SHA and its evidence are the release input.

## 5. Clean up and recover

Remove a worktree only after its outcome, evidence, and commits are retained and `git status --short` is empty inside it.

```sh
set -eu
git worktree list
git -C "$path" status --short
git worktree remove "$path"
git branch -d "$branch"
git worktree prune
```

Do not use `--force`/`-f` to remove a worktree or `git branch -D` unless the authority envelope explicitly permits discarding verified-unneeded work after the unmerged/unpushed state is shown. Keep rejected branches until the phase PR is accepted or the frozen cleanup policy permits deletion.

### Recovery checks

- Missing directory: inspect `git worktree list --porcelain` before pruning.
- Locked worktree: determine why it was locked; do not unlock blindly.
- Uncommitted changes: preserve them on the candidate branch or hand them back to its owner.
- Deleted branch with retained work: use reflog/commit IDs from the phase record; do not guess.
- Shared-resource collision: stop both workers, assign unique namespaces, reset the external state safely, and rerun affected gates.

Primary reference: https://git-scm.com/docs/git-worktree.html
