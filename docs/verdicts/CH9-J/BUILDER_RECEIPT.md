# CH9-J builder receipt — 24 October 2026

Status: **HELD / INCOMPLETE**. Built the authorized server/application boundary;
not a working source-linked value vertical, accepted task, or money-display release.
No commit, push, branch change, migration, provider call or real data use.
Intended commit message: `/private/tmp/jg-msg-ch9-j.txt`.

## Authority and exact source

Issued wave-7 CH9-J order (decision 74, build without merge), C250.
Branch `codex/sandbox/ch9-j`; clean initial worktree at accepted CH9-R
`5dbb5060f7abdbb85214d38085b2f6b0690404f6`, containing CH9-S `aec2fb43`.
Observed `origin/main`: `6993a0cb59b9c26c25ae316b02c747cacc15e7e7`.
The dispatcher supplied acceptance status; this builder did not issue acceptance.
Read repository AGENTS.md, BUILD_PLAN.md CH-9 and sections 10.2/10.3,
`docs/contracts/value-v3.md`, accepted S/R sources/receipts, the complete CH9-J
DRAFT including J11 (planning pack lines 6629 onward), and its section 2 common
contract. Read Ben's actual answer at
`/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261023.md`.
The issued order overrides draft branch/lane names, dependency-build gates and
browser-spec instructions. No independent agents or model verdicts were used.
This is one build-ahead implementation; no post-review repair rounds occurred.

## Implemented scope

- Exact own lane registration, without expanding any parent's lane.
- `ValueV3Reader`: independently rechecks current practice session/job authority,
  including when called outside the application. Uses the existing ownership
  seam only. Declares required HELD source/derivation/subscription/money ports;
  never invokes one, queries shadow/business source tables, or calculates fees.
- `ValueV3Application.readJob`: current authority before query validation, source
  access or held-state disclosure. Strict versioned availability envelope only.
  Rejects extra supplied source/amount/tracked qualifying/remainder/subscription
  fields rather than silently stripping them. Rejects different job identities,
  receipt/vector fabrication and attempts to promote the state to complete.
- A fractional Q arriving from a reader is rejected with typed
  `VALUE_V3_SOURCE_REJECTED`, `status: incomplete`; no rounding or zero fallback.
  This is a negative boundary test, not an accepted rational display policy.
- Unregistered Nest controller: private/no-store, Vary Cookie, sanitized typed
  errors and a deferred request-scoped reader factory. Factory construction is
  after application authority, never a pre-auth source read. No write API.
- CI-only PostgreSQL tests: real practice issuer/current ownership checks and
  runtime role, direct reader/application denial, held-producer sentinel,
  repeated-read equality and before/after row-byte snapshots of all app tables.
  These are boundary fixtures, not fresh money-journey evidence.
- Unapplied additive coordinator composition patch. `git apply --check` passes.
  No shared file, barrel, catalogue test, export map or route registry edited.

The availability envelope is `job-value.v3`, with `status: incomplete`,
`reason: producer_bindings_held`, four HELD producer states, and null asOf/receipt.
It contains no count, zero amount, source identity, financial status or inferred
subscription period. It is deliberately separate from CH9-S's illustrative
`value-receipt.v3`. No supplied DTO is promoted into an authoritative receipt.

## Symbol verification and STOP ledger

Used `git grep` against accepted HEAD and `git cat-file -e HEAD:<path>` for paths.
Verified implementations: `ValueApplication.read`, `ValueController`,
`PracticeAccess.job`, `authorizePracticeJob`, `practiceOwnedJobsSql`, `withTenant`,
`createWorkspaceApplication`, `workspaceApplication`, `jobValueResponseV1`,
`valueReceiptV3`, `renderValueReceipt`, `ProposedValueSourcesPortV3` and
`ProposedValueDerivationPortV3`. The last two exist ONLY as proposed held ports;
`readAuthorisedSnapshot`/`readImmutableDerivation` are not real producer readers.
The existing v1 API/Next/page and VALUE-1/UIWIRE-12/audit-api-value/practice-scope
regression files exist. Existing positive `grossPence` allocation shapes exist;
that does not establish J11 case eligibility or a bound SV-6 output.

STOPs (affected behavior remains held):

1. `ValueV3Application`, `ValueV3Reader`, v3 controller/application/reader tests
   were absent/proposed at HEAD; implemented new bounded server files here.
2. Actual accepted SV-6/M4-8 H-VALUE-SOURCES producer API/schema/version,
   completeness, canonical event/correction identities, eligibility/case map,
   coherent source vector and event/window semantics are absent. Do not treat
   string mentions of SV-6/M4-8 as implementations. No private SQL substitute.
3. Actual MON-1 lifecycle/period producer and approved authority/read binding
   are absent. No company/session bridge or per-job subscription allocation.
4. Actual M4 immutable posted/collected/refunded/reconciliation handoffs remain
   unbound. Nothing is shown as posted, collected, settled or refunded.
5. CH9-S/R symbols are not exported through shared core barrels/package entry;
   actual runtime source-backed receipt/render integration is absent. The
   accepted renderer currently formats `£2820.00`, not required `£2,820.00`.
   Its copy audit lacks the full newly issued synonym set; its tracked
   qualifying/remainder renderer inputs can still be hidden. These parent
   corrections are outside this leaf's permitted files: no forbidden edit,
   no passing claim. New runtime envelope rejects all such supplied values.
6. New Next `/api/jobs/[id]/value/v3`, page, UI, CH-9-job browser spec and all five
   specified value selectors are absent at HEAD and remain absent. Server-only
   scope was issued. No knowingly red browser spec for a nonexistent route was
   added. J10 both-project browser/accessibility/navigation remains HELD.
7. Exact fresh-command examples, reversal histories and £500 partial/£0 unpaid
   companions cannot run against missing producer bindings. No invented
   endpoint, zero allocation, fabricated source fixture or source-vector receipt.
8. Main comparison lint fails on inherited S/R changes; current main composition,
   independently recorded exact-head verdicts, required CI and separate technical
   acceptance remain outstanding. No broader lane grant or test weakening.

## Acceptance coverage (not an acceptance verdict)

| ID | Boundary evidence / remaining requirement |
| --- | --- |
| J01 | Executed auth-before-query/source, repeated auth, deferred factory, private headers/error tests; real PostgreSQL test written, NOT RUN; registered HTTP/guard composition held. |
| J02 | Executed generic-denial unit cases for foreign session/tenant/job/import descendant; real direct-reader/application ownership tests written, NOT RUN. Full imported/foreign-tenant DB/browser traces held. |
| J03 | Executed constant held-response/no-hidden-fields checks; DB held-producer sentinel written, NOT RUN. Real zero/many-signal/must-surface comparison held. |
| J04 | Executed refusal to promote missing provenance into money; actual command/source replay/completeness/event/time reconciliation held. |
| J05 | Executed repeat-read equality/no-write API checks; all-app-table row-byte DB comparison written, NOT RUN; fresh full-state/browser proof held. |
| J06 | Executed no-receipt/no-vector hold assertion; actual invalidation/reversal/historical receipt inspection held. |
| J07 | Executed rejection of subscription and tracked qualifying/remainder supplied fields; runtime receipt remains unavailable. |
| J08 | Executed distinct-version rejection and existing v1 approved/pending-history suite; old browser journey NOT RUN. |
| J09 | Executed strict source/vector/receipt/job/promotion rejection; actual reconciled server as-of receipt held. |
| J10 | Executed broad no-money/ownership/settlement-copy check on held server response; new renderer/grouped display/source navigation and both browser projects held. |
| J11 | Executed missing-producer hold assertion; both independent real eligible allocation/unpaid setups held, no synthetic claims of completion. |

Tests were authored before their corresponding implementation. The initial pnpm
launcher stalled, and the first executed unit run failed module resolution before
assertions because workspace dist prerequisites were absent. After building those,
tests passed. No initial behavioral RED is claimed from that infrastructure error.
Then actually checked removal of seven implemented rules, restoring source in
`finally`: authority, unbound-query refusal, strict extra-field refusal, exact job
scope, version discriminator, held-status discriminator and private cache header.
Each mutation exited 1 with failing assertions; restored final tests passed.
Evidence: `/private/tmp/jg-ch9-j-mutations.json` and its seven named logs.
These demonstrate the implemented negative guards. They do NOT establish that
full J04/J06/J09/J10/J11 acceptance rules have executable fresh-journey coverage;
those remain explicit STOPs rather than placeholder green tests.

## Actual checks and resource receipt

Node v24.17.0; installed/cached pinned pnpm 10.28.1. No install or download
command. The default global pnpm 11 launcher stalled; three launcher attempts
were cancelled (exit 130). Used `/private/tmp/jg-ch9-j-bin/pnpm`, invoking the
already cached corepack pnpm 10.28.1 entry. Commands below used that PATH.
Disk observed 132 GiB free; memory pressure reported 55% free before heavy work.
Vitest maxWorkers=2; Turbo concurrency=2. Final Next build also used
`CIRCLE_NODE_TOTAL=2` (Next derives one worker). No DB/browser/restore startup.

- `pnpm typecheck --concurrency=2`: PASS, seven packages (two cached).
  An earlier incorrect `pnpm typecheck -- --concurrency=2` failed TS5023 because
  it passed the flag to tsc; corrected command above passed.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/value/value-v3.application.test.ts src/value/value-v3.controller.test.ts src/value/value.application.test.ts`:
  final PASS, 33 tests / three files. Earlier runs passed 32 before adding the
  deferred-factory regression. Initial missing-dist failure noted above.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/value-v3.test.ts src/value-v3-receipt.test.ts src/value-v3-copy.test.ts`:
  PASS, 85 inherited tests / three files. Does not prove new copy/grouping rules.
- `pnpm exec turbo run lint --filter=@jobguard/api --filter=@jobguard/db --concurrency=2`:
  PASS, six package/dependency tasks (two cached).
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=2`: FAIL, inherited S/R files
  outside CH9-J lane; core purity passed before lane refusal. No policy weakened.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: same FAIL. Comparing against exact
  accepted HEAD also correctly refused a self-comparison. Separate current-file
  allowlist validation below is not a substitute for the required main gate.
- `node tools/money-arithmetic-lint.mjs`: PASS.
  `node tools/commercial-boundary-lint.mjs`: exit 0.
- `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=2`: PASS, seven tasks (two cached).
  Existing Next workspace-root, CSS, Nest file-type and computed-dependency
  warnings; Turbo shared-cache write EPERM warnings. No task failure.
  An earlier build without the Next worker bound was deliberately interrupted
  before web build; Turbo printed exit 0 on shutdown, not a completed build.
- `pnpm openapi:check`: FAIL, tsx launcher IPC listen EPERM.
  `node apps/api/dist/generate-openapi.js --check`: FAIL, compiled-generator
  metadata produces stale-spec comparison. No generated file overwritten.
  Equivalent source checker `cd apps/api && node --import tsx src/generate-openapi.ts --check`:
  PASS, exit 0, avoiding the launcher's IPC socket.
- `git apply --check docs/integration-patches/ch9-j-composition.patch`: PASS.
  `git diff --check`: PASS for tracked diff; new files additionally inspected.
- PostgreSQL suites, browser suites, root full test suite, clean install and
  restore: NOT RUN. No migration/schema change, AI/prompt change or live provider
  change; migration/eval/live-model gates are inapplicable to this boundary.

## Coordinator handoff / safe choices

The unapplied patch names exact additive rows: DB barrel export for ValueV3Reader;
workspace request-scoped `valueV3.readJob` composition; workspace API export;
Nest controller/factory registration. Apply and test on then-current main, not as
permission to bypass guard/security catalogues. This patch still exposes only the
held boundary; accepted producer bindings need a separate reviewed integration.
No existing package export-map change is necessary for those existing root and
workspace entries. Shared core exports for S/R, generated OpenAPI, route/security
catalogue rows, Next adapter/page/UI, billing-period link and selector ownership
must be added by their serialized integration owner when executable. No actual
shared targets were edited here.

Specific safest choices: refuse unbound query selections; expose no hidden state,
counts or source links; refuse supplied money/receipt/vector instead of guessing;
keep all producer capabilities HELD; never apportion subscription; never round a
fractional Q; show no fee or settlement status without accepted proof. No charge,
standing authority, customer binding, policy approval or production route enabled.
No new operational alert, external action, persistence, migration or rollback is
needed; removing the unregistered boundary has no business-data effect.

Final additional checks: `pnpm --filter @jobguard/api typecheck` passed after
mutation restoration and the final test edits. A read-only script parsed the
actual merged lane policy and checked every untracked file with `lanePathAllowed`:
PASS, nine new files and zero tracked-file edits. New-file/addition whitespace
inspection passed. The first whitespace script mistakenly treated standard
unified-diff blank context markers as trailing whitespace; the corrected check
examines patch additions while `git apply --check` validates patch syntax. This
local scope evidence does not clear the failed origin/main comparison.
