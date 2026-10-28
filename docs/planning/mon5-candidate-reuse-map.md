# MON-5 candidate reuse map — M5-PREP

25 October 2026 · C270 · source inspection only; no candidate activation.

## Recorded sources and reconciliation boundary

Issued main/HEAD and local `origin/main` resolve to
`cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`. Initial worktree was clean, branch
`codex/sandbox/m5-prep`, actual worktree `.worktrees/m5-prep`.
Historical planning export `dc5721230fd8aedbf2d9d0457789074b66b48765` is a source
reference, not the implementation base. No fetch, checkout, add, commit or push.

| Candidate | Exact inspected head | Recorded parent/base | Integration at issue base |
|---|---|---|---|
| A | `236f26ed5f9da40eeb9847d8acb574bbd00af24e` | `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577` | Not an ancestor; DEPENDENCY-BOUND |
| B | `91834b6f03b24d4f798cc61aaa3b081a91301e68` | `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577` | Not an ancestor; DEPENDENCY-BOUND |

Both complete commit deltas (7 A paths and 14 B paths), their changed source,
tests, exports, lane records and embedded builder receipts were inspected using
local read-only `git show`/`git diff <base> <head>`. Dedicated candidate files are
absent from current main; the five existing touched implementation paths differ.
Candidate A/B worktree directories were not opened or modified. The historical
receipts report `.worktrees/ch-3a` and `.worktrees/ent-1`; those are reported paths,
not a claim that their present local contents were inspected. The external
planning file and Ben's 23 October answer were actually read; no supplied ZIP
manifest verification or professional review is claimed by this run.

No independent exact-head verdict or separate acceptance is contained in either
candidate delta or supplied in this dispatch. Neither receipt claims such a
verdict. Dispatcher must attach the actual recorded responses and integrated
commits. Full source classification is complete; accepted integration and final
technical reconciliation remain DEPENDENCY-BOUND. “Reuse” means preserve with
its original owner, not permission to land unaccepted work or copy it into this
preparation. Absent future implementation is explicitly not inspected.

## Every changed candidate path

SHA-256 below covers the actual complete file at the candidate head, including
test/receipt/registration bytes; it is an inspection locator, not a freeze on main.
The receipt files' SHA values bind their historical text, not their claimed runs.

| Candidate | Changed path | Classification | Current main | Candidate SHA-256 | Disposition |
|---|---|---|---|---|---|
| A | `config/lanes/mon-5a.json` | held | absent | `736001c7de72c37de53a915e99db85ba127bf7d3e77136e8371c80b4dcd1c265` | Historical candidate registration only; do not recreate, replace or edit in M5-PREP. |
| A | `docs/verdicts/MON-5A/BUILDER_RECEIPT.md` | held | absent | `8a23c8a844683efd8fde0eec8b56538b12215bdbc5993bc9d3cf758061f62936` | Inspected historical builder receipt; not an independent verdict, acceptance or current-head run. |
| A | `packages/core/src/customer-portal-approval-link.test.ts` | reuse | absent | `b3cea0969152c83b89f8a30ad260e520c84ffb31168f5796ef43652a33b4f314` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| A | `packages/core/src/customer-portal-approval-link.ts` | reuse | absent | `46bc4823cdff022e2db40f97a85d589b7609ce80e68b4bd2822312c586df26c8` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| A | `packages/core/src/customer-portal-approval.test.ts` | reuse | absent | `9b98d136bbcd80ae53f811b5e0e0d9238dd383375d64d2b60abee240145ccb33` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| A | `packages/core/src/customer-portal-approval.ts` | reuse | absent | `8b3b4b4c92eefc6ba7cdd90f8fb014b2a519000c1482b1f6cd8d31708804eea1` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| A | `packages/core/src/index.ts` | reuse | present, differs | `e3e12fb0eb84ca4c81bfb0e1d046626d385f3cb25a0bf378baab179150bc73af` | Shared barrel differs on main; preserve all later exports, serialize only candidate export additions with coordinator and other candidate. |
| B | `config/lanes/mon-5b.json` | held | absent | `9750e4517d2eff3c8c972dc05d5e089f5d85f65c4168a977966dba4c75414a2c` | Historical candidate registration only; do not recreate, replace or edit in M5-PREP. |
| B | `docs/contracts/customer-message-mon-5b-v1.md` | reuse | absent | `f9bde9e45690e9d4956f1b143b232536c13b76fddaf9f679a54ded9bdff2c9b9` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| B | `docs/verdicts/MON-5B/BUILDER_RECEIPT.md` | held | absent | `4f3e9bc20e75aa6346487fe5694fc67065056229a23e661c89393a13bd8c8f41` | Inspected historical builder receipt; not an independent verdict, acceptance or current-head run. |
| B | `packages/core/src/cancellation-kit.test.ts` | reuse | absent | `bf36bd521f29ca1452bee02367e8ee4ddc3e1e34e20515b975d4314536025484` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| B | `packages/core/src/cancellation-kit.ts` | reuse | absent | `01d9273aa2475cfc357384b051868451b2c23d3f93ad80801e20e6c4d1f6dda8` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| B | `packages/core/src/index.ts` | reuse | present, differs | `2b0cabf180128f3898015017410f2a541889bfdc224c7b0a8ba323da22d35eb9` | Shared barrel differs on main; preserve all later exports, serialize only candidate export additions with coordinator and other candidate. |
| B | `packages/core/src/quote-document.ts` | conflict | present, differs | `df59b1cd0791cd927f8721876240620056cca1ba63fb1418343086bc73901f49` | Existing main differs; original owner must reconcile narrowly with later Zod/quote scope and calculation guarantees; no replacement authorized here. |
| B | `packages/db/src/customer-message-fixtures.test.ts` | reuse | absent | `395032116a5a81c92b9aa50a1a768f61961897e8e8aa1b981604890f0d3882f1` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| B | `packages/db/src/customer-message-fixtures.ts` | reuse | absent | `10efca5e42110f2a02250aabb649092960e63b6ea7ec78b8d5aa9903cd560dd6` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| B | `packages/db/src/job-source-fixtures.ts` | reuse | present, differs | `78a7f9813a44d1181088b1c92a217946e117e5a36f1e164aad2eaf9614fa2a98` | Main equals candidate parent at this path; decoder addition is non-overlapping; source owner integrates after accepted B, no duplicate decoder. |
| B | `packages/db/src/quote-delivery-repository.ts` | conflict | present, differs | `05c20aaab3a2c58491370c8000e826dff2dd6d50efe42c26d58cc6e8d6d95dfe` | Existing main differs; original owner must reconcile narrowly with later Zod/quote scope and calculation guarantees; no replacement authorized here. |
| B | `packages/db/src/quote-document-repository.ts` | conflict | present, differs | `1053181cb1545f239f3bcd72aa8cea0fd53602e24b72767648d8b62e4b2aeb49` | Existing main differs; original owner must reconcile narrowly with later Zod/quote scope and calculation guarantees; no replacement authorized here. |
| B | `packages/db/test/cancellation-kit.integration.test.ts` | reuse | absent | `d5a71b53503615955b3d1ed589d2a5e898f770f89947c3ea2bff2328484e55f0` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |
| B | `packages/db/test/customer-message-evidence.integration.test.ts` | reuse | absent | `072173c16d59f35a9fd0eab8d8d7696260fe677a2c8dc0c2144594d5da1ebdfb` | Absent on main; preserve exact candidate source with original owner, DEPENDENCY-BOUND to accepted integration. |

## Exports, gates and narrow repair proposals

A adds two barrel lines, `./customer-portal-approval.js` and
`./customer-portal-approval-link.js`. B adds `./cancellation-kit.js`. Merge only
those additions with all current exports; do not transplant either old barrel.
The full symbol inventory is in the [authority proposal](../contracts/customer-portal-authority-proposal.md).
A contains no DB/HTTP executor. Its inspected gate is literally
`CUSTOMER_PORTAL_APPROVAL_LIVE_LINKS_ENABLED = false as const`, and
`assertCustomerPortalApprovalLiveLinkDisabled` always throws `LINK_UNAVAILABLE`.
That candidate remains OFF, with no enabling change in this task. The gate is
absent on main because A itself is unmerged, not an active main capability.

A's sample 12:00–12:30 lifetime is a test vector, not an approved expiry policy.
Its canonical binding records real/acting membership, switch and session references;
no function verifies a small-builder customer principal. Its pure tests validate
quote, signed variation and existing stage/proof matching and repeated reference
refusals; they do not demonstrate database races, authenticated replay or transport
isolation. Result method `customer_authenticated` alone authorizes nothing.

Main has since moved to Zod 4 (`z.guid`, `z.email` and error format changes).
A/B owners must re-run candidate contracts against that version; do not discard
strictness or weaken prior tests to resolve compatibility. B's quote-document
change overlaps this syntax conversion. Its quote-delivery patch was built before
main's `evaluateDraftQuote` line calculations, `assertQuoteScopeCoverage`, line-total
check, stale calculated-preview handling and exact send-authorization/coverage
changes. Its quote-document repository patch also overlaps later coverage checks.
A bounded owner repair adds only B's kit attachment/legacy replay handling around
these current guarantees, retaining correct totals, line coverage, authorization
and immutable PDF bytes. No repair is implemented or presumed accepted here.
B's shared decoder delta is additive against unchanged parent bytes; preserve
both existing tap fixtures. No duplicated message decoder, quote schema or kit.

## Exact cancellation and message artifacts

B owns `cancellation-kit.v1`, template version
`cancellation-template.synthetic.v1`, label
`synthetic template, not reviewed (D06 v2)`. It joins its 11 literal template lines
with LF and no trailing newline. The hash below is computed directly from those
inspected candidate template bytes, not from a recreated product template:

`0838fd7d952073b9713db51509b4a478499cc93e7ea79c07a95dcdbe1e15f93e`

`cancellationKitV1` binds that text/hash/version plus exact quote revision,
document version and reference; `quoteDocumentV1` cross-checks the binding.
`cancellationKitRows` renders the heading, label, template/version/reference/revision,
manifest hash and text through the existing `quotePdfText`/`renderQuotePdf` path.
The PDF artifact SHA-256 includes the companion. There is no single universal PDF
hash: it depends on the exact document snapshot. Keep it with its frozen document
version. Both `QuoteDeliveryRepository.preview` and `QuoteDocumentRepository.create`
attach to new server-selected synthetic documents, including domestic quotes;
no inference of domestic legal classification. Existing snapshots stay readable,
legacy preview/retry bytes remain unchanged, no retrofit or backfill. Non-synthetic
attachment refuses a supplied kit; no D06 review, legal deadline or real delivery.

B's exact fixture key is `customer-message:exposed-wires.synthetic.v1`; exact text
is `There are exposed live wires beside the new socket.` (51 UTF-16/UTF-8 ASCII
units). It decodes only `customer_request`, cites the whole `[0,51)` span and leaves
estimated value unknown. Wrong key, changed bytes or wrong kind returns null.
Unknown text remains saved/unprocessed through the accepted source path; it must
not become an invented price, commercial approval or site-activity event.
The existing rule expects safety disclosure, `surfaced_early`,
`disclosed_before_lock`, permanent ineligibility reasons and mandatory finding;
this fixture does not invent a production safety threshold or fee entitlement.
B's integration test seeds migration-role source fixtures then executes the real
worker/sink twice; it proves no authenticated customer intake by construction.
Before accepting it, the owning source/worker contracts and actual CI must verify
those precise states/reasons. No pre-lock hidden signal count leaks through reads.

## Inspected candidate commands — future runs only

These exact file names were inspected at the candidate heads. They are absent on
main and **NOT RUN by M5-PREP**. Historical receipt counts (A 10 pure tests;
B 4 core + 2 adapter tests) are reported builder results, not fresh verification.
A/B historical DB/browser runs were NOT RUN. Preserve mandatory suites in CI.

- A: `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/customer-portal-approval.test.ts src/customer-portal-approval-link.test.ts`.
- B: `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/cancellation-kit.test.ts`.
- B adapter: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/customer-message-fixtures.test.ts`.
- B CI: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/cancellation-kit.integration.test.ts test/customer-message-evidence.integration.test.ts`.

The four future repository/application customer approval services, authority
writer, message adapter, transport and portal page in the draft are not installed
here and are not inspected source. Their proposed tests are designs, not existing
candidate tests. Do not copy a candidate test into main to simulate integration.

## Parent acceptance ownership

Each MON-5 done-when item has one accountable future leaf; foundation and shared
consumer requirements remain part of that leaf's prerequisites and same-diff
acceptance. Parent MON-5 and DEMO-S remain OPEN.

| BUILD_PLAN MON-5 assertion | Accountable leaf | Required evidence beyond inspected candidates |
|---|---|---|
| Exact revision and hash approvals | M5-QUOTE | Q/V/S exact facts and separate approved consumers; AUTH first; quote activation and final-account paths cannot be side-fact-only. |
| Forged/expired/revoked/stale fail; replay one approval | M5-AUTH | Real checked storage/current-authority/locks; Q/V/S concurrent receipt tests and HTTP parity at their actual heads. |
| Builder sees messages and evidence, no pre-lock signal | M5-MESSAGE | Accepted SV-7A/CH-4 intake, original/evidence binding, actual read/query-log non-disclosure. |
| Message can fire must-surface | M5-MESSAGE | Accepted B exact fixture/worker semantics and CI permanent ineligibility proof. |
| Customer job only; enumeration fails | M5-HTTP | Persisted selected issuer/customer authority independently enforced by real Next/Nest; both-cookie, foreign and same-tenant wrong-job cases. |
| No personal data in audit | M5-AUTH | Atomic reference/hash-only audit at each Q/V/S/M writer; rollback and real query inspection. |

Additional build obligations: `customer_authenticated` alongside legacy attestation
belongs to Q/V and JOURNEY truthful labels; exact stage acknowledgement to STAGE;
synthetic cancellation kit to B reuse and JOURNEY; customer-to-evidence integration
to MESSAGE. M5-JOURNEY owns the aggregate fresh/refresh/two-client 360px/desktop
journey, existing post-lock catch approval and immutable legacy kit compatibility.
It cannot replace HTTP's same-diff true transport parity. Screenshots, pure matches
and seeded worker observations do not close that journey.

## Completion and holds

M5-P01 source classification: complete at the two recorded heads; integrated
acceptance DEPENDENCY-BOUND. M5-P02: only documentation/vector/lane/receipt writes,
no replacement or activation. M5-P03: negative vector design supplied, not runtime
proof. M5-P04: no approval status changed, unknown authority policy visibly held.
M5-P05: real/candidate/proposed inventory in the companion proposal, with all
8 exact proposed Nest/Next routes. M5-PREP is a preparation handoff only.

Migration 0234 was reserved conditionally by dispatch and is **unused**. No new
tables, routines, grants or API operations: LP-0 (including authority paths),
tenancy, SERIOUS-B5 and contractor-entitlement catalogue additions are exactly
zero. Existing freezes are untouched. No DB/browser/native/live-model evidence,
provider action, customer data, release approval, independent verdict or technical
acceptance is asserted by these documents. See the actual run receipt for checks.
