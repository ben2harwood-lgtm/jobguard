# LATER-SAFETY-8: pay-now refusals and catch statement

Forward replacement of the latest main routine in 0598 only. No table shape,
owner, privilege, RLS policy, trigger, function signature or stored row changes.
0648 is the reserved landing stem (renamed from 1202).

Invalid, expired or revoked company sessions now raise PAY_NOW_UNAUTHENTICATED
(28000), before the existing mon1_company_actor owner/admin gate. Both checks
repeat after command/invoice lock waits and before replay. METER_FORBIDDEN
remains the membership/role refusal and maps to FORBIDDEN (403); session
refusals map to UNAUTHENTICATED (401). Unexpected faults and snapshot integrity
failures remain UNAVAILABLE (503). The same classifier serves repository calls
and GET's direct prepare. History's existing verified-context boundary stays
unchanged. No private helper grant was added.

New projections derive only includesCatch, using the tenant/job-qualified
final_account_line -> variation_revision -> extra_origin join from 0413.
The invoice's own final-account revision binds the lookup; line_kind=variation,
source_id=revision.id and kind=jobguard_catch are required. No shadow tables are
read by this lookup. Prices, options and fee rules are unchanged.

Replay returns the prior record before evaluating the new projection. The
source fingerprint still hashes only the same invoice, credit, payment and
reversal identities; neither includesCatch nor projection bytes enter it.
There is no UPDATE/backfill: previous false statements and their record_hash,
snapshot_hash and replay bytes are preserved. Their fingerprint remains spent.

Proof sections lp0, upgrade and tenancy are explicitly empty because the
catalogue metadata tracked by those suites is unchanged: same definer posture,
search_path, ACLs, static app calls and writes; no new object or policy.
The lifecycle upgrade's predecessor inventory predates 0598, so this replaces
no routine in that inventory and needs no exception/pin edit.

Verification: failing unit tests were written and observed before the refusal
fix; PostgreSQL regressions were authored before the forward migration but
cannot execute in this sandbox. Added source fixtures retain all origin/FK/
approval/lock guards; they do not claim an end-to-end detector or confirmation
journey. Tests cover true/false at equal invoice totals and fees, old-routine
records, byte/hash preservation across replacement, original-result replay,
consumed fingerprints, role/session refusals through the routine, and refusals
on replay after revocation/expiry. Existing isolation, concurrency, balance
changes, immutability and browser journey remain.

CI must execute both pay-now integration files, PostgreSQL fresh/upgrade,
catalogue/privilege/RLS and migration suites, and the unchanged
MON-6-stored-pay-now-preview.spec.ts at phone and desktop widths (headless,
at most two workers). Independent RED review binds the committed head.
MON-6 and every release/decision gate remain open/closed as before; this
finishes no plan piece.

Forward-fix strategy: replace only this exact routine in a later migration
while preserving prior records and hashes. Emergency rollback may restore
0598's routine body (and preserve ACLs) at the cost of reverting the corrected
refusal/statement behavior; never rewrite or delete stored attempts.

Final repair round (B2): the catch fixture now uses the existing insertPhoto
helper to create verified fictional evidence before lock and links the signal
to its exact stored object version, hash and receive time. This lets the shared
completion helper classify the signal instead of publishing an incomplete
zero result. sv5pre-fixtures.ts, B1/B3 fixes and every assertion are unchanged.
Local pay-now repository unit checks: 34 passed with at most two workers.
PostgreSQL/browser execution is unavailable in this sandbox; the catch,
equal-debit and predecessor/0648 replay assertions still require CI and
exact-head independent RED review before landing.

Landing catch-up (6 November 2026), B2-TEST-74: resolved the lifecycle
upgrade conflict by retaining both the batch's exact routine-body checks and
main 46f0be7ea's complete newer routine checks. Compared every replacement
in 0646-0649 against main's latest definition (0600 retention, 0597 notice,
0598 pay-now); only this batch's existing safety deltas remain. The timer and
attestation routines are new; no main migration is modified or duplicated.
The options comparison excludes only destinationAccount and separately checks
every option against its own tenant's fake destination. All remaining money,
replay and isolation assertions are unchanged. Lane paths exactly match the
diff from the merged main, excluding config/lanes/.

Local checks (installed binaries, maxWorkers=2, at most three named files/run):
- packages/db/node_modules/.bin/vitest run --maxWorkers=2
  test/pay-now-attempt-repository.test.ts test/migration-proof-loader.test.ts
  test/notice-fixture-repository.test.ts: 128 passed.
- packages/db/node_modules/.bin/vitest run --maxWorkers=2
  test/retention-record-repository.test.ts test/vat-fixture-repository.test.ts
  test/purchase-order-action.test.ts: 71 passed.
- node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit: passed.
- TypeScript transpileModule syntax checks for the two resolved/authorized
  integration-test edits: passed; this does not execute those integrations.
- Existing lane policy loader, exact path equality and migration-order check:
  passed. git diff --check MERGE_HEAD: passed.
PostgreSQL and browser suites were not run: this sandbox cannot start the
services or bind localhost. CI and exact-head RED review remain landing gates.
READY for router staging/commit; the read-only Git index is left to the router.


Landing preparation (6 November 2026, batch-46):
- Resolved the unfinished main merge as the union of both pay-now test groups
  and both lifecycle-upgrade routine inventories; retained practiceDarkFixture
  and B2-TEST-74's per-tenant destination assertions.
- Final migration inventory against origin/main daed0c282: 0646 retention timer
  runtime rules, 0647 notice live-job check, 0648 pay-now catch statement and
  0649 order attestation actor. SQL files are byte-identical to the prechecked
  1200–1203 files; all their named references, proof files and notes moved.
  None duplicates main. Compared all three replaced app routines against main's
  latest bodies (0600, 0597, 0598); only the existing batch safety deltas differ.
  The other three app routines are additions. No new table or registry row is
  introduced here, so MIGFIX-6 and restore-reconciliation row snapshots remain
  exact without new exceptions. MIGFIX-7 now pins the three replacement bodies
  and the three additions' bodies and proof metadata, retaining every other
  comparison. No provider-register source changed.
- Passed local checks using installed pnpm 10.28.1: typecheck (all seven
  workspaces, turbo --concurrency=2); database Vitest migration-proof-loader,
  purchase-order-action and pay-now-attempt-repository (153 tests); API Vitest
  pay-now-attempt.application, retention-record.application and
  notice-fixture.application (59 tests); web Vitest pay-now-preview/screen,
  notice-fixtures/screen and practice-bank/screen (21 tests). Each Vitest run
  used --maxWorkers=2 and at most three named files.
- Static core-purity, money-arithmetic, commercial-boundary, AI-provider-boundary
  and PL/pgSQL CASE-in-IF lint checks pass (zero SQL exceptions).
- Both commercial-integrity guards pass (94 protected roots, zero diagnostics);
  existing fingerprints and reasons need no further change. Affected production
  web routes use @jobguard/api/workspace, with no direct api source import;
  Cloudflare build was not run. git diff --check passes.
- Ran the standard lane lint: its local mode includes merged-in index paths and
  old deleted stems while the merge index is read-only, so it cannot pass until
  the launcher stages/completes the merge. Separately ran the same exported
  lanePathAllowed and migrationOrderViolations checks on the final working-tree
  diff against MERGE_HEAD/origin/main: 71 paths, zero violations, exactly the
  four migrations above, all above main's 0638. Lane lists the exact final diff
  and excludes itself. Launcher must rerun the standard lane lint after staging.
- PostgreSQL fresh/upgrade/catalogue/privilege/RLS, MIGFIX-6/7, restore
  reconciliation, compiled-test execution and browser journeys remain CI proof;
  no database or localhost execution was attempted here. This landing requires
  green CI and independent RED review at its final committed head. Prior PASS
  3d644538 is precheck evidence, not review of this new landing head.
