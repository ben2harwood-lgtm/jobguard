# MIGFIX-3 builder receipt r4 (Opus REPAIR on 78d86ede: B1, B2)

Not independently verified, not accepted. B3 (lane/rule G for packages/db/test/audit-api-file-final-account.test.ts) is the coordinator's; that test change was kept, not undone.

## What changed (migration 0152 only; no other migration)
- **B1.** All five runtime-owned helpers (`proof_command_id_taken`, `proof_mark_rework`, `proof_current`, `proof_link`, `proof_replacement_eligible`) are gone. Nothing in schema `app` is owned by `jobguard_runtime`; no `OWNER TO jobguard_runtime`, so no superuser runner needed. No policy or grant on any older table (MO5-e unchanged and passing).
  - The old-store command-id check and the `stage_review_event` rework marks now run in the application transaction (`proof-repository.ts`, `invalidate`) under the runtime's existing rights, right after `invalidate_proof_command` (a hit throws COMMAND_CONFLICT and rolls back the whole transaction).
  - `replace_stage_proof` now takes the facts held in older tables (job, scope, stage, current generation and replacement, link evidence and type; 15 args). It re-checks everything it can see itself (latest replacement/generation, invalidation belongs to the job/scope, replacement evidence is original, verified, uninvalidated, right type, approved Decision/finding fingerprint, live job, owner). `stage_proof_replacement` gains `evidence_id` + `required_evidence_type` with an FK to `evidence_link` (new UNIQUE `evidence_link_replacement_identity`), plus the existing FKs to stage_completion, stage_review_event, command_receipt and audit_event, so the passed facts are tied back to real rows by the database.
- **B2.** The lock-free `c_` trigger is replaced. A lock was tried first (non-waiting `pg_try_advisory_xact_lock`, Opus's suggestion, on the 0096 key and on a new key, shared and exclusive): it fails protected tests (site-visit R2/B11 hold exactly one advisory key through `command_receipt` inserts; watchdog-lock-order forbids any new advisory key after the audit append in `inbox_outcome_event` inserts). So the guard now writes `app.proof_command_namespace` (new table, text `command_ref`, kind store|invalidation, unique key) and refuses if an invalidation owns the id; `invalidate_proof_command` inserts its own row the same way. The unique key makes each side wait for the other's outcome and then see it. No advisory or row lock is added to older-store transactions. Ids committed before 0152 have no namespace row: the application check above covers them. Same-command replays unchanged (first-writer-wins, ON CONFLICT DO NOTHING).
  - The namespace table: FORCE RLS, runtime SELECT only, migration-role policy `USING(true)` because previous-schema writers run without a tenant setting. It keeps the id as text so the uuid-column scan in watchdog-legacy-identities does not see a second home for every command id.
- Tests added (migfix-3.integration): `[MIGFIX-3.4]` barrier test racing an unlocked `command_receipt` insert against an invalidation with the same id, both orders (waits observed in pg_locks, then COMMAND_CONFLICT / IDEMPOTENCY_CONFLICT); `[MIGFIX-3.7]` pins owner, SECURITY DEFINER, `search_path`, EXECUTE grantees (runtime only on invalidate/record/replace; infrastructure and PUBLIC none) for all six 0152 routines and asserts no function or table in `app` is runtime-owned.
- MIGRATIONS.md 0152 entry updated (new `replace_stage_proof` signature, no migration-role access to older tables, namespace table).

## Set-up-only / rows-only additions to protected tests (separate commits)
1. `audit-api-file-final-account.test.ts`: one fake-SQL line before `throw new Error("Unexpected SQL")` flow: `if (sql.includes("AS taken")) return rows([{ taken: false }]);` (answers the application's new command-id check). No expectation changed. Same file the coordinator already holds under B3.
2. `tenancy.integration.test.ts`: two catalogue rows for the new table `proof_command_namespace` (RLS flags row and owner row), in sorted position. Rows only; the file is already in this lane's allow list. This does add to a pinned list, so it needs the coordinator's ruling.

## Commands (packages/db, heavy-slot, vitest --maxWorkers=2, 3 files per run)
| Files | Exit | Result |
|---|---|---|
| migfix-3, watchdog-legacy-identities, watchdog-lock-order | 0 | 60 passed |
| migfix-3-upgrade, audit-api-file-final-account, site-visit | 0 | 60 passed |
| audit-export, job-work-state-sources, job-work-state-upgrade | 0 | 26 passed |
| tenancy, final-account, recovery-case-terms-upgrade | 0 | 15 passed |
| `pnpm typecheck` (turbo, all packages) | 0 | 7 tasks ok |
| `node tools/agent-lane-boundary-lint.mjs` / `tools/lint.mjs` | 1 | only finding: lane migfix-3 cannot edit audit-api-file-final-account.test.ts (B3, coordinator's) |

## Not run
Full db suite, test:migrations, OpenAPI check, e2e. Failing-first for the new MIGFIX-3.4 barrier test was not run against the pre-change migration (it was written against the final design; earlier lock-based attempts failed other tests as described). Not independently verified, not accepted.

## Residual risk to rule on
The checked writers can no longer verify facts in `stage_completion`, `evidence_link`, `stage_review_event` and the older command stores (invisible to the migration role without widening MO5-e). Those are checked by the application in the same transaction and tied back by foreign keys; a caller with the runtime's EXECUTE grant could still pass untrue job/scope/stage/generation values, which the FKs and the checks above mostly, but not fully (the receipt "claimed in this transaction" check), catch. The old-store id collision check is application-side for ids committed before 0152.
