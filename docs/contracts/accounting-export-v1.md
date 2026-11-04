# M5-1/M5-2/M5-3 accounting export — dark synthetic contract v1

This is the small-builder M5-1 slice under BUILD_PLAN.md §11.6, not a live Codat integration or a claim that M5-1 is released. M4-23, D02, D04 and G5 remain release dependencies. Base inspected: local origin/main and HEAD both `32411c4e45a094cbe65ae90ee1d5debd1f266e2a`; no accounting-export implementation existed there. No remote fetch was performed.

The contract and executable fake live in `apps/api/src/accounting-export.contracts.ts` and `accounting-export.sandbox.ts`. They are deliberately not registered in any HTTP controller, module, worker or provider registry. The sandbox defaults disabled; explicit fixture construction enables only the deterministic in-process fake. Identifiers must be fictional `demo-` labels; source objects must be synthetic, builder-visible, and strict-schema validated. No customer names, descriptions, credentials, URLs, network operations or arbitrary metadata are accepted. This is a fixture convention, not a PII detection guarantee. Production construction, membership resolution and persistence are not implemented.

## Capability matrix

| Operation or field | Fake Codat target | Evidence and limitation |
| --- | --- | --- |
| Direction | Push only | No external-domain importer or two-way sync |
| Customer invoice | `invoice` | Issued immutable source revision; exact positive GBP pence |
| Credit | `credit_note` | Posted source, exact same-tenant/job invoice ID and revision; positive credit magnitude, not negative invoice |
| Receipt | `payment` | Posted source, exact same-tenant/job invoice ID and revision; does not establish settlement or recovery proof |
| Account/customer mapping | Fictional reference IDs | Exact mapping revision bound to preview; `synthetic_reference_only`, not D02 approval |
| Tax codes/VAT | Synthetic reference codes only | `no_tax`, `standard`, `zero_rated`; no rates, calculations or D02 approval. Unknown or mismatched source/mapping codes fail `unsupported_mapping`. Legacy `unsupported` asserts no tax treatment. |
| Retention | Unsupported | Same refusal; no amount silently dropped |
| CIS | Unsupported | Same refusal |
| DRC | Unsupported | Same refusal |
| Final account | Locked snapshot only | Source final revision must equal immutable locked revision; superseded/cancelled source refused |
| Update, delete, cancellation or reversal delivery | Unsupported | No automatic corrections/deletes; cancelled source stops new pushes, old ledger remains inspectable/reconcilable |
| Accounting systems | Fake Codat, fake direct Xero and fake direct QuickBooks | Common contract and conformance suite; no real accounting-system API support |
| Regional data path | Process memory only | No external destination, logs, credentials, telemetry or live/sandbox-provider evidence |
| Real Codat sandbox/live | Not built | Codat SDK is not installed; no dependencies added |

The bounded document contract carries source totals, IDs and revisions. It does not fabricate tax calculations, item lines, settlement evidence or missing provider capabilities. There is no rounding: validated integer pennies are preserved. Credits and receipts share one conservative per-invoice allocation ceiling across all target companies, computed with bigint from immutable export reservations (including failed/unknown attempts). Only the exact company/source entry being retried is excluded from the sum before adding its amount. An invoice and its credits/receipts must share the company and customer mapping bound by the first export reservation in that invoice family. This also applies when an adjustment is exported before its parent; later parent or sibling exports cannot change those bindings. Reservations cannot be silently released by source edits or cancellation. This is not an accounting balance or fee calculation.

## Authorization and reconciliation

A trusted synthetic context supplies tenant/actor and export permission. Preview resolves the source from the fixture repository rather than accepting a command-supplied amount. Its SHA-256 binds the strict parsed scope, target company, exact source and mapping revisions, tax/unsupported fields, target object, route, connection revision and consent revision. `confirmPreview` records a human confirmation of those exact bytes; push requires that stored approved Decision, its exact actor/action/hash and an unexpired consent/Decision. An approved-shaped object alone does not authorize push. Every attempt revalidates source availability, authority and consent. Changing target/mapping/source/consent requires a new preview and confirmation. Reusing a Decision ID for different content conflicts. Revoking confirmation prevents execution and prevents silently reapproving that Decision ID.

The process-local external-ID/mapping ledger preserves the original source and mapping artifact, target reference, result ID, attempts and status. Tenant + company + source ID is the stable business effect across revisions and routes; a different source revision cannot create a second object. A source already reserved in any target company cannot be posted again to a different company. A reused command ID or idempotency key with different input conflicts. Returned objects are defensive copies. Minimal audit events contain only tenant/reference/status, without source contents or personal data.

Push checks the deterministic external reference before any create. Definite failure and unknown outcome both block direct retry. Reconciliation classifies exact match, confirmed absence, external edit, duplicate import and conflicting ID/reference. Only confirmed absence permits another create; an existing matching object is linked without another push. External edits/duplicates/conflicts require target-side correction and another reconciliation; the sandbox cannot overwrite or delete them. Consent expiry/revocation blocks reconciliation as well as push; no new post-revocation authority is invented. Cancellation leaves the historic export visible for manual resolution and never sends a blind reversal. External `paid` is ignored; every result has `qualifyingRecoveryProof: false` and no ledger/settlement write path exists.

## Remaining work and verification boundary

In-memory records are not durable idempotency, transactional outbox, database uniqueness, RLS or restart-safety evidence. No schema/migration is introduced (reserved 0462 unused). Production adapters must reuse the approved command/outbox/audit and verified source repositories, persist stable business-effect keys across routes and restarts, and apply actual provider capability/consent/data-flow approvals. HTTP authentication, a browser preview screen, D02 tax/account policy, durable reversal/correction workflows, real Codat onboarding and provider conformance remain unbuilt. Do not wire this fixture model into a live runtime.

The named Vitest file `apps/api/src/accounting-export.sandbox.test.ts` exercises these contracts and failure paths with made-up data. It proves only the synthetic model, not PostgreSQL, browser journeys, regional provider processing or a release. CI and one independent Claude RED review remain required.


## M5-2 direct Xero dark slice

Inspected local `origin/main` (`0ed07540181f45003627427d4222f65985dcf5a8`) and the unmerged M5-1 base (`9497358e93a9f6434755c23ec080ec7a5534bc25`); main had no accounting adapter, and the base supplied the Codat-only fake, ledger and conformance tests. No remote fetch was performed. M5-1 remains a prerequisite branch; changes to the shared contract, sandbox, fixtures and conformance suite must serialize with base-branch repairs.

`accounting-export.fake.ts` contains only the common deterministic fake transport and adapter seam. `accounting-xero.fake.ts` adds independent tenant/company connection fixtures, with connected, token-expired and revoked states. Missing, expired or revoked connections refuse preview, export and reconciliation; connection revisions are monotone, and reconnection invalidates old export previews. Fixture administration is not real onboarding or OAuth consent. No tokens or URLs are accepted. The sandbox and route-change methods default disabled and are not registered with HTTP, workers or live configuration. No dependencies or migrations are added; reserved migration 0470 is unused.

Xero document/credit/receipt field mapping is confined to the Xero fake. Its `DEMO_*` object/tax codes are deliberately fictional, not verified Xero API values. Supported fixture tax tags are carried without altering source totals or calculating VAT. `unsupported` remains a legacy base-contract value but is refused by Xero preview and direct fake push with `unsupported_mapping`, before any transport attempt or document creation. Unknown tax tags, mismatched source/mapping tax tags, retention, CIS and DRC fail explicitly. Every live path remains absent, regardless of the fixture tags.

Rate limiting is a known non-acceptance in the fake. It records `rate_limited` and a fixed 30-unit retry deadline using the caller's deterministic clock; both push and reconciliation refuse early retry. At the deadline, the executor checks for an existing target before creating and reuses the unchanged approved amount, recipient and target mapping. Definite rejection and unknown outcomes still require explicit reconciliation; no timer retries an unknown create. Ledger attempts and status history remain visible. Native fake-document edits, canonical payload edits, duplicate imports and changed references surface as conflicts. An external paid label never writes settlement facts or qualifies recovery proof.

Route selection is limited to tenant + target company + job, never a broader tenant-wide grant. `previewRouteChange` hashes the exact scope/mapping, old/new route, target connection revision, consent revision and historic ledger entries. `confirmRouteChange` is the synthetic human-command boundary; it requires an unexpired approved `accounting_export.route` Decision with that exact hash, tenant and actor. A push Decision cannot change a route. Unresolved exports block switching. Both outgoing and incoming routes must resolve every historic entry to the same unedited target; otherwise the route change requires reconciliation. Changed mappings/companies require a new human-confirmed export preview; existing effects cannot be remapped or reposted even with new confirmation. Route history retains the confirmed mapping snapshot. Historic export artifacts and external IDs remain unchanged; switching routes requires fresh push authorization and returns the existing business effect without creating it again. A target reference absent on the new route is a visible conflict. Both route fakes may share one fake target-company object store, representing the same fictional remote books.

The common conformance suite runs unchanged assertions against both fake routes. Xero-specific tests cover document/tax mapping, expiry/revocation and reconnection, tenant/company connection isolation, backoff, native external edits, no-paid-label proof, route switches in both directions, unchanged historic mappings/IDs, wrong/broader approval scope, unknown-outcome holds and disabled defaults. These are executable in-memory contract tests, not database/RLS, real-provider sandbox, live integration, or independent RED review evidence.

NOT built: real Xero SDK/OAuth/token refresh/endpoints, provider API tax-code conformance, production persistence/outbox/unique constraints, RLS proof, HTTP/onboarding UI, automatic cancellation/reversal delivery, tax/retention/CIS/DRC calculations, settlement import or fee proof, G5/provider/data-flow approvals, deployment. Production remains held behind those gates.

## M5-1 persistence slice (`0558_accounting_export_persistence`)

`AccountingExportRepository` and `accounting-export.persisted.ts` add a separate, dark synthetic PostgreSQL boundary. The earlier sections describe the process-local sandbox; their persistence limitations do not describe this new boundary. Nothing registers an HTTP route or production worker. Fixture administration is migration/admin-only, and the database must be named `jobguard_synthetic_demo`. Fixture artifacts come from the existing validated synthetic preview; they are not authoritative customer documents. Persisted tenant UUIDs bind the fictional artifact tenant `demo-<tenant UUID>`.

Six migration-owned tables force tenant RLS and deny runtime/infrastructure direct access: current synthetic fixtures/consent, immutable approved Decisions, immutable external mapping ledger, outbox state, immutable attempt records, and an immutable fake-provider observation inbox. One checked function uses the existing authenticated synthetic company-session boundary, rechecks authority after the company lock, and binds actor, exact current artifact hash, target company, source/mapping revisions and consent expiry. Database preview hashes use the existing canonical `final_lock_hash`, independently of the in-memory sandbox's JSON serialization hash. Approval atomically stores the Decision, unique tenant/source business effect and pending outbox. Target company/route/revision changes cannot create a second effect for that source. Audit uses main’s database-owned `app.lp4_seal_audit` boundary with an accounting event namespace; no existing routine is replaced.

The fake-only executor commits `outcome_unknown` and an attempt ID before touching its adapter. A racing worker cannot claim the source again. On restart, it only reconciles the stable reference and stored target. Reconciliation accepts only version and attempt ID; caller-supplied matches are rejected in both the repository and SQL boundary. `FakeAccountingExportInbox` reads the fake adapter directly and appends a validated snapshot through a separate trusted fixture-administration connection. Runtime and infrastructure roles cannot read or write the inbox. Snapshots bind the tenant, exact durable attempt, source and artifact; reconciliation reads the newest recorded snapshot for that tenant/attempt/source. Missing observations fail with `EXPORT_OBSERVATION_REQUIRED` and leave the outcome unknown. A successful empty lookup is required to classify absence; a failed lookup records nothing. The privileged fixture connection is a trusted synthetic test capability, never a live-provider ingress or business-runtime credential. Matching objects link the external ID; edits, duplicate imports and mismatched IDs/references remain visible conflicts. **Confirmed absence is a hold, never permission for another create.** The first request may still be in flight; a future provider-specific, authorized recovery path must prove it is safe before relaxing this restriction. There is no automatic retry, corrective delivery, persisted route-switch command, live adapter or scheduler. External paid flags never write settlement, journal or recovery rows and every persisted result fixes recovery proof to false.

Forward-fix only: `0558_accounting_export_persistence` is additive and creates empty tables; existing data and routines are unchanged. Preserve all export history. A failed deployment leaves the dark executor unregistered; repair with a new migration rather than dropping tables or editing `0558_accounting_export_persistence` after merge. PostgreSQL fresh/upgrade, actual privilege catalogs and independent Claude RED review are CI/review gates, not local verification claims.

Validation for this slice and follow-up: installed TypeScript checks for db and API pass; 38 executor/LP-0 comparator tests and 100 inherited Codat/Xero conformance tests pass (one Vitest worker per run). Database integration and migration suites are collected locally but execution is deferred to GitHub CI because this builder cannot start PostgreSQL or bind localhost. Money/commercial boundary lints and `git diff --check` pass. The lane gate passes against the slice's actual base (`LANE_BASE_REF=HEAD^`, d34a420e), including the follow-up working-tree edits. The lane preserves exactly the persistence slice paths; the router must rerun the gate against current main after base integration.

The stored boundary also refuses unlocked final-account references and preserves the base contract's conservative combined credit/receipt ceiling. It serializes immutable reservations per company and checks current invoice identity, job and revision before reserving another adjustment. These are synthetic reference checks, not tax calculations or evidence that external cash has settled.

Follow-up validation (m5-1-persist, RED): executor regressions cover rejecting caller-supplied matches, failed lookups preserving unknown outcome, inbox binding and invalid-observation refusal. PostgreSQL regressions also cover forged direct SQL matches, another tenant with the same attempt UUID, another attempt in the same tenant, missing-observation holds, private immutable inbox catalogs and the unchanged no-repush rule. The exact SERIOUS-B5/tenancy/upgrade catalog unions add only the inbox table and its primary index; LP-0 gains no routine or runtime privilege. Database execution and independent RED review remain CI/reviewer gates.

## M5-1 human-confirmed preview (dark synthetic screen)

`/accounting-exports/<demo-source-id>` now shows the entire stored artifact, target company, source and mapping revisions, and the database preview hash. The company selector uses current authenticated memberships. The person must confirm the exact artifact before approving. Approval sends the hash and one stable Decision ID/expiry; a retry after a lost response reuses those bytes. Reloading a changed source requires a new preview. Existing immutable reservations still cannot be replaced or recreated by approving a different revision.

The Next routes at `/api/accounting-exports/<demo-source-id>` expose only GET `view=preview`, GET `view=read`, and POST approval. Every request uses the existing company-session/membership/CSRF bridge; POST also requires an explicit matching Origin. Responses are `no-store`. The server re-resolves the current artifact before approval and SQL atomically rechecks the exact hash under its existing lock. Unsupported tax tags, unsupported target objects and inconsistent tax mappings fail explicitly. Artifact tenant/source/company/mapping references are checked before confirmation. Request-supplied tenants, artifacts, amounts, execution operations and approval-shaped extra fields cannot grant authority.

The screen displays pending, pushed, outcome_unknown, confirmed_absent, external_edit, duplicate_import and reference_conflict. Refresh reads status only. There is no push, retry, observation-ingress or reconciliation endpoint, no provider SDK/network call, no consent screen, no scheduler, and no privileged fixture credential in the web runtime. Fake execution/reconciliation remains with the existing trusted fixture harness. External paid flags are never shown as settlement or qualifying recovery proof. Production remains disabled; G0–G5, D02, provider consent/data-flow approval and independent RED review remain closed/pending as applicable. No migration is needed.

Validation (2 November 2026 resume): preserved the existing implementation and resolved the inherited conflict in `packages/db/src/index.ts` as an exact union, retaining both accounting-export and shadow-demo-guide exports. API, web and database TypeScript checks pass using the installed TypeScript executable (`tsc -p <package>/tsconfig.json --noEmit`). Installed Vitest 4.1.12 with `--maxWorkers=1` passes 95 application/conformance tests, five Next-route tests and 11 persisted-executor tests (111 total). Core purity, money arithmetic, commercial boundary, AI provider boundary and PL/pgSQL condition lints pass; `git diff --check` passes. No dependency downloads or git writes were performed.

The full lint entrypoint stops at the lane boundary: the inherited base branches and staged main merge contain unrelated paths outside this piece's lane. Those paths have not been added to this lane or changed by this resume. The router must complete/stage the union merge and validate the piece against its integrated base; the worktree content contains no remaining conflict markers, but the read-only Git index still reports the inherited unmerged file. This is not a claim that the lane gate or full CI is green.

The real PostgreSQL/Next browser spec `apps/web/e2e/m5-1-export-preview.spec.ts` covers both configured widths (360 and 1280), stale approval, replay, unknown outcome, conflict statuses, unsupported mappings and foreign-company refusal. Database/browser execution is deferred because this sandbox cannot start PostgreSQL or bind localhost; no browser or database pass is claimed. Full builds and repository-wide suites remain CI gates, and independent RED review is still required before merge.

## M5-3 direct QuickBooks dark slice

Built ahead on `codex/sandbox/m5-3-quickbooks` from the M5-2 Xero branch. Changes to shared transport route types, preview tax refusal, common tests and this contract serialize with M5-2 repairs. No migration, dependency, provider registration or external network path is added. This is RED (money, authorization and tenant boundaries); CI and a fresh independent Claude review of the exact head remain required before merge.

`accounting-quickbooks.fake.ts` uses the shared deterministic transport and export/route authorization, ledger and reconciliation contracts. QuickBooks mapping stays local: fictional realm, customer/account references, invoice/credit-memo/payment entities, exact pence totals, source revisions and linked invoice revisions. These fields and `DEMO_*` codes are fixture conventions, not verified QuickBooks API schemas or provider conformance. No Xero fields are added to the canonical contract.

The exported versioned `fakeQuickBooksCapabilities` lists the supported fixture operations and unsupported features:

| Capability | QuickBooks fake boundary |
| --- | --- |
| Direction/objects | Push invoices, credit notes and receipts only; exact GBP pence and source IDs/revisions |
| Tax | `no_tax`, `standard`, `zero_rated` fixture tags only; no VAT calculation or tax-policy approval |
| Unsupported tax/features | Unmapped/unknown/mismatched tax, retention, CIS and DRC are refused before transport; no automatic reversal or external overwrite |
| Connection | Synthetic connected, expired and revoked states per tenant/company; monotone revision; reconnection requires fresh confirmation |
| Retry | Fixed 30-unit fake backoff; original amounts/recipients preserved; unknown acceptance requires reconciliation before retry |
| Routes | Codat/Xero/QuickBooks can share fictional target books; exact approved job scope, historic external IDs and mappings survive switching; no historic repost |
| Reconciliation | Exact match, confirmed absence, duplicate import, reference conflict and native/canonical external edits; external paid labels never establish settlement proof |
| Live/provider functionality | Unsupported: OAuth, token exchange/refresh, real endpoints, provider sandbox conformance, region/consent approvals, durable execution and production access |

The common conformance suite now runs the existing assertions for all three fakes. QuickBooks-specific tests cover all three objects and fixture tax tags, unsupported-tax refusal before preview and transport, revoked/expired connections and unknown acceptance after revocation, cross-tenant/company access, native edits, backoff, route approval/replay scope and three-route duplicate protection. They prove only this process-local model. G5, D02, actual provider/data-flow approval, real provider conformance, durable command/outbox/audit integration and database isolation remain release gates. No live capability is enabled.


## M5-1 persistence catch-up — 3 November 2026

Incoming main is `111865cf6` (`MERGE_HEAD`); local `main` is stale and was not used as the comparison base. Preserve main's complete QuickBooks contract and contractor-entitlement upgrade proof, adding only this slice's six exact empty-table expectations. Main already contains the earlier stacked Codat/Xero/QuickBooks work; this branch retains only M5-1 persistence. The reserved migration and proof now use `0558_accounting_export_persistence`. No existing main migration or routine is replaced. The private accounting audit helper now delegates to `app.lp4_seal_audit` with `checked_operation`; it no longer constructs or inserts audit rows itself. A PostgreSQL regression requires `audit.v2` and database-owned trust for approval, claim and reconciliation events.

Local verification: installed Vitest 4.1.12, one worker per run (two runs concurrently), passed `test/accounting-export-executor.test.ts` and `test/migration-proof-loader.test.ts` (87 tests), plus API `src/accounting-export.sandbox.test.ts`, `src/accounting-xero.fake.test.ts` and `src/accounting-quickbooks.fake.test.ts` (163 tests). Installed `tsc` passed `-p packages/db/tsconfig.json --noEmit` and `-p apps/api/tsconfig.json --noEmit`. Money arithmetic, commercial boundary and PL/pgSQL CASE-in-IF lints passed. Whitespace, conflict-marker, old migration-stem and exact lane-path checks passed against incoming main plus untracked files. The initial pnpm invocations stalled before starting scripts and were interrupted; the installed local executables ran the checks successfully without downloading packages.

PostgreSQL fresh/upgrade/catalogue/RLS and audit regression execution, browser suites, full CI and exact-head independent RED review remain unproved locally. No database or browser was started. The standard lane gate must run after the router stages and completes the merge: the current read-only index still holds the pre-resolution merge entries. NOPR handoff only; no commit, push, fetch or PR was performed here.

M5-1 catch-up (3 November 2026): integrated merge target `111865cf6` (the sandbox's local `main` ref is older). Kept main's Codat/Xero/QuickBooks contracts and tests, plus this branch's preview and its required persistence base, which is not yet present on the target. The persistence migration is now `0558_accounting_export_persistence.sql`, with its matching proof; earlier numeric references above describe the original slice. The new audit helper delegates to `app.lp4_seal_audit` rather than writing the chain directly, preserving LP-4 ownership and checked-operation sealing. Existing main routines, entitlement decisions and command authority are unchanged. The six new private export tables are explicitly included in the successor-table assertions and migration proof. The inherited persistence lane has been removed; the preview lane lists exactly this candidate's paths relative to the merge target.

Catch-up validation: installed Vitest 4.1.12, `--maxWorkers=1`, at most three named files per run: application, common sandbox and QuickBooks tests (158); persisted executor and migration-proof loader (87); Next route (5); Xero (20): 270 tests passed. Installed TypeScript checks passed for API, web and db. Core purity, money arithmetic, commercial boundary, AI provider boundary, PL/pgSQL condition lint and `git diff --check MERGE_HEAD` passed. The pnpm shim stalled before invoking scripts and was interrupted; checks used the installed package executables directly, without downloading dependencies. Full lint stopped at the lane boundary because the pending merge's index/HEAD still includes inherited paths; the router must stage the resolved merge and rerun against current main. The Git index remains unmerged because this sandbox forbids Git writes; both conflicted files are resolved on disk. PostgreSQL fresh/upgrade/catalog and browser execution, full CI and exact-head independent RED review remain unproved here.


## Batch-7 built-ahead union — 3 November 2026 (RED, NOPR)

Batch base is the already-present `origin/main` at `bc8993090`; local `main` is older.
Resolved the export-preview merge as a union with M5-1 persistence, M5-4 merchant
hardening and M4-13 database gate. The duplicate persistence migration/proof is
kept once as `0558_accounting_export_persistence`. Whole-stem replacements put
merchant ingestion at `0559_merchant_ingestion_hardening`, mandate persistence at
`0560_subscription_mandate` and its database gate at
`0561_subscription_mandate_db_gate`, each with its matching proof. No migration
already on the batch base was edited. The accounting audit helper retains its
tenant-context check and delegates to `app.lp4_seal_audit`; the gate's recreated
mandate bodies preserve their latest definition apart from the database check.
Main's MON-8 entitlement and LP-3/LP-5 command authority remain intact.

The shared `later-empty-tables.ts` contains all eight new empty app tables;
existing snapshot assertions retain their union, including the contractor
successor checks. One existing fee-collection fixture needed the exact agreement
ID, terms revision and hash now required by the inherited agreement schema. It
uses its existing selection/hash, preserving the stricter approval binding.
Piece lanes are replaced by `config/lanes/batch-7.json`, with all 47 changed
non-lane paths relative to the batch base.

Local validation used installed Node 24.17.0, TypeScript 5.8.3 and Vitest 4.1.12,
without downloads. Fifteen named Vitest files passed, 368 tests total, with one
worker per run and at most two runs concurrently (at most three files per run):
core merchant-connectors, subscription-agreement and supplier-documents; db
accounting-export-executor, migration-proof-loader, subscription-mandate-db-gate,
subscription-mandate and merchant-ingestion; API accounting-export.application,
accounting-export.sandbox, accounting-quickbooks.fake, accounting-xero.fake,
fee-collection/executor and fee-collection/m4-23-sb-rails; web
`app/api/accounting-exports/[sourceId]/route.test.ts`.
Installed `tsc -p <package>/tsconfig.json` passed for core, storage, config, db,
ai and API; web passed with `--noEmit`. Core purity, money arithmetic, commercial
boundary, AI provider boundary and PL/pgSQL CASE-in-IF lints passed, as did
`git diff --check origin/main` and deterministic disk-level lane/stem/proof and
conflict-marker checks. Initial db test loading lacked dependency builds; after
building existing packages those suites passed. Initial API compilation found
the fixture mismatch above; after completing that fixture the compiler and
consumer tests passed. No assertion was weakened.

READY for router staging/completion of the existing merge, NOPR. The index still
contains unresolved entries because Git writes are prohibited here; working
files are resolved. The router must rerun the standard lane gate after staging.
No PostgreSQL or browser ran. CI must prove fresh/upgrade migrations, actual
catalog/grant/RLS/audit behavior, database integration, browser journeys and the
full required checks/build against current main; an independent exact-head RED
review remains required when this group's turn comes. No fetch, commit, push,
PR, live service or real data was used by this session.

## Batch-7 PR handoff — 3 November 2026 (RED)

This group's turn supersedes the earlier NOPR handoff above. The launcher has
already completed the main merge: HEAD is `09746bfaf`, containing `origin/main`
`9e1c588c2` (LP-5c, MON-8, batch 6 and MON-7). No unresolved merge entries or
conflict markers remain. No product behavior needed changing in this handoff.
The lane note now identifies the second small group; its allowlist exactly
matches all 47 changed non-lane paths against the merged `origin/main`.

Migrations and matching proofs remain consecutive at 0558–0561. All eight new
empty app tables remain in `packages/db/test/later-empty-tables.ts`. The
contractor-entitlement upgrade test preserves main's successor expectations
and adds the shared later-table keys. Source inspection found no direct runtime
INSERT into command_receipt, decision_resolution or action_authorization, or
UPDATE of command_receipt, in this batch's changed code/tests. Mandate writes
run through migration-owned SECURITY DEFINER routines; fixture setup uses the
owner. No privilege or test assertion was weakened. Earlier LATER items remain
LATER.

Current local tests used installed Node 24.17.0 and Vitest 4.1.12 directly,
with `--maxWorkers=1`, at most three named files per run and two runs at once.
Twelve files passed, 205 tests total:

- core: merchant-connectors, subscription-agreement, supplier-documents (14);
- db: merchant-ingestion, subscription-mandate, subscription-mandate-db-gate (17),
  accounting-export-executor and migration-proof-loader (87);
- API: accounting-export.application, fee-collection/executor,
  fee-collection/m4-23-sb-rails (82);
- web: app/api/accounting-exports/[sourceId]/route.test.ts (5).

Installed TypeScript (`node node_modules/typescript/bin/tsc -p tsconfig.json
--noEmit` from each package) passed for core, db and web. API typecheck produced
no diagnostics but did not finish during the local run and was interrupted;
CI must complete it. Core purity and money arithmetic lints passed. Additional
commercial/AI boundary scans were interrupted without a completed result; no
pass is claimed. The pnpm version probe attempted an automatic version switch
and failed signature verification because registry fetches were unavailable;
no packages were installed, and all actual checks used existing executables.
Final `git diff --check origin/main`, conflict-marker, migration/proof-stem and
exact lane checks passed.

READY for the router to commit, push and open this group's PR with title
`chore: batch 7, second small group with migrations`. No git writes, fetch,
PostgreSQL, browser, live provider or real customer data were used. CI must
prove fresh and upgrade migrations, actual catalog/grant/RLS/audit behavior,
the batch's database integration suites, the export-preview browser journey
and all required typecheck/lint/test/build checks against current main.
Independent RED review must PASS at the exact resulting head before merge;
this local source inspection and deterministic testing are not that review.

## M5-2 stored route changes (dark slice, 4 November 2026)

`AccountingExportRepository.routeChangePreview` and `routeChangeConfirm` use the
migration-owned `app.accounting_export_route` session boundary. Inputs are strict
version-1 schemas. The destination connection/mapping proposal is an existing
administrator-owned synthetic export fixture, identified by source ID; runtime
callers cannot seed, edit or assert its connection state. Its full scope must
match tenant, target company, job, source revision and mapping. No tenant-wide
switch exists. A switch with no previous route/history is refused.

The canonical database preview hash binds version, exact scope/mapping, old and
new route, target connection revision, consent revision and the ordered historic
ledger artifacts, references, external IDs and execution states. Every historic
entry must be pushed with an external ID. Pending, unknown, absent, edited,
duplicate or conflicting entries hold the switch until reconciliation. These
are persisted synthetic observations, not fresh provider lookups or real
provider conformance. Live connection and target-visibility verification remain
with the held adapters/G5 work.

Confirmation is an explicit human-approved `accounting_export.route` Decision,
with an exact preview hash, tenant, expiry, command ID and single-use Decision ID.
The current session supplies the actor; caller-supplied actors are refused.
Confirmation appends one FORCE-RLS record and a checked-operation audit event in
one transaction under the existing tenant export lock. Identical command replay
returns the original record after current session, fixture consent/revisions and
reconciliation holds are checked; altered replay and Decision reuse across route
changes and ordinary export approvals fail. Expired confirmation cannot replay.

Existing ledger artifacts, mappings, references and external IDs are never
rewritten. Their existing export claim rules prevent reposting. A new source's
administrator-owned fixture must match the confirmed destination route,
connection/consent revisions and exact mapping before preview/approval; the
server does not silently rewrite a stale proposal. Other jobs/companies retain
their routes. No HTTP, screen, worker, scheduler, OAuth, SDK, endpoint, tax,
settlement or recovery-proof capability is added. M5-2 remains open; G0–G5,
provider approval, CI database execution and exact-head independent RED review
remain held.

## M5-2 stored route read and human confirmation screen — 4 November 2026 (RED, NOPR)

Migration `0767_accounting_export_route_change_read` adds one checked synthetic-only
read with the existing owner/admin session permission and tenant export lock. It
returns the hash-bound current proposal and immutable confirmed route history,
without changing tables, grants, predecessors, ledger mappings or external IDs.
Its only dispatcher call fixes the operation to the existing read-only preview.
The session-only `/api/accounting-exports/[sourceId]/route-change` GET/POST uses
the package application export, strict approval input, trusted POST origin and
no-store responses. The server derives scope/tenant from the checked read and
binds the session actor; actor mismatch rolls back before commit. SQL rechecks
the exact hash, revisions, expiry, Decision reuse and reconciliation holds.

The practice section shows old/new routes, target company, mapping and historic
entries. Confirmation retains identical command/Decision/expiry bytes after an
uncertain response; the server can replay the stored artifact after a committed
but lost response. Reload reads the confirmed route/history. Already-sent items
are never reissued. This supersedes the earlier slice's statement that no screen
or HTTP boundary exists. Real adapters, connections on screen, workers, production
use and G0–G5 remain closed; this does not finish M5-2.

Local validation used installed TypeScript/Vitest directly, with no downloads:
`tsc -p` for core, db and API, and web with `--noEmit`, passed. Vitest with
`--maxWorkers=1`, at most three named files per run and two test workers total:
API accounting-export.application (18); watchdog-registry/context-boundary/identity
(278); db accounting-export-repository/migration-proof-loader (82); web existing
export route/new route-change route/route-change component (11): 389 tests passed.
Lane boundary, core purity, exact-money, commercial boundary, AI provider boundary,
PL/pgSQL CASE-in-IF and diff whitespace checks passed. Initial JSX import and a
duplicate test fixture property were fixed without weakening assertions.

CI must run the extended real-PostgreSQL route-change suite, including read
isolation/permission, no-write reload and predecessor-preserving 0767 upgrade;
actual catalog/proof/RLS checks; and `m5-2-route-change.spec.ts` headless on
mobile-360 and desktop (lost response/replay, stale proposal, held unknown export,
permission and preserved historic IDs). No database or browser ran here. Full CI
against current main and independent exact-head RED review remain required.
Router commits/pushes this NOPR branch and reconciles/renumbers it into its group;
this session performed no Git writes, fetch, main merge, PR or release.
