# M4-8-S part 2 — neutral receipt producer and case consumer (RED)

Repair round 1 for PR #383, migration 0304 edited in place before merge.
The original implementation incorrectly required supplementary catches to use
exactly the original locked revision, used replica-mode F5/F7 fixtures, and left
the receipt producer held. Those were implementation defects, not release gates.

## Revision and source authority

`receipt_fact_invoice_line` is shared by producer, reader and consumer. An
original final-invoice line must be on the locked revision. A supplementary line
must belong to its actual issued invoice's descendant revision, with a same-job,
same-tenant, same-baseline, strictly decreasing ancestry chain reaching exactly
the original lock. Cycles cannot qualify. The supplementary line's immutable
commercial identity must not occur on the locked bill, including where a new
line UUID was minted for a preserved baseline. Its invoice binding and completed
check remain exact. The invoice writer's descendant contract is preserved.

`receipt_fact_source_approved` additionally requires the new producer's durable
command and exact approved authorization. Quarantined 0258 storage fixtures,
JSON brands or an arbitrary non-null approval reference are not released facts.
Source approval is historical proof of creation: revocation holds new positive
use and appears in the read snapshot, while a negative correction remains
possible after original proof invalidation or approval revocation. The existing
job-bound movement check (#346), cumulative line net/gross and
receipt caps, and permanent one-work-item-per-line binding (#356) remain.

## RED reviewer catch-line addendum

The supplementary binding requirement is enforced by the shared line guard:
`final_account_invoice_binding.invoice_kind = supplementary`, this exact lock,
this issued revision and a completed check belonging to that binding. A new
writer-driven regression proves the valid binding and refuses a different
completed check and the original final invoice.

Catch cases and actual `jobguard_catch` origin lines now use a dedicated source
rule. The line must be a supplementary variation whose commercial revision and
scope match `variation_revision`, whose server-written origin is
`jobguard_catch`, and whose variation ID **and exact revision ID** occur in the
case's own `variation:` and `revision:` source references. An invoice reference
alone cannot borrow a catch. The real-writer regression rejects an unrelated
invoice-referencing recovery case and a genuinely produced original-bill receipt
assigned to the catch case, then proves the correct catch case still succeeds.
The original locked-revision rule and original-bill exclusion remain unchanged.
No replica mode or disabled financial integrity guards are used.

## Neutral producer

The existing SQL `read_receipt_allocation_facts` and
`write_receipt_allocation_facts` signatures now implement the synthetic producer.
The new strict `receipt-line-facts-command.v1` protocol accepts IDs/revisions and
review hashes only. Review names a stored matched receipt. Reversal review names
the original allocation revision and a stored refund/credit ID; the amount comes
from that stored source. Application amounts, ratios, shares and artifacts are
refused. The old build-ahead command protocol remains explicitly refused, so an
old amount-bearing reversal cannot acquire authority accidentally.

SQL derives the complete composition from issued immutable line snapshots and
settled matched practice events; it checks actual invoice totals and, for new
positive distributions, the current final-check certificate. Negative
corrections retain the original issued/check binding without requiring
invalidated evidence to become valid again. Explicit persisted verified remittance has priority,
then an actual supplementary invoice, then pro-rata outstanding gross. Multiple
conflicting remittances fail closed. A payment reference is not remittance
proof. Line existence uses server scope/commercial creation times, never an
application/device timestamp. Earlier matched receipts must be processed first. An earlier unprocessed
refund distribution holds a later receipt. A prior invoice credit requires a
corrected, line-bound commercial composition before later positive receipts; a
negative credit allocation does not silently reopen receipt capacity. The
producer refuses rather than guessing the credit principal denominator.
Refunds use original paid shares net of linked reversals; credits cannot consume
more than their stored value across receipts. Reversal time is the stored refund
or credit time, so a later credit cannot change an earlier receipt denominator.
No deemed amount or net/tax ratio is rounded.

The repository runs SH-1's existing kernel over the returned stored input and
checks every SQL proposal before returning it or committing. SQL's independent
exact derivation is necessary because the database cannot accept application
money. This uses the existing 0258 tables, exact fraction helpers and append-only
guards, rather than introducing another settlement store or allocation policy.

Reviews, exact approved Decisions/authorizations, consumption, replay results and
audit are transactional. Source hashes include current stored money facts and
invalidations; approval re-derives them. Identical replays reauthenticate and
return their first result; changed payloads fail. SSI starts at BEGIN, before
practice/tenant setup, preserving 0258's isolation requirement. Transport/commit
ambiguity and serialization failures remain errors: retry the same command ID.
Runtime still has no direct source/allocation table grants. Private helper
routines have no runtime/public EXECUTE. Live/pilot environments remain refused.

## Writer-driven proofs and attacks

F5/F7 now run normal quote/send/accept/activation, variation, final-account,
lock/check, invoice, practice-feed, receipt and producer writers. Initial fake
source/evidence recipes retain every trigger and FK. No replica mode or disabled
financial integrity guard is used. F5 settles its £12,000 deposit before the
later variation exists, then saves £400 exact line net from £14,640 against
£29,280 outstanding. This original-bill builder capture is fee-free; the £40
kernel assertion is arithmetic only, not fee entitlement. F7 confirms/prices and
customer-approves a real post-lock catch, assembles a descendant, issues the £960
supplementary invoice and saves £800 exact, while the £40,320 original remains
unpaid. Its £80 kernel assertion likewise makes no fee posting.

Tests cover original-bill/descendant/different-lock references, cross-job/customer
access, reused cash and facts, line caps, competing work assignments, positive
and negative replay, altered payloads, stale hashes, unmatched/pending receipts,
refund/credit sources, preserved originals, private grants, approval/session
refusals, and rollback on producer/consumer audit failure. The legacy writer's
shared receipt lock and anti-reuse trigger remain. No legacy money projection,
HTTP route, fee entitlement, provider, release or real-data gate is enabled.

LP-0 records four new private helpers and the changed source-routine call/write
surface. SERIOUS-B5 unions their exact signatures with the existing expectations;
predecessor metadata/rows are still compared. 0304 is additive: no backfill or
historical rewrite. Rollback stops new calls but retains all history; forward
fixes require another migration after merge.

## Local verification

- Database package typecheck passed.
- Strict typecheck of the replacement writer-driven integration fixture passed.
- Focused producer/consumer boundary tests: 19 passed (one named file).
- API caller-boundary tests: 13 passed (one named file).
- LP-0 comparator tests: 26 passed (one named file).
- Money arithmetic and commercial boundary lint passed.
- Database tests were collected only; PostgreSQL, migration execution and browser
  suites are CI-only in this sandbox. No PostgreSQL/local listener was started.
- Exact lane path comparison, conflict-marker scan and diff whitespace check are
  recorded in the repair handoff. No git-writing commands or downloads.

Green GitHub CI and an independent RED review against the pushed head remain
necessary. Local test discovery is not database verification or review.

## PR #383 repair round 2 — migration parsing

Parenthesised the two CASE expressions in the receipt producer's approval IF
predicates. PL/pgSQL otherwise treats the inner CASE's THEN as the end of the IF
condition and reports 42601. Only expression grouping changed; approval,
reversal, tenant/job binding, line caps and locked-bill controls are unchanged.
All other CASE uses in IF conditions were already nested in parentheses or a
parenthesised subquery. All ten dollar-quoted blocks close with semicolons and
the script retains its final COMMIT.

Added a local regression through the actual migrate() runner with a recording
query connection: only 0304 is pending, and its complete file must be submitted
in one query, with bookkeeping inserted before the final COMMIT. A separate
regression protects both parenthesised approval predicates. This verifies
submission and the known syntax fix; it does not execute or parse PostgreSQL.

Validation: packages/db/node_modules/.bin/vitest run --root packages/db
--maxWorkers=2 src/stored-receipt-migration.test.ts src/migrate-discovery.test.ts
passed (2 files, 5 tests); node_modules/.bin/tsc -p
packages/db/tsconfig.json --noEmit passed; git diff --check passed. PostgreSQL
migration and database suites remain for GitHub CI. RED review remains required
against the repaired head. No git writes, packages downloaded or listeners started.
