# MIGFIX-3 CI repair receipt (CI run 38543694458, head 828504e3)

Not independently verified, not accepted.

## Root causes and classification
| Failing test(s) | Class | Cause / fix |
|---|---|---|
| audit-export (MO5-e), job-work-state-sources r8, job-work-state-upgrade CH4-A24 | (a) | 0152 added permissive `proof_migration_writer` policies to stage_completion, stage_review_event, evidence_link (widened older permission facts). Policies removed; older-table reads/writes now in runtime-owned helper routines (`proof_command_id_taken`, `proof_mark_rework`, `proof_current`, `proof_link`, `proof_replacement_eligible`), EXECUTE only for jobguard_migration. |
| watchdog-lock-order (6), site-visit R2 (2), watchdog-legacy-identities (4 incl. hook timeout cascade) | (a) | `a_proof_command_namespace` trigger on 12 older stores took a BLOCKING advisory lock after the audit append and fired before 0096's non-waiting reservation. Trigger renamed `c_`, takes no lock (0096 `b_` already holds the id lock; invalidate_proof_command takes it). |
| recovery-case-terms-upgrade (suite) | (a) | final-account `assemble` read `app.current_stage_proof`, absent at an older schema. It now repeats the transaction reading `app.stage_completion` when the view does not exist (42P01). |
| audit-api-file-final-account "proof invalidation restores..." | (b) | Scripted SQL fake did not know the new invalidation routines. Set-up only, own commit: fake answers `proof_invalidation_response` replay, `invalidate_proof_command`, `record_invalidation_response`; plus one `vi.spyOn(proof,"project")` stub beside the existing `get` stub. Expectations unchanged. |
(c) conflicts: none.

## Note
Migration 0152 now needs the migration runner to be allowed `ALTER FUNCTION ... OWNER TO jobguard_runtime` (superuser or member; true in CI/embedded). Please confirm for production.
migrate.ts gap (0151 on PR #199) did not cause any failure.

## Commands (packages/db, via heavy-slot, vitest --maxWorkers=2, 3 files each)
- legacy-identities + lock-order + recovery-case-terms-upgrade: exit 0, 49 passed
- audit-export + job-work-state-sources + job-work-state-upgrade: exit 0, 26 passed
- site-visit + migfix-3 + migfix-3-upgrade: exit 0, 69 passed
- audit-api-file-final-account + tenancy + final-account: exit 0, 15 passed
- `pnpm --filter @jobguard/db typecheck`: exit 0
Not run: full pnpm test, test:db, test:migrations, openapi:check, e2e (CI is the proof).
