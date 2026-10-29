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

## PR #383 repair round 3 — shared fixture and catalogue regressions

Inspected CI run 40764722895 against 381a75a0da9e18f3f6e90a3e28b2d9388c16f049.
The final-account, activation, re-acceptance and stored-receipt failures share
PostgreSQL 42P08 in prepareActivationFixtureV3: the first use of $4 inferred
char(64), while its CASE use required text. Both uses now explicitly take text;
the stored digest column and immutable ownership rules are unchanged. Existing
real-writer DB tests continue to exercise null and session-bound fixtures.

Restored practice-session.ts byte-for-byte to the pinned bridge (SHA-256
9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14).
The receipt producer now uses a small local connection adapter for serializable
BEGIN before digest/tenant setup; it changes no session-wide defaults or other
callers. Its boundary test additionally checks digest/tenant ordering and client
release after rollback. No pinned expectation was updated.

The entitlement-upgrade snapshot and both tenancy catalogues omitted 0304's
three installed tables: stored_receipt_case_allocation, stored_receipt_case_binding
and stored_receipt_case_command. Added exactly those rows, retaining all existing
rows and full equality checks. LP-0 and SERIOUS-B5's existing 0304 registrations
remain; no migration, grant, routine identity or privilege changed this round.

The A3 race test used the ordinary postgres database and still expected the old
held-source reader refusal. It now uses the existing isolated synthetic fixture
and tests both stale hash and stale revision through the caller-owned transaction:
40001 must precede dependent work, and no allocation revision may be saved.
Concurrent superseded approvals are still refused. Reads are not approval or a
claim of source-lock atomicity.

CSG's existing quote-delivery execute exception fingerprint became stale when
the fixture declaration changed. Refreshed only that fingerprint; the same 13
exceptions, file, line and reason remain. Restoring the practice bridge also
restored its original fingerprint. The guard reports zero diagnostics, and all
169 guard tests passed; no new exception or scope was added.

Local verification: database package typecheck passed; the three named unit
files (stored-receipt-case-allocation-repository, stored-receipt-migration,
demo-seed) passed all 24 tests with at most two Vitest workers. After strengthening
SSI assertions, the 19-test boundary file passed again. A3/entitlement/tenancy
DB tests were discovered through Vitest only; PostgreSQL and browser suites
remain for GitHub CI. Money arithmetic/commercial boundary lint and diff
whitespace checks passed. Final net branch payload exactly matches the lane's
20 allowed paths, excluding its implicit metadata file and the restored bridge.
The stock local lane command includes uncommitted reverts in its union and thus
still reports the restored bridge until the router commits; the bridge has zero
net diff against merged origin/main, so it is intentionally absent from allow.
No git writes, real data, provider calls, downloads or local listeners.


## PR #383 CI repair try 3 — synthetic certificate format

CI job 123132038367 reported 15 failures in the stored-receipt integration
suite. Every failure stops in realReceiptFixture at the same source insert:
synthetic_evidence_original_content_type_check rejects application/pdf. The
0025 synthetic-original contract permits PNG, JPEG and WebP. The fixture now
reuses pngBytes(23) from site-extra-evidence-fixtures and declares image/png
consistently in evidence_upload, synthetic_evidence_original and evidence_object.
SHA-256 and byte length remain derived from the actual bytes. The certificate
evidence type, completion link, all constraints/triggers and all allocation,
replay, reversal, tenant/job, approval and catch assertions remain unchanged.
No test is weakened, skipped or excepted. No migration SQL changes.

Resolved the main-merge conflict in SERIOUS-B5 by retaining both
storedReceiptCaseAdditions and sourceIntakeAdditions; all main lines remain.
The exact branch payload still matches the existing lane allow list.

Local checks: three named Vitest files (stored-receipt-migration,
stored-receipt-case-allocation-repository and lp-0-catalog) passed 47 tests
with maxWorkers=2. Database package typecheck and separate strict fixture
typecheck passed. Vitest list collected all 15 affected database tests plus
SERIOUS-B5; this was discovery only, not PostgreSQL execution. All migration
SQL bytes match their committed source (0303 from incoming main, all others
from HEAD); 0304 SHA-256 remains
ea32c619401eac70ac07ec2e16fc3729d4623a48ccf9c9bf3a4e59047409a73e.
Conflict-marker scan, exact lane coverage and diff whitespace checks passed.
PostgreSQL/migration execution remains in CI. Router stages the resolution,
commits and pushes; no git-writing commands or local listeners were used here.


## PR #383 CI repair round 4 — real facts writer and completion publication

Ben authorized one additional round on 29 October. CI job 123142144375
reported two setup errors shared by the 15 stored-receipt integration cases.
F5 and the pending/unmatched-attestation case sent receipt-12000 and
receipt-14640 through practice-feed-command.v1. Those keys belong to the
existing additive practice-facts-command.v1 catalogue. The fixture now uses
PracticeFeedRepository.factsCommand for both advancement and receipt matching
of those two keys, preserving feed.command for receipt-960 and the shared
persisted command revision. Deposit settlement still precedes creation of the
later line, and all original monetary assertions remain exact.

F7, #346, #368, #356, concurrency, refund/credit, forged money, replay/stale
watermark, approval/session, audit rollback and both RED catch cases reached
invoice issue with a reconciled run but no published completion certificate.
The fixture now calls FinalCheckCompletionRepository.publish after reconcile
and before either invoice is issued. The real publication trigger verifies
source processing, result, run and lock binding. No certificate or financial
row is inserted directly, no trigger is disabled, and no assertion is removed
or relaxed. The existing five targeted attack tests remain unchanged.

Merged main's exports and LP-0/SERIOUS-B5/entitlement expectation rows with the
branch's own rows. LP-0's checked-billing sources/tests are unioned and main's
expanded ENT-7 description is retained. Incoming reviewed routine metadata
remains intact alongside the branch's changed receipt-reader/writer metadata.

Renumbered 0304_stored_receipt_case_allocation to
0335_stored_receipt_case_allocation, including its note, lane, LP-0 source
reference, current contract and tests. Historical receipt entries above retain
the original number. Used tools/migration-renumber.mjs's exported planner
with the requested 0335 floor, then applied filesystem moves/reference updates.
The CLI --write mode stages Git changes and requires a clean index, so it was
not used in this read-only-index merge sandbox. Router stages the final rename.
The upgrade assertion now checks predecessors against 335, preserving its
original strict ordering invariant. SQL bytes are identical: SHA-256
 ea32c619401eac70ac07ec2e16fc3729d4623a48ccf9c9bf3a4e59047409a73e.
No SQL bug was found or edited; approval CASE expressions stay parenthesised.

Local validation: 48 tests passed in three named DB unit/comparator files;
22 existing practice-facts domain tests passed in one named core file. All
Vitest runs used at most two workers. Database package and separate strict
fixture typechecks passed. Vitest discovered the 15 receipt cases, upgrade and
SERIOUS-B5 (17 cases); none was executed against PostgreSQL locally. Exact
LP-0 identity union (1,394 entries, 479 routines), preservation of main's
shared-list lines, conflict scan, exact lane payload and diff whitespace checks
passed. PostgreSQL and migration execution remain required in GitHub CI.

## M4-8-S F5/F7 completion slice — 29 October 2026 (RED)

Inspected origin/main fe80add5 before editing. The saved F5/F7 writer-chain
proofs and F7 refund/credit cases already exist here; this slice extends them
rather than rebuilding the allocator. Positive saved facts now also assert exact
gross (£480/£960). Both fixtures exercise stored refunds and credits, persist
−£400/−£800 net with the original allocation link, preserve the original row,
and replay both producer and consumer approvals without consuming money twice.
The F5 credit reverses the £14,640 receipt in full (£12,200 net credit); it uses
the original paid shares, not a new denominator or an item-specific remittance.
Cumulative arithmetic returns Q to zero with a −£40/−£80 reference fee delta.
F5's builder capture remains fee-free: no entitlement or fee posting is created.
Existing duplicate/conflicting replay, concurrency, amount/cap, locked-bill,
cross-tenant/job and private-table access attacks remain in the same suite.

Forward migration 0401 replaces 0258's tenant-only movement FK with
(tenant_id, job_id, movement_id), referencing the unique job identity already
provided by 0119. It validates existing rows immediately and changes no data,
columns, grants, policies or routines. A historical mismatch fails atomically;
do not repair it by silently changing a job. Rollback strategy is to stop new
allocation work and retain history, then issue a reviewed forward fix. No
production capability or provider is enabled. The #346 structural gap is fixed
in source; closure still needs PostgreSQL CI and the independent RED review.

The upgrade test installs actual predecessors, produces F5/F7 with the normal
writers, migrates and reruns, and compares stored money/source/lock rows and
types. It checks the validated FK and rejects an existing same-tenant movement
from another job. A rolled-back admin-only control temporarily disables the
source immutability trigger and removes this FK, proving that this exact FK
rejects the attack; no other financial trigger/FK/check is disabled. Normal
writer fixtures keep every guard enabled. Fresh-install coverage remains the
normal stored-receipt suite, which installs all migrations.

Local validation (installed binaries, no dependencies downloaded):
- packages/db/node_modules/.bin/vitest run --maxWorkers=2
  src/stored-receipt-migration.test.ts
  src/stored-receipt-case-allocation-repository.test.ts
  src/migrate-discovery.test.ts: 24 tests passed, three files.
- packages/db/node_modules/.bin/tsc --noEmit -p packages/db/tsconfig.json:
  passed (run from packages/db with its local tsconfig path).
- Strict ES2023/NodeNext typecheck with noUncheckedIndexedAccess and
  exactOptionalPropertyTypes of both affected integration files: passed.
- Vitest list --maxWorkers=2 of those two integration files collected 18 tests;
  discovery only, no PostgreSQL execution.
- Existing core/storage packages compiled with the installed TypeScript compiler
  to supply their local package outputs. The initial focused Vitest attempt had
  failed on missing @jobguard/core output; the rerun above passed. The system
  pnpm wrapper stalled, so checks used the installed repository binaries.

PostgreSQL/migration/browser execution, required CI against current main, one
independent RED review and router commit/push remain outstanding. This sandbox
cannot start PostgreSQL or bind localhost. No git-writing command was run.
