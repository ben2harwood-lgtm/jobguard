# FEE-STORE-AUTHORITY — READY for router handoff (RED, NOPR)

Piece FEE-STORE-AUTHORITY on `codex/sandbox/fee-store-authority`, based on
`fee-store-safety` at `1bf409d6cc39919eb1bdd498d73d979585167ba1`.
Source-built and locally checked; not independently reviewed, committed, pushed,
merged or database-verified. The router owns those next steps. Made-up data only.

The raw release/history and archive-poison regressions were written before the
implementation. PostgreSQL execution of their predecessor failures was not
possible in this sandbox; these are not reported as observed failing database runs.

Migration `1065_fee_store_authority.sql` starts from 0608's latest guard body:

- Withdraw runtime archive INSERT. Runtime retains SELECT. A private helper owned
  by the existing audit writer inserts archive records; runtime cannot execute it,
  and the migration table owner still has no direct archive write policy.
- Derive chained audit events inside the replacement routine from actual attempt
  differences. The supplied book list is checked for exact new state transitions,
  but cannot substitute for `app.audit_event`. Same-state payment/object lifecycle
  changes also receive a chained event. Archive writes precede the seal; the audit
  head stays the final contending lock. No client-side append duplicates these events.
- Resolve unknown results only with a signed, versioned synthetic fixture bound
  to the tenant and entire resulting attempt, including command, rail, amount,
  immutable authority identity and provider object. Missing, altered and wrongly
  bound results fail closed. All other result/lifecycle changes are signed too.
  Existing fake adapters attest only after submit returns or their signed webhook
  passes verification; their test signing helpers remain synthetic fixture APIs.
- Store fixture verification keys in a new tenant-keyed private table with FORCE
  RLS, owner-only tenant SELECT and no runtime/infrastructure grants. Only the
  administrative synthetic fixture provisions keys; the migration seeds none.
  Its tenancy proof truthfully records `guarded: false`: this private SELECT
  policy is not an ALL/write policy. No new role, production key, route, rail or
  provider protocol is introduced. An application holding a fixture signing key
  is trusted; this does not protect against a compromised signer or database admin.
- Retain released snapshots/revisions, absolute audit ordinals, event replay keys,
  unknown reservations and immutable identities. The routine validates stored
  shapes before archiving to prevent malformed writes poisoning subsequent reads.
  No historical audit is invented or rewritten during upgrade/compaction.

Complexity is limited to the private seal and fixture-key verification needed to
separate raw runtime SQL from provider-result authority. The store now makes one
replacement call and no archive INSERT or generic audit append. LP-0 changes are
new named entries in the 1065 proof, including the exact 0604/0608 before records;
the historical proofs and scanners/pins are unchanged. No existing table gains a
column. No function has a SET app.* clause.

Local checks (installed binaries, at most two Vitest workers and three named files
per run; no downloaded dependencies):

- API/database TypeScript checks: `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`
  and `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- `apps/api/node_modules/.bin/vitest run --root apps/api --maxWorkers=2 src/fee-collection/postgres-reservation-store.test.ts src/fee-collection/executor.test.ts src/fee-collection/fake-gocardless.test.ts`
  — 116 passed. These are deterministic adapter/executor checks, not PostgreSQL proof.
- `packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts`
  — 107 passed after the final LP-0 proof changes.
- `apps/api/node_modules/.bin/vitest run --root apps/api --maxWorkers=2 src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`
  — context/identity 152 passed; watchdog initially could not import the missing
  built AI package. After building the installed AI source, the named watchdog
  rerun passed 126 tests. Core/config/storage/db builds likewise restored missing
  local package exports before the focused API tests; no source checks were weakened.
- `packages/db/node_modules/.bin/vitest list --root packages/db --maxWorkers=2 test/fee-reservation.integration.test.ts test/fee-reservation-archive-upgrade.integration.test.ts`
  — collected all 30 cases, including the new regressions and populated upgrade;
  collection only, no PostgreSQL execution.
- Money, commercial, core-purity, AI-provider and PL/pgSQL CASE-in-IF lint scripts
  — PASS. Core purity retains its 11 existing reported computed-import warnings.
- `git diff --check` — PASS. Exact path comparison through the lane tool's exported
  `lanePathAllowed` — PASS: 12 changed paths from fee-store-safety plus its own
  lane, which does not list itself. No git-writing command was run.

The pnpm launcher attempted registry release-signature verification and failed
before executing checks. All successful checks above used the installed binaries;
no registry-verification setting or dependency pin was changed.

Named holds for landing:

1. **POSTGRES-1065 / RED-EXACT-HEAD.** CI must run the real PostgreSQL reservation
   and populated-upgrade files, including raw release/compaction refusal, archive
   poisoning, signed/unsigned/tampered/wrong-company/wrong-command/amount results,
   archive owner/runtime/infrastructure privileges, chained lifecycle/release
   events, atomic rollback, both-rail races, refund/retry limits, late settlement,
   restart/replay and migration replay. Run the full mandatory database/migration
   suites, particularly LP-0 catalogue/authority paths, tenancy and the named
   successor expectations. Independent RED review is required at the committed
   head before merge. No PostgreSQL or browser suite ran here.
2. **LANE-COMMITTED-RANGE.** The lane CLI against default main includes the parent
   fee-store-safety work and correctly refuses it. Against the task's required
   `LANE_BASE_REF=codex/sandbox/fee-store-safety`, it refuses a self-comparison
   because this read-only-.git sandbox cannot commit and HEAD still equals the
   base. The exact worktree path check passes. The router must rerun the unchanged
   CLI with that base after committing; do not widen this task's lane to parent work.
3. **ACTIVATION.** Existing production-source/commercial/release gates remain.
   This is a dark synthetic store; no route or live rail is enabled by this change.

No scanner or pin edit was needed by the local checks. Forward-fix only: preserve
book/archive/audit rows and the stricter grants if a later correction is needed;
do not roll back by restoring runtime archive writes or unsigned result authority.

Initial source review, LATER / SIMPLICITY: the strict attempt shape in
`apps/api/src/fee-collection/postgres-reservation-store.ts` and migration 1065 must
stay aligned. A future schema change should centralize its versioned contract
checks, reducing drift maintenance. This is non-blocking and adds no framework here.
