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
Stem 1110_retention_timer_runtime_rules is claimed and renumbered at landing.

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
