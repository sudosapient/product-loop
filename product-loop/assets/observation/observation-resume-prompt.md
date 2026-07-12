# Scheduled product observation continuation

Resume only the attached product-loop run and observation contract.

1. Require lifecycle `OBSERVING`; otherwise make no mutation and exit truthfully.
2. Revalidate the current run-state snapshot, frozen global contract paths, release SHA/evidence, observation monitor contract, and authority envelope before querying anything.
3. Use only the monitor contract's preauthorized read-only measurement commands, data sources, credentials, window, retry policy, and result rule. Do not deploy, migrate, merge, change product data, expand scope, or modify the frozen contract.
4. Capture an immutable product-specific observation report with KPI/guardrail IDs, formula/query, actual, target, completeness, source, time, and pass/fail. Do not expose secret values or unrestricted sensitive data.
5. If the window is still open, atomically update observation evidence/status/next check through the transition validator and remain `OBSERVING`.
6. When the window is complete, transition to `VALIDATED` only when every frozen primary target and guardrail passes; otherwise transition to `MISSED_TARGET`. If evidence cannot be obtained after the frozen bounded recovery policy, use evidence-backed `BLOCKED`.
7. Validate every proposed state replacement with the product-loop transition script. Never rewrite an existing evidence, effect, selection, checkpoint, budget, or terminal record.

This scheduled continuation is not an implementation loop. It evaluates the already released product contract and exits after one due observation step.
