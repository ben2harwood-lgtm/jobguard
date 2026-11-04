# LP-13 downstream effects, v1

Synthetic construction only. LP-12 is the landing dependency; this branch is built
on LP-6c (0570), including LP-6b's protected transaction bridge and must be restacked and checked against the intervening
LP pieces before merge. Source-inspected and locally tested assertions below are
not a PostgreSQL PASS or independent review.

| Item | Downstream impact and smallest treatment | Earlier boundary and regression evidence |
| --- | --- | --- |
| 0017 invoice-number burning | Reuse the private LP-5 claim: one stored number per same-actor, current-transaction, processing invoice command with a live approved authorization. Repeated calls return that number. No claim means refusal. LP-5's deferred completion prevents standalone reservations committing; rollback restores the sequence. Issued invoice rows are untouched. No arbitrary rate limit, renumbering or second reservation store. | LP-5 checked completion and LP-8a invoice issuance remain mandatory. `lp13-low-value-batch.integration.test.ts` attacks 20 standalone calls, 100 calls on one claim, wrong tenant, a stale compatibility tenant, multiple ambiguous claims, revoked approval, runtime claim writes and incomplete commit. Retest `UIWIRE-10.integration.test.ts`, `lp5-commands.integration.test.ts` and the landed LP-8a suite. |
| 0053 legacy unknown raiser | Existing trigger stores NULL membership/command with `legacy_unrecorded` and `legacy_synthetic_capture`. Preserve that explicit unknown; it is not a verified person, capture time or command. The legacy read contract remains separately labelled. No backfill invents a raiser. | LP-3/5/8 evidence and fee paths must continue requiring their own qualifying proofs. LP13 tests the actual legacy trigger. Retest `shared-money-origin.integration.test.ts` and `small-builder-origin.integration.test.ts`; core `extra-persistence.test.ts` covers the legacy read contract. |
| 0003 scope progress actor | No actor is persisted by this routine. Its accepted reasons are transition tokens, not verified attribution. Add bound tenant comparison before lookup; retain exactly the three existing transitions. It writes only stage, operational revision and update time, never scope price, job baseline, cap, invoice, authorization or charge. | LP-6a/b protected binding and LP-6c money binding/permissions and LP-8 financial commands retain authority. LP13 forges actor settings, checks commercial rows and rejects wrong tenant/reason, an unbound forged context and a stale revision; all three allowed transitions retain their behavior. Retest `job.integration.test.ts`, `proof-application-records.integration.test.ts` and `practice-scope.integration.test.ts`. |
| 0120 SSO audit connection | Latest body is 0520, not 0120: it loads the connection first, selecting its tenant, then validates the subject and seals lower-trust audit. Unknown connections refuse. A stale tenant setting cannot route another connection's event into it. Identity bootstrap retains its narrow exception; an SSO audit event grants no commercial authority. No replacement needed. | LP-4 sealing and LP-6 identity/tenant enforcement. LP13 uses the actual identity role with stale tenant and unknown connection; asserts exact event tenant. Retest `enterprise-identity.integration.test.ts`, `sso-required.integration.test.ts`, `lp6a-sso.integration.test.ts`. |
| 0095 replay branch | The inventory's description is stale: the 13-argument adoption body always raises `JOB_PARTIES_REQUIRED`; 0356 also withdrew runtime execution. Preserve both. The supported 18-argument adoption is checked under LP-3/5; replay belongs to the checked command lifecycle, which compares actor/type/payload/status before returning a stored result. No retired replay route is restored. | LP-3/5/6 command identity, LP-8 money. LP13 tests retired-signature refusal and another actor's current replay key with no invoice effect. Retest `lp5-parties-import.integration.test.ts` for positive/concurrent replay and `lp3-activation-acceptance.integration.test.ts`. |

Migration 0820 is forward-only: one nullable private claim column, narrowed number
allocation and the progress tenant guard. Existing claims require no backfill;
existing invoice numbers and historical origin/audit rows are unchanged.
`lp13-upgrade.integration.test.ts` applies 0820 to its predecessor, checks an
existing sequence stays at 42, preserves the three closed routine bodies, checks
the narrowed owner privileges and refuses an unbound GUC forgery. Number
reservation retains its signature. Callers must carry the LP-6 binding and LP-5
checked invoice command; LP-8a must convert any remaining legacy direct writer.
The existing command writer owns number allocation, with only SELECT/INSERT and
UPDATE(next_number) on the sequence and a bound-tenant policy. Runtime gets no new
write grants. Existing runtime sequence INSERT is an LP-8a closure, not proof that
the whole billing surface is secured here. No new alert or release enablement.

HELD-FOR-BEN: LP-0 effective-privilege/source-pin refresh needs the piece-specific
typed approval in BUILD_PLAN.md §11.8. This change adds a private claim column,
changes two routine sources, transfers the reservation owner and adds narrow command-writer sequence grants
and a sequence policy. Scanner definitions and pins are untouched. The router
must obtain approval, refresh their exact union against the restacked LP-12 base,
run the whole PostgreSQL/migration suite and obtain independent exact-head RED
review before merge. This branch alone cannot satisfy those gates. Forward-fix
failures in a later migration; do not restore standalone reservation authority.


4 November catch-up receipt (NOPR, RED)

The LP-6c merge is already complete at f27aad613; no Git writes or fetch were
performed. The old branch-only 0534 migration was renamed to reserved 0820 to
avoid the merged 0534 import-work migration and to run after LP-6c. The latest
available origin/main and branch definitions were inspected: progress remains
0003, legacy origin 0053, SSO audit 0520, reservation is newer in LP-6c 0570,
and retired adoption remains refused by 0095/0356. Reservation retains both
LP-6c tenant checks and reuses its protected-identity helper grants. No new
route, command, table, provider or production enablement was added. The private
claim table is not a whole-row fingerprinted evidence source; no fingerprinted
business table has a new column. Reusing its checked claim avoids a second
reservation store and another lifecycle to maintain.

Intervening LP-6d/e, LP-7, LP-8a/b, LP-10, LP-11 and LP-12 are absent here and
remain sibling responsibilities. LP-6d/e owns remaining binding/audit conversions;
LP-7 session lifecycle; LP-8a/b direct money/evidence write closure and invoice
integration; LP-10 worker separation; LP-11 policy visibility; LP-12 narrowed
chokepoint ownership. In particular, existing runtime sequence INSERT and legacy
invoice routines that increment the sequence themselves remain LP-8a work.
0820 alone does not close those paths or prove the full acceptance criterion.
Restack after those pieces and retest both supported issuance paths, approved
commit, concurrent allocation, replay and rollback; do not duplicate their work.

The 0820 proof records exact reservation-owner/ACL, sequence relation ACL and
policy changes, using identity arguments without defaults. Its LP-0 section is
intentionally empty: the builder is not authorized to refresh protected pins.
It is not a complete catalog PASS. CI must verify actual PostgreSQL ACL ordering,
column privileges, RLS and both fresh/upgrade installation, plus every regression
and downstream suite in the table above. Database/browser execution is unavailable
in this sandbox. No tests, scanners or guards were weakened.

Named landing hold / HELD-FOR-BEN: refresh the protected LP-0 source/privilege expectations
for exactly app.reserve_customer_invoice_number(uuid) and
app.transition_scope_progress(uuid,uuid,uuid,integer,character varying,character varying),
the reservation owner transfer, command-writer SELECT/INSERT and UPDATE(next_number)
sequence grants, and lp13_invoice_number policy. Add exact named 0820 body
exceptions to plan-entitlement-lifecycle-upgrade.integration.test.ts for those
two signatures (and the reservation owner/ACL transition), preserving every other
body comparison. That guard currently accepts the LP-6c body only. These changes
are reserved to Ben by this brief. Under the router ruling of 4 November, this
branch is READY to save with named holds; landing remains held until they are resolved. Independent exact-head security review and green CI,
with LP-6b/c landed first and LP-12 dependency satisfied, remain landing gates.

Local validation (installed tools, at most one Vitest worker):

- DB `./node_modules/.bin/vitest run --maxWorkers=1 test/lp13-low-value-batch.test.ts test/migration-proof-loader.test.ts test/lp6c-money-routines.test.ts`: 3 files / 86 tests passed. The first attempt passed 10 tests but could not collect the proof loader without the core build; building existing dependencies resolved it.
- DB `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: passed. Existing core/storage/config/db/ai builds were generated locally for package exports; no dependency download or tracked build output.
- API context-boundary and identity files: 152 tests passed. Watchdog's initial collection needed the existing AI build. Its rerun executed 126 tests: 95 passed, 31 failed. Observed failures include old replay doubles rejecting `SELECT app.bind_request($1, $2, $3)` and old access doubles yielding InvalidTenantContextError instead of PracticeAccessError. The test and tenant-context source are unchanged from LP-6c; LP-13 adds no API behavior. These predecessor binding/mock catch-ups stay with the router/LP-6b repair, without changing protected guards here.
- DB `vitest list --maxWorkers=1 test/lp13-low-value-batch.integration.test.ts test/lp13-upgrade.integration.test.ts`: collected all 10 integration tests, including the two new attacks, without executing hooks or PostgreSQL. Collection is not an integration PASS.
- `git diff --check`: passed; no unresolved Git entries. Final unstaged lane paths exactly match the LP-6c diff plus untracked additions (6 files and the lane itself). `LANE_BASE_REF=origin/codex/sandbox/lp-6c-money-routines node tools/agent-lane-boundary-lint.mjs` currently refuses the removed branch-only 0534 path: the local checker unions HEAD history with unstaged changes. After the router records the rename in a commit it must rerun the actual checker against LP-6c; do not add obsolete 0534 to the final lane or weaken the checker.
- The pnpm front end stalled before running either initial command and was interrupted; the successful commands above invoke the same installed TypeScript 5.8.3 / Vitest 4.1.12 binaries directly. No full suite, database, browser, CI or independent review was claimed.


4 November save handoff (21:26 UTC run)

No unfinished merge entries were present. Saved implementation, migration 0820,
proof and adversarial tests were retained; no scanner, protected pin or guard was
edited. Focused validation reran successfully using installed tools in packages/db:
`./node_modules/.bin/vitest run --maxWorkers=1 test/lp13-low-value-batch.test.ts test/migration-proof-loader.test.ts test/lp6c-money-routines.test.ts`
passed all 86 tests in three files; `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
passed. `vitest list --maxWorkers=1` collected all 10 tests from the two LP-13
integration files; no PostgreSQL hooks ran. `git diff --check` passed. Prior API
failures and the lane check remain named landing holds, not new passes. READY
means save the branch only; all dependency, protected-expectation, CI and
independent review gates above remain open. No additional design decision was
resolved in this save run.
