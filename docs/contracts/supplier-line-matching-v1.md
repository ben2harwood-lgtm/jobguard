# M2-4 synthetic line-level matching

`matchSupplierLines` in `@jobguard/core` is a pure proposal function accepting the
strict `supplier-line-match-input.v1` envelope. Only `synthetic_demo` is accepted.
There is no HTTP route, provider call, migration, persistence, debt, payment or
fee write. This built-ahead piece extends the M2-3 synthetic extraction work;
it does not activate the retained single-line matching workspace.

A trusted caller must supply human-confirmed current line versions from one
tenant, job and merchant. The scope IDs partition deterministic identities; the
function cannot authenticate membership or verify original bytes. Each line
retains a stable line ID, immutable version ID, original document version/hash
and page. One current version per line is permitted. Metadata for an immutable
document must agree across its lines. Extraction proposals require confirmation
before entering this contract; descriptions, confidence scores and SKU-like text
are never converted to confirmed identity here.

Matching uses exact case/whitespace-normalized order references and SKUs, or
explicit merchant-scoped one-hop SKU aliases. Punctuation is significant. Several
aliases may name one SKU; one alias naming different SKUs is unresolved. Multiple
candidate order lines remain unresolved even when their prices are identical.
An explicit human-approved mapping binds a source version to an order version
and retains its approval reference. Conflicting mappings remain unresolved.
Substitutions require such a mapping or an explicit alias. Nothing infers them.

Quantities are nonnegative decimal strings with at most fourteen whole and six
fractional digits; orders, bills and pack sizes must be positive. Receipt quantity
is accepted quantity only: rejected/missing items are excluded. Each line must
state its base unit and units per commercial pack, or null for an unknown pack.
Only equal base units and known conversions are comparable. Quantity × pack size
is exact bigint arithmetic; output quantity strings use a scale of 10^12 base
units. Grouped receipt/bill version IDs express partial and one-to-many matches.
No receipt is assigned to more than one order. Distinct split invoices are additive.
This is order-level aggregation of matched lines, not a guessed allocation of
individual receipt quantities to individual split invoices.

Different document versions with identical source hashes, or invoice/credit
versions with the same normalized document reference and kind, are held as
candidate duplicates. All candidates remain unresolved; none is selected as
canonical or added to quantities. Multiple lines of one document remain distinct.
Any unresolved source makes delivered/billed group totals unknown (null),
conservatively across the supplied snapshot, so a partial sum cannot appear to be
a complete match. Missing invoice/receipt sources are explicit issues. Complete
snapshots report short/over delivery and billing above accepted receipt quantity.

All monetary input magnitudes are GBP pence bounded by `MAX_MONEY_PENCE`. Order
unit prices are explicitly net, per order pack. An agreed discount is integer
basis points. Expected invoice-line net is the exact normalized invoice quantity
multiplied by order pack rate and discount, rounded once half-even per bill line.
The comparison requires explicit net invoice basis; gross/unknown amounts stay
incomparable. No VAT rate or tax rounding policy is inferred. Validity is inclusive
and uses the explicit supply date, not the credit-note issue date or current clock.
An out-of-date rate yields an issue, never a fallback rate. The order remains an
estimate/reference; a match does not establish an invoice obligation.

Credits carry positive magnitudes, subtract quantity only with an explicit link
to an invoice line in the same matched group, and cannot cumulatively exceed its
quantity or net. Unlinked/excessive credits make billed totals unknown and cannot
hide an overbilling behind a negative total. Credit-only monetary adjustments
with no returned quantity need a separately specified contract; zero-quantity or
unallocated document discounts/credits are not silently spread across lines.

IDs are SHA-256 identities bound to tenant/job/merchant, source versions and issue
kind. Input arrays are sorted on parsed copies; the same facts in any array order
produce identical groups, discrepancy identities and snapshot digest. No caller
input is mutated. Invalid envelopes raise `SupplierLineMatchError` with
`INVALID_MATCH_INPUT`; monetary overflow uses the existing typed `MoneyError`.

Mappings are facts supplied to this function, not authorization created by it.
The original pure matcher remains unchanged. The dark synthetic correction seam
is specified below. Inline fixtures are development regression tests, not frozen
human ground truth, a held-out benchmark or G2 release evidence.

## M2-4 stored reviewer corrections (`0624_supplier_line_corrections.sql`)

`SupplierLineCorrectionRepository` stores an immutable, server-owned confirmed
synthetic snapshot using `supplier-line-snapshot.v1`. The caller supplies a verified
tenant context and the authenticated server principal's identity user/membership
IDs. Every create, read, correction and replay checks current active owner
membership, including identity, expiry and revocation. No HTTP route is registered. Snapshot creation and correction remain outside the
LP-5 command lifecycle: they use this seam's local command/replay and audit
protocol, and lifecycle dispatch is held until a separately approved integration.
The seam requires `JOBGUARD_ENV=synthetic_demo`; it cannot accept real uploads or
activate live matching. Fixture confirmation/source authenticity is the trusted
caller's responsibility, as in the pure input contract above.

A strict `supplier-line-correction.v1` command contains command/snapshot IDs,
expected revision, one source version and an order version (or null to withdraw
the mapping). It cannot carry edited source lines, prices, quantities or a claimed
approval. A correction replaces only that source's mappings; other mappings and
all original document/line identities, quantities, amounts, hashes and citations
survive. Withdrawals restore deterministic automatic matching; ambiguity stays
unresolved. Duplicates and incompatible units remain subject to the original
matcher checks even after a reviewer chooses an order.

Snapshots start at revision zero. Under one transaction, the repository locks
command identity then snapshot identity, checks expected revision, appends an
immutable correction, and appends identifier/hash-only audit data. All domain
locks precede the audit-head lock. Concurrent distinct commands with the same
revision yield one success and one `MATCH_REVISION_CONFLICT`. A command replay
returns its original revision/result, even after later corrections; changing its
payload, actor or job raises `MATCH_IDEMPOTENCY_CONFLICT`. Command IDs are unique
across snapshot/correction commands within this seam. A read can request a prior
revision; replaying stored corrections through the v1 matcher reproduces the
same match and discrepancy IDs. New confirmed source versions require a new
snapshot, never edits to a stored one. No finding, debt, invoice, payment or fee
is created by these proposal corrections.

Migration `0624_supplier_line_corrections.sql` adds only `supplier_line_match_snapshot`,
`supplier_line_match_correction` and their trigger guard. Tenant-qualified job,
snapshot, actor and deferred audit foreign keys, FORCE RLS, append-only grants,
immutable triggers, revision uniqueness and audit actor/type/subject/command/hash
binding protect the records. The insert guard rejects absent source/order
versions and nonsequential corrections. RLS still assumes a correctly verified
tenant context and a trusted application principal; it cannot protect against a
compromised privileged connection. Source snapshots remain synthetic proposals,
not evidence of agreed debt or verified original bytes.

Upgrade is additive and backfills no source or financial data. Roll forward with
a new migration to repair defects; keep the existing tables/history and disable
the dark caller if necessary. Never edit `0624_supplier_line_corrections.sql` after merge. PostgreSQL integration,
full migration/catalogue CI and one independent RED review remain required before
merge. There is no browser change or new provider route in this piece.

## M2-5 confirmed line discrepancy proposals and development evaluation

`evaluateLineDiscrepancies` accepts the strict `line-discrepancy-input.v1` envelope:
confirmed synthetic facts, snapshot ID and correction revision. The existing
correction repository includes its result as `discrepancies` on create, correction,
read and replay. It reconstructs historical facts first, so historical command
replays retain the original result. Current reads use the current correction
revision. No findings are persisted and M2-5 itself needs no migration. The stacked prerequisites use
`0606_dark_merchant_order.sql` and `0624_supplier_line_corrections.sql`.
The stacked M2-1 dark order uses the checked `app.begin_command`,
`app.complete_command` and `app.append_audit` protocol from `c70d7d20`.
Migration 0606 registers only `purchase_order.send.dark` with owner permission
and the `fake_merchant_order` outbox. Checked completion binds the whole approved
artifact (including `revisionAuthorityHash`) to the immutable order revision.
Manual attestation takes the actor from its trusted authenticated caller,
separately from the strict request DTO, and rechecks current owner membership.
The retained single-line workspace is unchanged; this remains a dark synthetic seam.

A proposed Decision groups the explicitly matched invoice/credit lines and accepted
receipts for one agreed order rate. Unresolved sources, duplicates, missing receipts,
unknown conversions, invalid credits, non-net amounts and out-of-date rates suppress
actionable results. Short or partial deliveries alone are not an invoice obligation.
All citations retain line/version, immutable document version/hash and page. Rate
basis retains the order citation, rate version, discount, pack and validity interval.
Quantities are exact integers scaled by 10^12 base units, as in M2-4.

For each invoice/credit line, expected net = base quantity × agreed pack rate ×
(10000 − discount basis points) / (order pack base quantity × 10000), rounded once
half-even at the source-line boundary. Credits subtract both net and expected money.
Quantity exposure = max(0, net billed base quantity − accepted base quantity) × the
same discounted rate, rounded half-even. Proposed exposure = max(0, net billed money
− expected net billed money + quantity exposure). Lower prices offset quantity
exposure; quantities are not counted twice. Arithmetic terms and signed totals are
shown in the result. Application money limits apply before bigint narrowing.

Decision identity binds rule version, scoped fact digest, snapshot, correction
revision and group. Reordering source arrays preserves results. A new correction
revision produces a new identity, including after withdrawal; old proposals must
not be treated as current commercial authority. Repository reads retain the existing
membership checks, tenant/job scoping and synthetic environment restriction.

Exposure is unclassified until payment facts are known: avoiding payment of an
unpaid overcharge is prevention; a paid overcharge is potential recovery requiring
separate evidence and authorization. Neither is established as billable by detection.
Decisions are proposals only: no claim send, cash landing, fee, invoice, or ledger
entry. Payment status is unknown in this input; no paid/unpaid inference is made.

`evaluateDiscrepancyPredictions` accepts strict `discrepancy-evaluation.v1`, dataset
`development`, and one stage: `confirmed_source_facts` or `end_to_end`. Supply one
independently labelled opportunity per case, including cases producing no prediction;
never drop extraction/matching failures from the end-to-end denominator. These
stages produce separate reports. This piece does not implement an extraction evaluator.
The development labelled discrepancy cohort is at least 2500 pence net (inclusive).
Other labels are genuine match or ambiguous, both non-actionable. Any positive
prediction counts as actionable, so even a one-penny ambiguous prediction is FP.

Reports include class counts, TP/FP/TN/FN, every error example, FP/(TP+FP), precision,
and recall on that labelled cohort. Undefined ratios are null; empty predictions or
no positive labels fail the diagnostic targets. Targets use exact integer counts
(5% false discoveries, 90% recall), never rounded displayed ratios. These diagnostics
measure detection, not amount-estimation accuracy. They are not release acceptance.
The five fictional cases in `discrepancy-development-fixtures.ts` are DEVELOPMENT
DATA ONLY, not the frozen 100-set held-out benchmark, an accuracy claim or G2 evidence.
Reports explicitly state the uncertainty and `releaseEvidence: false`. People must
freeze the held-out corpus/labels and record the product decision separately. G0–G5
remain closed. No providers, paid calls or real customer data are introduced.


## Batch-38 landing reconciliation — 5 November 2026

READY for the router to stage the resolved merge and submit for CI and RED review.
Compared with merged `origin/main` / `MERGE_HEAD`
`62081c68933d0b953e7dd75a8cbd7b3a2fb4f304` (the local `main` ref is older).
M2-1 dark merchant order behaviour is wholly on main; M2-2–M2-5's dark
synthetic line-facts seams remain in this batch. Live-task acceptance is not claimed.

Migration inventory against that main:
- Removed branch-only `1010_dark_merchant_order.sql` and its proof. Its executable
  SQL equals main's `0606_dark_merchant_order.sql` after excluding comments and
  blank lines (normalized SHA-256
  `5df3fcadefbd396123c570fc7b64fefe3763857db6797082012051a332dbd88a`).
  There was no branch-only note. Main's 0606 SQL and proof are retained byte for byte.
  This also removes the duplicate re-creation of `app.lp5_command_result`, preserving
  main's latest dark-order branch and every other adapter without a later overwrite.
- Retained `1011_supplier_line_corrections` as provisional stem
  `0624_supplier_line_corrections`, with its proof and all callers updated.
  SQL body is byte-identical (SHA-256
  `4d8b129f60489377865da77073fdd15303c17c2c4080cdda4bac674a682002a3`).
  It creates two tables and a new audit trigger function; it re-creates no existing
  routine. No branch migration note existed. Forward-fix/rollback constraints above
  continue to apply. Final contiguous numbering belongs to the landing router.

Resolved exports with both new repositories, retained main's outbox import order,
command catalogue and M2-1 proof tests, and extended main's empty-table list with
both supplier-line tables. Removed the duplicate always-true fixture handler so
commercial-outbound pause coverage actually reaches `claimsEnabled`; no test was
weakened. Main's source guards and order implementations remain unchanged.

Local checks use installed `node_modules/.bin` tools, Node 24.17.0, at most two
Vitest workers and at most three named files per invocation. The pnpm wrapper
stalled before starting Vitest and was cancelled; no packages were downloaded.
Executed from the respective package directories:
- core: `vitest run --maxWorkers=2 src/line-discrepancy.test.ts src/discrepancy-evaluation.test.ts src/supplier-line-matching.test.ts` — 49 passed.
- core: `vitest run --maxWorkers=1 src/supplier-match-corrections.test.ts` — 5 passed.
- ai: `vitest run --maxWorkers=1 src/merchant-extraction.test.ts` — 33 passed.
- db: `vitest run --maxWorkers=2 test/m2-1-migration-proof.test.ts test/supplier-line-migration-proofs.test.ts test/late-source-import-migration.test.ts` — 8 passed (source/proof checks).
- db: `vitest run --maxWorkers=2 test/merchant-intake-port.test.ts test/purchase-order-action.test.ts` — 61 passed (protocol doubles, not PostgreSQL).

- core, ai and db: `node_modules/.bin/tsc -p tsconfig.json --noEmit` — all passed.
- Repository checks: `node tools/core-purity-lint.mjs`,
  `node tools/money-arithmetic-lint.mjs`, `node tools/ai-provider-boundary-lint.mjs`,
  `node tools/plpgsql-case-in-if-lint.mjs` — passed. Core purity reports 11
  pre-existing computed test imports as unverifiable, not refused.
- Read-only lane inventory: exactly 28 changed paths against merged origin/main,
  including the new 0624 migration and proof, excluding all `config/lanes/` paths.
  Existing lane policy parser and path authorization passed. Final commit-bound
  lane lint remains for CI because the index still contains the pending merge.

### Named holds for landing

- Router must stage all five resolved paths to clear the read-only Git index's
  unmerged entries, commit and push; this session performs no Git writes.
- Final migration numbering and exact changed-path lane check after staging.
- Green CI against current main: real PostgreSQL fresh install and upgrade,
  catalogue/privilege/RLS/proof checks, replay/conflict/concurrent correction,
  audit and purchase-order session-isolation suites; required full checks and
  browser journeys. No PostgreSQL or browser suite ran in this sandbox.
- Independent RED review at the exact final head. This builder check is not that review.
- Live routes/providers, frozen held-out benchmark and G2 remain closed as above;
  this synthetic work supplies no release or production authorization.


## Batch-38 final landing reconciliation — 6 November 2026

RED; plan pieces M2-2 through M2-5, dark synthetic line-facts seams only.
This entry supersedes the earlier landing inventory and numbering holds above.
Comparison base is incoming main `f5415ddb4c3a40796dd812e8b5946ba5094daa2b`
(`MERGE_HEAD` / `origin/main`); the local `main` ref is stale.

Migration inventory against incoming main:
- Only added migration: `0624_supplier_line_corrections.sql` and its proof.
  Main ends at 0621; 0622–0623 are reserved for #582 by the router.
- No repeated migration stem exists on main. Main's 0606 dark merchant order
  SQL/proof remain unchanged; the earlier duplicate is already absent.
- The 0624 SQL is byte-identical to the prechecked branch SQL, SHA-256
  `4d8b129f60489377865da77073fdd15303c17c2c4080cdda4bac674a682002a3`.
  All filename, proof, test, lane and contract references use the new stem.
- The sole defined routine, `app.supplier_line_match_audit_guard`, is new:
  searching every main migration finds no existing definition to re-create or
  overwrite. No existing routine body is replaced and no function has SET app.*.

Resolved the sole text conflict as main's empty-table fixture list, in its order,
plus both supplier-line tables. Restore-reconciliation-upgrade consumes this list;
0624 adds no command-registry rows. Added both tables to watchdog's mutation-count
list as required. There are no product behaviour changes in this reconciliation.
The contract explicitly names the local replay/audit seam's LP-5 integration hold.

Local verification (installed tools, Node 24.17.0, at most two Vitest workers and
three named files per invocation; commands run in their package directories):
- core `vitest run --maxWorkers=2 src/line-discrepancy.test.ts src/discrepancy-evaluation.test.ts src/supplier-line-matching.test.ts`: 49 passed.
- core `vitest run --maxWorkers=1 src/supplier-match-corrections.test.ts`: 5 passed.
- ai `vitest run --maxWorkers=1 src/merchant-extraction.test.ts`: 33 passed.
- db `vitest run --maxWorkers=2 test/supplier-line-migration-proofs.test.ts test/m2-1-migration-proof.test.ts test/late-source-import-migration.test.ts`: 9 passed.
- db `vitest run --maxWorkers=2 test/merchant-intake-port.test.ts test/purchase-order-action.test.ts`: 61 passed (protocol doubles).
- core, ai, db `tsc -p tsconfig.json --noEmit`: passed.
- Core-purity, money-arithmetic, AI-provider-boundary, commercial-boundary and
  PL/pgSQL CASE-in-IF lints passed. Core purity reports 11 existing unverifiable
  computed test imports. `git diff --check MERGE_HEAD` passed.
- `node tools/provider-register.mjs --write` passed; generated register is identical
  to incoming main. No new provider destination or application/web path is added.
- Ran `node tools/agent-lane-boundary-lint.mjs --lane=batch-38`: refused the
  incoming main/index paths and pre-rename paths while the merge is uncommitted.
  Did not expand the lane to include those unrelated paths. A separate read-only
  check using the real lane parser/path/order validators against MERGE_HEAD and
  the final working tree passed: exactly 29 non-lane paths, no missing/surplus
  lane paths, no migration-order violations. Lane file does not list itself.

Router must stage the resolved merge and rename, complete the merge, and rerun
commit-bound lane lint. CI must prove real PostgreSQL fresh install/upgrade,
proof/catalogue/privilege/RLS checks, supplier-line correction/replay/concurrency,
purchase-order audit, watchdog and restore reconciliation, plus all required
checks and journeys at the final head. No PostgreSQL or browser suite ran here;
this sandbox cannot start PostgreSQL or bind localhost. Independent RED review
must bind the final head. Held-out corpus, live providers, G2 and release gates
remain closed. Earlier independent-check LATER notes remain unchanged.
