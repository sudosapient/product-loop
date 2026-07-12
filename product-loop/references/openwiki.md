# OpenWiki documentation automation modes

## Product choice

Use LangChain's `langchain-ai/openwiki` CLI for this requirement. It creates agent-oriented repository docs under `openwiki/` and records the covered git head. Do not confuse it with Vercel Labs' hosted `openwiki.sh`, which is a larger web application and does not provide the same lightweight docs-PR workflow.

Primary sources:

- Repository and CLI: https://github.com/langchain-ai/openwiki
- Official workflow example: https://github.com/langchain-ai/openwiki/blob/main/examples/openwiki-update.yml
- GitHub token behavior: https://docs.github.com/en/actions/concepts/security/github_token
- GitHub Actions security: https://docs.github.com/en/actions/reference/security/secure-use
- Workflow concurrency: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency

OpenWiki was at `0.1.0` on 2026-07-10. Treat it as an early pilot: lock the dependency graph, review its output, and do not make it a release blocker until repository-specific reliability and security are measured.

## Define freshness honestly

Choose one mode explicitly in the product/run contract:

| Mode | Asset | Result | Ordering semantics | Default use |
|---|---|---|---|---|
| Latest accepted head | `assets/openwiki-update.yml` | One reviewed docs PR converging on the newest quiet default-branch head | Coalesces/cancels superseded runs; not per commit | Normal documentation freshness |
| Literal per-commit audit | `assets/openwiki-per-commit.yml` | One read-only, SHA-keyed generated artifact for every enumerated commit | May run concurrently or finish out of order; not a FIFO queue | Explicit audit/evaluation requirement |

The recommended latest-head workflow triggers on every non-OpenWiki push to the trusted default branch, then coalesces rapid pushes so the docs converge on the latest accepted head. It does **not** create one result for every individual commit: a push may contain multiple commits, and concurrency cancellation intentionally skips superseded runs.

The opt-in per-commit workflow enumerates every commit in the exact `before..after` push range and launches one read-only generation job per SHA. It deliberately has no concurrency group. GitHub Actions concurrency is not FIFO and cannot prove strict serialization; separate workflow runs may overlap, and matrix jobs may complete out of order. The artifact name and manifest bind each result to its immutable source SHA.

The supplied literal mode fails closed for a branch-creation zero `before` SHA and for ranges over 200 commits. Use its manual dispatch with explicit full `before_sha`/`after_sha` values to backfill bounded ranges. It requires the locked runner and initialized OpenWiki files to exist at every enumerated commit, so enable it from the reviewed OpenWiki setup commit forward. If the audit requires strict ordered processing, indefinite retention, or exactly-once recovery across GitHub outages, use a real external durable queue/store keyed by SHA; do not represent a GitHub concurrency group as that queue.

## Threat model and privilege separation

OpenWiki `0.1.0` gives its agent a local shell backend. Repository text can contain prompt injection, so prompt instructions are not a security boundary. The supplied workflows preserve these privilege boundaries:

- **Both generation modes:** read-only repository token, no persisted git credential, one dedicated/budget-limited provider secret, and no repository write permission.
- **Latest-head publish job only:** repository/PR write permission, no provider secret, and no execution of generated documentation.
- In latest-head mode, generated `openwiki/` crosses jobs only as a one-day artifact and is checked for symlinks/nested git metadata before publication. In literal mode, each generated tree is paired with a source-SHA/hash manifest and retained as a read-only artifact for the configured period.

For a private or sensitive repository, use a hardened runner/container with outbound access restricted to the chosen inference endpoint. GitHub-hosted runners do not provide a strong per-job egress allowlist; if that risk is unacceptable, do not enable AI-generated documentation in CI.

## Install in the correct order

1. Choose an OpenWiki-supported provider/model and decide whether repository data may be sent to it.
2. Create a protected GitHub environment named `openwiki` and restrict its deployment branches/tags to the actual default branch. The workflow also asserts the default branch before either job runs.
3. Add a dedicated, low-budget `OPENROUTER_API_KEY` environment secret and an `OPENWIKI_MODEL_ID` environment variable, or adapt both workflow values to another supported provider.
4. Run local initialization **before** installing the hardened workflow, because `openwiki code --init` writes its own `.github/workflows/openwiki-update.yml`:

   ```sh
   npm install --global openwiki@0.1.0
   openwiki code --init
   ```

5. Review/commit the initial `openwiki/` docs and any intentional `AGENTS.md`/`CLAUDE.md` changes.
6. Copy `assets/openwiki-runner/` to `.github/openwiki-runner/`, then choose exactly one installed workflow:
   - normal freshness: replace the generated workflow with `assets/openwiki-update.yml`;
   - explicit per-SHA audit: replace it with `assets/openwiki-per-commit.yml` and record artifact retention/backfill ownership.
7. Replace `main` with the actual default branch. In latest-head mode, optionally add repository-specific `paths:` filters. Do not add push path filters to literal per-commit mode unless the frozen requirement intentionally excludes whole pushes; otherwise GitHub can skip an event and violate per-SHA coverage.
8. In Settings → Actions → General, allow GitHub Actions to create pull requests, or use a deliberately scoped GitHub App instead.
9. Keep `pull_request`/`pull_request_target` absent from the secret-bearing job. In latest-head publication mode, require the frozen execution-contract reviewer for generated docs (named human in supervised mode; preauthorized independent reviewer plus deterministic guards in autonomous mode).

Step 8 is required only for latest-head PR publication. Literal per-commit mode has no repository/PR write job: it keeps `contents: read`, transfers only generated docs plus a SHA/hash manifest to a retained artifact, and never publishes or merges those historical outputs automatically. Configure the `openwiki` environment without required reviewers when the autonomous contract forbids routine human pauses; otherwise classify the environment approval as supervised or `NOT_READY` before kickoff.

The runner lockfile pins OpenWiki's transitive dependency graph. Install scripts stay disabled globally; the workflow rebuilds and smoke-tests only the reviewed `better-sqlite3` native binding OpenWiki requires. Upgrade the top-level package, lockfile, native-build allowance, and reviewed action SHAs together.

## Pilot verification

For a latest-head pilot push, verify:

- the generate job has only `contents: read` and checkout credentials are not persisted;
- the publish job has no provider secret and does not execute generated files;
- after the branch is quiet, the workflow opened or updated exactly one docs PR for the latest head;
- `openwiki/.last-update.json` identifies the expected source git head;
- links/source references in changed docs resolve;
- the artifact/PR contains no credential, symlink, nested `.git`, prompt-injected instruction, or unrelated file;
- merging a docs-only PR does not retrigger the OpenWiki workflow; and
- logs and artifacts expose no secret values.

For literal per-commit mode, make a bounded test push containing two commits and verify:

- enumeration outputs both full SHAs in ancestry order;
- each SHA is checked out exactly and produces a distinct `openwiki-per-commit-<sha>` artifact;
- each artifact contains `openwiki/` plus `.openwiki-per-commit-evidence/manifest.json` bound to that SHA;
- neither job has repository/PR write permission and no provider secret appears in generated files;
- overlapping jobs may complete in either order without overwriting each other's artifact; and
- a zero-before branch creation or range above 200 fails with an explicit manual-backfill instruction rather than silently skipping commits.

## Freshness KPI

Suggested starting service level:

> In at least 95% of observations, within 15 minutes after the default branch becomes quiet, one reviewed OpenWiki PR records the current head; source references resolve; and zero secrets appear in logs, artifacts, or diffs.

Measure actual inference cost per accepted docs update. If this freshness does not change agent/reviewer outcomes, switch to daily or release-based updates—the simpler upstream default.

For literal per-commit audit mode, use a coverage target instead of the freshness statement:

> For every in-scope SHA after the recorded setup commit, exactly one retained artifact manifest identifies that SHA; generation failures are visible and backfilled; and zero repository-write credentials or provider secrets appear in generated output.

Artifact retention is finite and is not an audit archive by itself. If evidence must outlive the configured retention window, copy the SHA/hash manifest and approved output to the frozen external evidence store named in the run contract.

## Residual safety notes

- The provider key remains exposed to the OpenWiki process by necessity. Make it dedicated, budget-limited, revocable, and isolated from other secrets.
- Generated documentation is untrusted AI output. Keep branch protections and contract-required independent review. Autonomous docs-only merge is allowed only when preflight explicitly authorizes it and source-reference, size/type, secret, link, diff-scope, and independent-review gates all pass; otherwise leave the PR unmerged without pausing the product loop or mark docs publication `NOT_READY` before kickoff when it is release-critical.
- `GITHUB_TOKEN`-created pushes do not recursively start ordinary push workflows, while PR workflows for bot-created PRs may still require approval. Retain appropriate latest-head path filters and document the repository policy; literal mode normally avoids push path filters to preserve per-SHA coverage.
- Do not ingest private repositories into hosted alternatives without an explicit privacy/data-retention decision.
