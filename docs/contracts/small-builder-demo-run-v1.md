# DEMO-S / DEMO-I run lifecycle v1 (RED)

Backend groundwork, 28 October 2026. This supersedes the earlier request-shape-only preparation. The chooser, HTTP/browser transports and journeys J1–J5 are outside this piece. No completed journey or product acceptance is asserted.

`SmallBuilderDemoApplication.execute(credentials, operation, runId, input)` uses the existing MON-2A signed-in company authority port (`subscriptionAuthority(identity)`). It resolves the real email-code session, selected company membership, Origin and CSRF anew on every call. A practice cookie cannot substitute for company authority. Compose it with `SmallBuilderDemoRepository(pool)`; the repository rechecks the persisted session in PostgreSQL through `mon1_company_actor`. No new authentication or fictional company bootstrap is invented.

| Operation | Input | Result |
| --- | --- | --- |
| create | null run ID; `small-builder-demo.create.v1`, commandId, scenario | Stored blocked run attempt with plain reason |
| read / resume | exact run ID; empty object | Current saved lifecycle state; no write |
| reset | exact run ID; `small-builder-demo.reset.v1`, commandId, expectedRunRevision | Archived predecessor and successor ID |
| snapshot | exact run ID; `small-builder-demo.report-snapshot.v1`, commandId, expectedRunRevision | Immutable report snapshot of lifecycle facts |
| report | exact run ID; empty object or snapshotId | Existing latest or exact snapshot; no implicit creation |

Strict Zod schemas are shared from the database package and re-exported by the existing API contracts module. SQL independently rejects extra command keys. No client-provided authority, hidden selector, source vector, completion, money, trial entitlement or business outcome is accepted.

All five families currently refuse execution: core awaits journey/correction bindings; recovery awaits its journey/collection/refund bindings; shadow awaits Final Check journey/attribution bindings; meter awaits profile execution/clock bindings; trial awaits journey/identity/clock bindings. Create persists the selection and refusal, rather than pretending to start domain work. Resume returns that persisted reason. J1–J5 must introduce accepted executable producer contracts in later changes; this piece has no execution-enabling switch or generic step/checkpoint writer.

Runs have tenant-qualified keys, creator membership. The signed-in company must be synthetic and the database must be `jobguard_synthetic_demo`. Runtime has no direct read/write table grants; the controlled routine checks authority before reads or receipt replay, including after waiting on the company lock. Ownership is the company and membership returned by `mon1_company_actor`, independent of the login session. A fresh valid sign-in for that same user/company can resume the run, read its snapshots and replay its commands; another user or company cannot. Session digests authenticate each request and are not stored as run or receipt ownership. RLS is forced and restricted to the migration-owned routine under transaction-local tenant context. These controls do not protect against stolen privileged database credentials.

Commands use durable per-company IDs. Reusing an ID with different input, operation, run or owner membership fails. Reset serializes with snapshots, increments predecessor revision from 1 to 2 and creates exactly one successor with revision 1. The original reset command replays its stored result; a different stale reset fails. No deletion, business cancellation, company replacement, meter exclusion, key release or billing rewrite occurs. Archived runs and their immutable snapshots remain readable with current owning-company membership authority.

Reports contain only persisted run ID, scenario, reason, lifecycle revision/status, timestamps and predecessor/successor IDs at snapshot time. They are lifecycle reports, not P2 product/source reports. There are no prices, hidden signals, claimed settled facts, external-action counts, source hashes or PASS claims. Snapshot and reset are audited transactionally with request/result hashes; the audit head is the final contending lock. GET-like reads never create reports or receipts. No external provider is called.

Migration 0313 is additive, automatically discovered by the existing numbered migration loader. See `packages/db/migration-notes/0313_small_builder_demo_runs.md` for isolation, CI suites and forward-fix notes. No production policy or release gate is changed.

## DEMO-J chooser transport (28 October 2026, RED)

`/demo-s` is the guided family chooser. It lists core-1000 (J1), recovery-18800 (J2), shadow-30000 (J3), all thirteen meter profile descriptions (J4), and the trial (J5). All are explicitly **not ready yet**: the current DEMO-I controlled routine stores blocked selections, not executable producer journeys. Meter profiles are descriptions, not saved profile executions. The complete J1–J5 and A1 acceptance remains outstanding. In particular the existing capture recipe does not establish downstream customer approval, correction, settlement, fee or clock bindings. MON-7b is not a DEMO-S blocker (Ben dropped it on 23 October); the older P1 catalogue hold is not promoted into a current dependency here.

The Next transport is `/api/small-builder-demo/[operation]`. POST accepts the strict shared `smallBuilderDemoHttpCommandV1` envelope (`operation`, `runId`, `input`); path and operation must match. Only create/reset/snapshot are mutations. GET read/report accepts the existing exact run/report locator schemas, rejects extra or duplicate query keys, and never writes a snapshot. All responses, including errors, use `Cache-Control: no-store`. Unknown failures return only `DEMO_UNAVAILABLE`. The server composes the existing company authority and repository; a client tenant selector remains subject to membership and database ownership checks. GET uses the configured origin only when no Origin header is supplied; POST requires the real Origin and current CSRF token. No practice cookie, commercial step dispatcher or generic report upload is introduced.

Lifecycle schemas now live in the pure core package and are re-exported through the original database entrypoint for compatibility. The browser validates the same result shapes as the repository. URLs carry only authenticated locators (company, run and optional exact snapshot); they confer no authority. A report link reads the current run separately from the immutable snapshot, so an old report cannot enable reset on an archived run.

The browser saves an unconfirmed metadata intent in session storage scoped to company and membership before sending. Retrying, including after reload in the same tab, preserves the original command ID and payload. A missing response blocks new mutations until the original request is reconciled by exact replay; current authority is required again. Definitive refusal clears only the pending browser intent. Reset archives the old selection and opens its successor, retaining links to history. No job, trial key, subscription, receipt allocation or financial journal is reset.

The saved selection report links to the persisted run and immutable snapshot. It contains lifecycle facts and the stored refusal, with no product source totals or completion verdict. A1 awaits all five completed journeys and persisted product-source reports; independent review and two genuine builder observations remain missing. Existing P2 structural validation is not relabelled as acceptance. The CI browser suite `DEMO-S-chooser.spec.ts` covers chooser/lifecycle behaviour in mobile-360 and desktop, not full J1–J5 acceptance. No new migration is needed; reserved 0329 is unused.

## DEMO-J1 core-1000 guided practice entry (29 October 2026, RED)

The chooser now links to `/demo-s/core-1000`. This is a guided exercise on the existing practice-job commands, separate from the signed-in company's blocked DEMO-I selection. It does not upgrade that selection, invent a completed run or write an A1 report. The practice session owns the captured job under the existing practice access rules; the company membership in the chooser grants no access to it. Opening a fresh guide reads the existing practice session. A button explicitly starts a session when absent, and Make my draft captures the five supplied priced lines using the existing versioned capture contract. There is no seeded end state, automatic action dispatcher or added provider.

After capture, `/demo-s/core-1000?jobId=<uuid>` embeds the existing authenticated job workspace. The URL is only a locator. Reload, the guide's resume link and the ordinary saved-job link all read persisted job history; an inaccessible job is refused without creating a replacement. Malformed or duplicate locators never mount a workspace. Instructions and expected figures are labelled as such and contain no hidden reads, counts or completion verdict. Shared capture defaults are unchanged; the guide supplies its own five-line text and continuation URL.

The exercise follows £900 quote revision 1, £1,000 revision 2, builder-recorded practice acceptance, v3 no-charge activation, +£125/−£25 approved changes and an unapproved £50 extra, verified generated proof, £1,320 final account, baseline dispositions, terms, immutable lock and the actual practice Final Check worker. It then issues the invoice, records £500 and £820, reverses the second receipt, and approves a £100 net / £120 gross credit note, leaving £700 due. Existing source-linked job value remains inspectable; the CH-9 business availability link preserves its existing held state. Manual receipts are not bank settlement or qualifying recovery. MON-5 customer journeys remain **not ready yet**, and acceptance is explicitly builder-attested practice acceptance.

`DEMO-J1-core-1000.spec.ts` is registered in both mobile-360 and desktop. It uses real UI/HTTP commands and the existing CI worker, with no SQL fixture completion or mocked successful responses. Attacks cover activation/receipt/reversal/correction replay, changed receipt payload, negative/fractional/over-limit amounts, injected allocation authority, excessive correction, invoice issue before completed Final Check, wrong locked-source hash, unchanged lock/invoice artifacts, pre-lock hidden-result absence, and foreign-session reads/writes. These are browser tests awaiting CI execution, not local database proof.

Value-source navigation now opens the existing variation or invoice panel for source UUID fragments and focuses the referenced saved element when it loads. Draft/lost jobs still cannot open commercial sections, and pre-live jobs cannot open work or invoice sections through a source fragment. The browser journey follows actual extra and invoice source links; seven lifecycle tests exercise those permission boundaries.

Local verification: installed TypeScript compiler builds core/config; web typecheck passes; installed Vitest runs `app/demo-s/core-1000/journey.test.tsx`, `app/demo-s/chooser.test.tsx` and `app/ui/workspace-lifecycle.test.ts` (39 tests). Playwright `--list` discovers both browser-project cases; no browser execution is claimed. Money arithmetic and commercial boundary checks pass, `git diff --check` passes, and the existing lane-policy API verifies all 11 uncommitted paths against the exact lane list. Commit-range lane lint correctly refuses the uncommitted self-comparison (HEAD equals origin/main), so CI must run it after the router commits. The pnpm launcher could not resolve/verify pinned 10.28.1 with the registry unreachable; installed binaries were used instead and no dependency was added. Database, browser, full build and full mandatory suites remain CI gates. No migration is needed; reserved 0410 is unused. Independent exact-head Claude RED review and two real builder observations remain missing. No release, provider, fee policy or commercial decision is approved by this change.

LATER / SIMPLICITY (initial self-review): `apps/web/app/ui/jobguard-app.tsx`, `WalkIt` — move the existing capture form into its own component file when that area next changes, retaining the current defaults and continuation callback. The guided route currently reuses it by importing the app module; extraction would reduce unrelated UI dependencies and keep capture maintenance in one small file. This is non-blocking and no unrelated extraction is included here.
Catch-up verification (31 October 2026): reconciled the router-started merge of `origin/main` at `c47ae08e`, retaining both chooser links and both journey contract sections verbatim. Installed Vitest passed the three named J1/chooser/workspace lifecycle files (39 tests, at most two workers); installed TypeScript passed web `--noEmit`; Playwright `--list --workers=2 DEMO-J1-core-1000.spec.ts` discovered phone and desktop cases. The lane-policy API covers all 11 paths relative to main, and `git diff --check` passes. No migration or SQL routine is changed; `docs/contracts/lp-downstream-effects-v1.md` is untouched. The router must stage the resolved files and complete the merge because this sandbox cannot write Git metadata. Database/browser execution, required CI and exact-head independent RED review remain outstanding.

CI repair try 1 (31 October 2026, PR #448): the mobile J1 trace failed at `captured.review.lines` because the test issued its proposal GET immediately after clicking Confirm scope, before the asynchronous review save/confirmation completed. The journey now asserts persisted-status UI acknowledgement and five confirmed lines before that read. It also waits for the completed lock indicator before reading the immutable lock and reloading. Existing money, identity, replay and isolation assertions remain unchanged; no sleeps, command retries, SQL or product behaviour changes are introduced. Local verification: installed Vitest passed the three J1/chooser/workspace lifecycle files (39 tests, at most two workers), installed TypeScript passed web `--noEmit`, Playwright `--list --workers=2` discovered both browser projects, lane checks passed for the two repair paths, and `git diff --check` passed. Browser execution remains a GitHub CI gate.

CI repair try 2 (31 October 2026, PR #448): both browser projects reached the Final Check terms button and found it disabled. Final Check terms acceptance is tenant-wide, so acceptance from an earlier practice job legitimately disables this control. J1 now reads the authorized lock view, accepts only when its saved boolean is false, and always asserts both the disabled accepted-state control and persisted `termsAccepted: true` before completing the account. Each baseline disposition must also retain its saved Done value. The guide explains previously accepted terms. Existing downstream journey assertions and financial controls remain intact; no SQL or exception changes are included. Local verification: installed Vitest passed the three J1/chooser/workspace lifecycle files (39 tests, at most two workers), installed TypeScript passed web `--noEmit`, Playwright `--list --workers=2` discovered both projects, lane checks passed for the three repair paths, and `git diff --check` passed. Browser execution remains a CI gate.

### DEMO-J3 shadow-30000 guide (built ahead on SV-6 hookup)

`/demo-s/shadow-30000` creates or recovers a real capture using the shadow recipe
in `small-builder-demo-inputs.json` (five £6,000 lines). It links the same job to
the existing review, quote, activation, capture, proof, final-review, lock and
Final Check controls. A saved job reference resumes the guide. Its nine fixed
instructions are target figures, never server completion or settlement facts.
The chooser's company selection report remains a separate lifecycle record.

`GET /api/jobs/:id/shadow-demo` authenticates current practice ownership before
reading public producers. Before lock it never calls the reveal, attribution or
pack readers. After lock it reads SV-5; after completed reconciliation it reads
SV-6 history, selects the latest immutable revision per case/work/line/lock and
uses the inherited illustration producer. Duplicate historical rows do not add
principal. New excluded assessments supersede older positive illustrations.
The report never aggregates per-line rounded fees or promotes historical
assessments into current eligibility. A refund/evidence change still requires
a new SV-6 assessment; the old receipt remains explicitly historical.

MON-5 customer approval is **not ready yet**. Builder attestation is not used to
approve the revealed catches on behalf of a customer. The £34,400 / £41,280
invoice, £800 Q, £80 fee and £720 retained are targets until their genuine
producer chains exist. CH-8 v3 generation and CH-9's public value reader remain
producer-bound on the inspected main; their holds remain visible. No migration,
external action, fee obligation or release is introduced. This guide and source
report do not complete the full no-step-skipped DEMO-J3 or DEMO-S acceptance.

Verification: scripted application/route/renderer tests exercise pre-lock
non-invocation, current-authority denial, foreign bindings, duplicate/reversal
history and captures' fee-free states. `DEMO-J3-shadow.spec.ts` exercises real
capture replay, £30,000 accepted baseline, £3,200 capture, £400 review capture
and £33,600 lock in both browser projects; execution is deferred to CI in the
restricted builder environment. Existing SV-6 integration tests remain the
real-PostgreSQL allocation/amount/reversal/locked-bill gate. Independent RED
review and two builder observations are still missing.

### DEMO-J3 part 2: executable source recipe (dark)

`DEMO-J3-shadow.spec.ts` now drives the source-to-reveal slice in mobile-360 and
desktop. All job, variation, proof, supplier and diary originals are created
through the existing product routes. The new `j3-drainage-photo` is a generated
PNG with an exact fictional caption (£500 proposed work); the exact fictional
loft-hatch diary supplies £300. The existing £320 material invoice is examined
as a zero-result source: a supplier bill alone does not assert extra work.
The photo caption decoder is shared by the source recipe and Final Check.
Unknown photo hashes and arbitrary diary text remain unsupported.

The executable pre-lock worker leg is `e2e/helpers/shadow-source-recipe.ts`.
It invokes the real ordinary-runtime source reader, pure detector and restricted
shadow sink, twice to exercise replay. It checks the two held rows through the
shadow login; no end-state row is inserted. This is an explicit worker invocation
by the test driver, not a claim that saving a source schedules pre-lock detection
in the UI. Holding/replaying those rows leaves the public report unchanged.
The post-lock leg requests the existing scheduled practice worker, waits for its
published completion and confirms/prices the two genuine revealed drafts.
The £33,600 account and its lock remain unchanged. The £3,600 captures remain
fee-free. No migration is needed; reserved 0451 is unused. No dependency added.

MON-5 is still **not ready yet**. The recipe does not attest to customer approval
of the catches, issue an invoice, create payment/allocation facts or produce a
positive SV-6 assessment. Exactly £800 of priced catches is prepared for that
producer chain; Q £800 / fee £80 / kept £720 remain targets, as do the invoice,
verified settlement, CH-8 pack and CH-9 value completion. Existing SV-6 tests
exercise its separate genuine settled-source chain; they are not evidence of
settlement for this J3 run. No live provider, personal data or release is enabled.
