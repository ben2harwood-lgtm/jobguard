# READY — batch-46 landing reconciliation (RED)

Plan pieces: LATER-SAFETY-6 through LATER-SAFETY-11, synthetic safety follow-ups
for M4-19/M4-20/M4-21, pay-now, practice bank and dark order attestation.
Reconciled against incoming main 62081c68933d0b953e7dd75a8cbd7b3a2fb4f304.
Router must stage the resolved file and finish the existing merge; this sandbox
has not written the git index, committed, pushed or opened a PR.

## Migration inventory against main

- 1110_retention_timer_runtime_rules -> 1200: retained; main has no equivalent.
  Replacement retention_records starts from main's latest 0600 body. Its diff
  adds session validation, the live-job check, human/server-date review rules and
  server date output. New timer helpers preserve the 0601 timer's limits while
  moving book access from infrastructure to runtime. No unrelated body is lost.
- 1111_notice_live_job_check -> 1201: retained; latest body is main's 0597.
  Complete routine diff adds only the fresh-command live/invoiced/paid guard,
  after stored replay, preserving historical reads and exact replay.
- 1112_pay_now_catch_statement -> 1202: retained; latest body is main's 0598.
  Complete routine diff adds session checks before and after lock waits and the
  tenant/job/revision-qualified includesCatch lookup. Stored replay, fingerprint,
  fees, balance limits and other result checks are unchanged.
- 1113_order_attestation_session -> 1203: retained; its actor wrapper is new on
  this main. Main's 0606 dark order dispatcher is unchanged, including
  purchase_order.send.dark in lp5_command_result.
- 1114_vat_fixture_records: removed with its proof and note. SQL is byte-identical
  to main's 0607_vat_fixture_records; restored main's exact 0607 SQL, proof and
  note instead of replaying the migration under another number. The underlying
  VAT fixture implementation is already on main; LATER-SAFETY-11's application,
  repository, route-test and browser-fixture safety changes remain in this group.

Only filename stems and their exact consumer/proof references were renumbered;
retained SQL bodies are unchanged. All retained proof sections and assertions
remain. No predecessor migration is changed. later-empty-tables conflict sides
had identical key sets; main's exact bytes preserve both sides. The batch-46 lane
lists all 66 working-tree paths differing from incoming main outside config/lanes,
including these notes, and excludes itself. Incoming fee-store safety code and
migration 0608 remain byte-identical to main. No piece is wholly superseded:
only the inherited VAT foundation was redundant.

## Local verification for this reconciliation

Installed repository binaries only; no package download. Vitest ran sequentially,
at most three named files per invocation and --maxWorkers=2 throughout:

- packages/db: test/migration-proof-loader.test.ts,
  test/purchase-order-action.test.ts, test/retention-record-repository.test.ts:
  129 passed.
- apps/api: src/retention-record.application.test.ts,
  src/retention-review-task.test.ts, src/notice-fixture.application.test.ts:
  34 passed.
- apps/api: src/pay-now-attempt.application.test.ts,
  src/practice-bank.application.test.ts, src/vat-fixture.application.test.ts:
  48 passed.
- packages/db: test/notice-fixture-repository.test.ts,
  test/pay-now-attempt-repository.test.ts, test/vat-fixture-repository.test.ts:
  69 passed.
- apps/web: app/api/jobs/[id]/invoices/[invoiceId]/pay-now-preview/route.test.ts,
  app/api/jobs/[id]/retention-records/route.test.ts,
  app/api/jobs/[id]/vat-fixtures/route.test.ts: 28 passed.
- apps/web: app/jobs/[id]/invoices/[invoiceId]/pay-now-preview/screen.test.tsx,
  app/jobs/[id]/notice-fixtures/screen.test.tsx,
  app/practice-bank/screen.test.tsx: 21 passed.

Total: 18 Vitest files, 329 tests passed. These are unit/source/route/screen checks,
not real PostgreSQL or browser journey evidence. Each command used that package's
./node_modules/.bin/vitest run with the named files above.
Root ./node_modules/.bin/tsc -p <package>/tsconfig.json --noEmit passed for
packages/db and apps/api; apps/web passed with --incremental false as well.
node --test tools/plpgsql-case-in-if-lint.test.mjs: 15 passed, including the real
migration inventory. git diff --check passed. Content comparisons verified all
273 main migrations byte-for-byte, the retained four SQL bodies unchanged from
branch HEAD, and the main-relative lane's exact 66-path equality. Scoped conflict
marker scan and migration/proof filename bindings passed. Git still records the
unmerged index until the router stages the resolution; no git write was attempted.

## Named holds for landing

- CI-DATABASE-BROWSER: CI must prove fresh install, populated upgrade and replay,
  exact LP-0/ACL/RLS/owner/search-path proofs, retention timer authority/date and
  refusal continuation, notice draft refusal with historical replay, pay-now
  catch/replay/session boundaries, attestation sessions/cancellation and existing
  fee-reservation guards. Run mandatory database/migration and affected browser
  suites on phone and desktop with at most two workers. No PostgreSQL or browser
  was available locally, and no local check substitutes for these outcomes.
- EXACT-HEAD-RED: independent RED review and all required green CI against current
  main must bind the final router-created head. Router stages the resolution,
  completes the merge, assigns landing numbers and verifies the committed lane.
- ACTIVATION: existing raw attestation INSERT/LP-5 lifecycle and provider-result
  authority holds remain; synthetic routes do not authorize production use.
  Legal/tax approvals, provider routes, real customer data, release and G0–G5
  gates remain unchanged. No live services, money or launch was used.

This READY status means ready for router commit and CI/review, not accepted,
merged, independently reviewed or production-ready. Earlier build notes follow;
this reconciliation supersedes their old base, number and lane status claims.

# LATER-SAFETY-6 — retention authority boundaries

RED: least privilege, session authority and tenant isolation. Built against main
4adc76486ec6e599a4722aa342dac828feaa7a3a. This finishes no plan piece.

All five original findings were rechecked and remain applicable: worker.ts uses
GRAPHILE_DATABASE_URL for retentionPool; 0601 grants the book-returning timer to
infrastructure; session commands accept timer trigger/client dates; one refused
book aborts the tenant pass; reads omit a digest and the application selects the
first membership. No finding was skipped.

The forward migration revokes the old infrastructure timer and creates a runtime
entry point in app, preserving its exact timer-review limits, synthetic database
refusal, job lock, hash checks and audit. Infrastructure discovery still returns
only tenant IDs. Its two worker task names remain unchanged. No table, column,
policy, runtime table grant or commercial action is added. The private book helper
is migration-owner-only and is not a session bypass available to either login.

Session reads and writes recheck current owner/admin membership through the digest.
An absent/malformed/expired/revoked digest raises RETENTION_UNAUTHENTICATED; wrong
role maps METER_FORBIDDEN to RETENTION_FORBIDDEN. The application refuses ambiguous
multi-company sessions. Both paths enforce require_watchdog_live, matching the
existing post_live_billing route registry and the interim-rules branch, rather
than inventing a new registry command. Missing and foreign jobs stay not found.

Session review input accepts human only. Database CURRENT_DATE stamps new dates;
replays retain the stored date and compare the remaining content/actor normally.
Historical rows are never rewritten. A refusal rolls back that book and continues
the tenant pass, returning appended/refused counts; outages still throw for queue
retry. Worker refusal logs contain only job ID and typed refusal code. HTTP 403 and
401 are final refusals; the screen shows the permission/sign-in message and keeps
uncertain retry only for transient outcomes.

## Migration proof and recovery

The proof is explicit, copied from reviewed source expectations rather than a live
catalogue. LP-0 records the revoked legacy reachability, new runtime grant, private
helper and changed static calls. Upgrade contains exactly the two new app routine
catalogue rows: unlike 0601's infrastructure-only routines these are compared by
the existing upgrade snapshots, so an empty upgrade section would be incorrect.
There are no registry-row, policy or tenancy deltas and no new empty table.

Forward fix only: retain immutable rows and audit; repair grants/routines in a new
migration. Do not roll back to the infrastructure book reader or digest-free read.
Stem 1200_retention_timer_runtime_rules is claimed and renumbered at landing.

## Verification and named holds for landing

Local deterministic checks and results are recorded in the commit-message handoff.
PostgreSQL, full CI and an independent RED review against the eventual exact head
remain required. No PostgreSQL or browser was started in this sandbox.

The existing apps/web/e2e/M4-20-retention-records.spec.ts fixture now uses
runtime for the timer, authenticated reads with the session digest, and the same
owner-only fictional live-job lifecycle setup as the notice fixture. Its owner UI
journey/assertions remain unchanged. Browser execution remains a CI requirement.

Changed existing expectations are confined to retention tests: timer runtime login
and structured counts, authenticated reads/refused revoked or lower-role reads,
invalid-book refusal continuation, and database-stamped human review dates. Human
reviews may still be requested early, without satisfying or releasing a condition;
the timer remains due-date limited. No security assertion was removed.
All production/provider, invoice/payment/fee/journal/outbox and G0–G5 gates stay
closed. packages/db/test/later-empty-tables.ts and legacy proofs remain untouched.

The lane CLI was invoked before commit and refused a self-comparison because
HEAD equals origin/main. Its working-tree path/policy validation is checked
separately; the router must rerun the CLI after creating the commit.

LATER / SIMPLICITY (initial source review only): the book-loading block in
app.retention_records and app.retention_timer_book could later share one private
owner-only loader. That would reduce drift in lock/hash checks; it is not needed
for this scoped security repair and does not block it.
