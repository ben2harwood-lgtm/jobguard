# LATER-SAFETY-188 — mandatory approval queue eligibility (RED)

Preflight: branch `codex/sandbox/later-safety-188`, clean issued base
`fd7a1ae06ac89ea02321c9bbe67238db548c8f90`. The effective queue is still
0637; the effective writer is 0749, retaining the LATER-SAFETY-49 history query.
No fetch, git writes, PR, CI launch, deployment or activation was performed.
The worktree lacks `docs/workflow/CODEX_SESSION_POLICY.md`; read the existing
shared-checkout copy at the same path under the repository root. Admission and
session binding remain the router's responsibility.

0759 replaces only `app.xa_queue(uuid)` from 0637. Two exclusions mirror
`xa_approve`: the tenant/job/variation-qualified origin's raiser, and an actor
whose prior approval or succeeded rejection occupies another slot (including an
unknown legacy rejection slot). History remains per variation across request
revisions; Q04 same-slot reuse stays allowed. The history query deliberately
matches the writer's ordering and NULL handling rather than introducing a new
interpretation. Queue visibility remains a read projection, never authorization.

Signature, result columns, SECURITY INVOKER, pg_catalog search path, tenant and
request selection, grants, owner, escalation roles and London deadline expression
are retained. CREATE OR REPLACE preserves owner and ACL. No rows, table policies,
privileges or routine identities change, so the proof loader's lp0, upgrade and
tenancy metadata deltas are empty. Both successor-body suites now pin xa_queue
to 0759; every other entry, including LP6D-bound callees, is retained.

Forward fix: use another reviewed forward migration if a correction is needed;
never edit 0637, 0749 or a landed 0759. Restoring the old queue would reintroduce
forbidden mandatory items and is not the recommended rollback. There is no data
backfill or destructive schema operation.

Authored: nine real-PostgreSQL cases through ExtraApprovalRepository.queue,
existing chain fixtures and testActorContext/withTenant. They cover self-approval,
same-request and cross-revision slot reuse, Q04 visibility and successful writes,
succeeded rejection history, guarded legacy unknown-step rejection history,
revoked grants/members, scope/tenant isolation, listed alternates and London
weekend deadline preservation. Both mutation probes replace only one exclusion
in the disposable test cluster and transactionally restore the original function
in finally; the queue exclusion assertion must fail while its mutant is installed.

Executed locally (Node 24.17.0, cached pinned pnpm 10.28.1, Vitest 4.1.12):

- `pnpm typecheck`: 7 packages passed. A temporary PATH shim selected the cached
  pinned pnpm for Turbo's child commands; harmless cache-write permission warnings
  were emitted. The first invocation through the host pnpm stalled attempting a
  registry version switch and was interrupted; no packages were downloaded.
- `pnpm --filter @jobguard/db exec vitest run --config /tmp/later-safety-188-vitest.config.mts --maxWorkers=1 test/migration-proof-loader.test.ts test/extra-approval-timing.test.ts src/extra-approval-chain-repository.test.ts`:
  3 files, 110 tests passed. The initial unmodified-config run passed 17 timing
  tests but the other two suites could not import missing dependency dist outputs.
  The temporary config imports the repository config unchanged and adds only core
  and storage source aliases; setup files and guards remain in force. No repository
  config was changed and no dependency build was run.
- `vitest list` with the same temporary config and `--maxWorkers=1`: discovered
  all nine new integration cases without executing their database hooks.
- Dedicated `tsc -p /tmp/later-safety-188-typecheck.json` including the new
  integration file and its imports: passed. Workspace typecheck excludes test files.
- `git diff --check`: passed. Source comparison also confirmed the 0637 queue body
  is byte-for-byte preserved outside the exclusions and local record declaration.

Not executed here: PostgreSQL regressions, mutation probes, fresh/upgrade proofs,
catalog privileges/RLS, whole database suite, browser journeys, lint or build.
Actual mutation results are PENDING, not a source-only PASS. The sandbox forbids
PostgreSQL and browser execution. The router's database-capable check must run
0759's new suite, both successor-body suites, extra-approval-chain (E5B-01/02,
LATER-SAFETY-49 and direct SELF_APPROVAL/REUSED_APPROVER), extra-approval-rules,
enterprise-dashboard weekend deadline and extra-escalation suites, then the
whole required database and migration suites and remaining required CI against
current main (at most two workers, preferably one; at most three named Vitest
files per targeted run).

Independently checked: not yet. Integrated/pushed: not yet. RED exact-head review,
router migration ordering and green CI remain required. NOPR build-ahead only;
this slice does not close ENT-5 or enable scheduling/delivery or any release gate.
