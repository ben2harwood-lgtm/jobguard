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

### DEMO-J5 first-job trial guide

The trial selection links `/demo-s/trial?tenantId=…&runId=…`. Bind two existing
fictional company jobs; the signed-in owning company and approved reference
identity fixture are required. This does not create accepted quotes or pretend
that practice-cookie jobs belong to a company session. The guide calls the
existing MON-3 card request, fictional completion and exact switch-live commands.
It offers first-only Skip, and permits the second-job attempt only after the
first job has a stored trial start. A refused capacity producer is visibly
incomplete; no bypass or successful activation seed is installed.

Migration 0394 adds only `app.demo_trial_binding`, with tenant-qualified run/job
foreign keys, FORCE RLS, no runtime table grants and immutable rows. Its single
runtime entry point `app.demo_trial(uuid,text,jsonb)` checks current owner/session
before lookup and replay, and checks again after acquiring the company lock.
The existing immutable receipt table stores binding receipts and source-report
snapshots. The versioned `trial-demo-command.v1` accepts bind/read/snapshot/report
only; callers cannot supply source facts, clock values, terms or balances. The
Next POST `/api/small-builder-demo/trial` and Nest POST
`/small-builder-demo/trial` require company authentication and use the same strict
command schema and failure mapping. Practice cookies alone confer no access.

Reports bind run and both job identities to the public MON-3 lifecycle and
eligibility readers and MON-2 subscription records, preserving trial IDs,
activation IDs, source-event IDs, accepted agreement revisions and actual period,
statement and simulated-result records. Snapshot links retain their original
sources. Lock/close/second-activation outcomes come from stored events. The day-90
clock is a pure projection at the deadline derived from the immutable start and
approved London convention; it cannot drive commands, accept retrospective terms
or issue a subscription period. Missing starts and downstream producers remain
incomplete. Prices and customer-facing legal wording remain **[BEN TO SUPPLY]**.

Resume reads current sources. Browser request intents are scoped to company,
membership and run, validated against closed same-origin paths, and retain exact
command IDs for retries. A pending card request also survives tab reload.
Archive-and-reset uses the existing chooser; replacement runs must bind the same
jobs, and cannot restore eligibility, erase identity claims or reset subscription
records. A historical report cannot enable mutations on an archived run.

0394 changes no predecessor routine or row and needs no backfill. Forward-fix any
schema issue in a new migration; retain bindings and receipts. CI must run
`small-builder-trial-demo.integration.test.ts` (binding, cross-company/stale
session/refusal/replay/reset/identity/terms/privileges),
`small-builder-trial-demo-upgrade.integration.test.ts` (populated predecessors and
repeat migration), existing MON-3 lifecycle/keys and MON-2 first-period suites,
LP-0, SERIOUS-B5, entitlement, and `DEMO-J5-trial.spec.ts` in both browser projects.
The browser fixture suite is intercepted UI-contract evidence, not database or
successful capacity/admission proof. Full DEMO-S acceptance remains outstanding.
