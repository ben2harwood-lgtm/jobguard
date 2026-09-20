# UIWIRE-7 proof subject repair — implementation receipt

Author: ChatGPT, directly implementing Ben's 19 September request to keep building JobGuard. Not a Codex execution or Claude verdict.

Base: ab8e7f2d9d43ac5ec6ff62bff2533b0fa508d404. Receipts PR #65 remains separately owned and unmerged.

## Defect

Confirmation retains dismissed/split/merged identities as retired, without scope_progress. Three independent queries (proof view, Decision evaluation, final-account requirements) selected the earliest identity regardless of state. Captured identities can share created_at and UUID ordering can place a dismissed identity first. Evidence can be finalized for that identity but completion rolls back with scope_progress_missing, surfaced as HTTP 422/PROOF_INVALID. Repeated completion cannot create the missing operational scope.

## Change

One read-only, tenant/job-qualified confirmed-scope selector is shared by all three consumers. Stable created_at/id ordering remains. Final-account assembly fails closed if no confirmed scope exists. No migration, privilege change, identity rewriting, approval-policy change, timeout increase or assertion removal.

Six real-PostgreSQL regression tests cover the old selection, confirmed ordering, wrong job, empty confirmed set, actual runtime tenant isolation and finalization/completion/idempotent replay.

## Evidence status at authoring

Source inspection completed. Local package installation/execution blocked: this session cannot resolve GitHub/package hosts and has no pg/vitest/browser dependencies. CI must run the existing pinned install, typecheck, lint, all tests, production build and mobile/desktop browser regressions. New test code is not a claimed test pass.

The historical registered UIWIRE-7 branch name is reused only for this same-task repair after verifying no such live branch exists; no lane grants are widened. Independent Claude review, technical acceptance, founder merge/release and real-data gates remain outstanding.
