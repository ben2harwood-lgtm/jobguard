# SV-2 builder receipt — 7 October 2026

Implementation supplied for independent review; **not technically accepted**.
Database assertions are source-inspected and await real PostgreSQL CI execution.
No independent model verdict or separate acceptance is asserted by this receipt.

## Identity, scope and issued decisions

- Task/branch: SV-2, `codex/sandbox/sv-2`; synthetic small-builder persistence only.
- Builder: Codex in the issued sandbox. No sub-agent or substitute model review.
- Dispatched base / existing HEAD: `e77f442d1bfac41df46dc234907a94f38581d691`, read from the Git reference file. Work remains uncommitted; the dispatcher assigns the new head. Bind the independent Claude verdict to that exact new commit.
- `origin/main` observed by the mandated lane check: `3395d343fd50d979c734daf4946ba293ee2ed836`. No direct git command, commit, push, merge, checkout or PR creation by the builder. The mandated lane tool internally runs read-only git.
- Read: repository AGENTS rev 3.0; BUILD_PLAN §§2.2–2.4, 6, SH-1, 9.1.5, 10.2 (including Test R), 10.4 SV-1/SV-2/shared rules, 10.5/10.6, 12.1–12.3; SH-1 acceptance/contract/migration/tests; merged SV-1 domain and acceptance; existing variation, audit, tenant and bootstrap code.
- Migration is the issued **0100**, not 0061. No BUILD_PLAN edit by the builder. The `sv-2` lane is one compact name-sorted line; BUILD_PLAN is allowed solely for the integrator's ledger amendment: `SV-2 → 0100, codex/sandbox/sv-2; §12.3's 0061 released`.
- Q1: Ben's Command Center decision `jobguard-sv2-reveal-lock-split-2026-10-07`, 7 October 20:01, exact words **“split the test”**. No lock table created. **DW3's positive half is owed by SV-4**, including own revealed rows only, other states/jobs/tenants excluded. Integrator's separate small plan PR records that moved acceptance criterion. SV-4 must use `(tenant_id,job_id)` and acquire the same job row lock before lock creation/audit.
- Q2 mapping: card `LogExtra` → merged **LogBuilderExtra → builder_logged**; **AddFinalReviewExtra → final_review** unchanged; card `ConfirmCatch` → **ConfirmJobGuardCatch → jobguard_catch**. No aliases/renames, final-review command or catch command added. The existing propose application action is the LogBuilderExtra seam.
- Q3/Q7: withdrawal is a fact/repository seam only; support disclosure is a server-only repository function with the exact support route. No HTTP/OpenAPI surface or web paths. C2 application composition is preserved; C7/new Playwright spec do not apply. Existing browser suites stay mandatory.
- Q4/Q5: roles created idempotently in 0100 and demo bootstrap. No Docker changes, memberships in other roles, login or support holder appointed. Bootstrap removes PostgreSQL 16's implicit non-superuser creator membership. Separate emergency membership is required for support conversations even though the shadow worker can execute disclosure for other routes.
- Q6: run/classification/disposition tables created with qualified FKs, unique classification and append-only enforcement; no worker/command writes them. SV-5 adds exact lock/locked-line binding, expand-compatible.
- Q8: SV-2 owns `extra_origin`/`validate_extra_origin` edits until merge; ENT-4b must serialize after it. No contractor provenance columns/events/links added.
- SV-1 follow-up: pre-lock `reconciled/duplicate_signal` is an intentional coalescing marker, **not** a completed Final Check. The duplicate keeps its qualified coalesced target; disclosed provenance remains `surfaced_early`. SV-3 must preserve this distinction.
- The checked-out tenant-context implementation has no runtime stamp registry (TENANT-STAMP-1 is absent from this baseline). Every new context is obtained through `verifiedTenantContextFromMembership`; no new cast-literal VerifiedTenantContext. Synthetic membership fixtures follow the current constructor's AuthenticatedMembership boundary.

## Changed files

| File | Purpose |
| --- | --- |
| `config/agent-lane-assignments.json` | Only the sorted sv-2 lane line, including integrator-only plan allowance. |
| `packages/db/migrations/0100_shadow_persistence.sql` | Roles, nine tables, qualified evidence/final-line identity, source FK/probe barrier, bounded routines, private audit append. |
| `packages/db/src/migrate.ts`, `src/index.ts` | Register migration and narrow repository export. Shared registry edits serialize. |
| `packages/db/src/shadow-repository.ts` | Versioned strict input validation, reveal/emergency read and support disclosure; results returned after tenant transaction commit. |
| `packages/db/src/variation-repository.ts` | Noncommercial LogBuilderExtra receipt/origin/audit/replay path and withdrawal persistence seam. Existing variation functions/projections retained. |
| `apps/api/src/variation/variation.application.ts` | Only the propose path now calls the command-backed capture seam; revise/approve/reject unchanged. |
| `packages/db/src/demo-bootstrap.ts` | Pre-create/check isolated NOLOGIN roles before NOCREATEROLE migration execution; appoint no holder. |
| `packages/db/test/shadow-persistence.integration.test.ts` | Lock-empty, support/permission/replay/rollback, exact evidence metadata, qualified FKs and existing audit-chain verification. |
| `packages/db/test/shadow-catalog.integration.test.ts` | Ownership/FORCE RLS; table/column/sequence/view/function reachability; exact EXECUTE; actual role attacks and immutable facts. |
| `packages/db/test/small-builder-origin.integration.test.ts` | Provenance/races/replay/revocation/atomic failure; application composition; indistinguishable runtime probes; kind/source FKs; withdrawal; exact predecessor upgrade/backfill verification. |
| `packages/db/test/tenancy.integration.test.ts` | Inserted expected catalog rows only. |
| `packages/db/test/UIWIRE-12.integration.test.ts` | Migration count only, 45 → 46. |
| `packages/db/test/demo-bootstrap.integration.test.ts` | Migration counts and actual shadow posture/no-holder assertions after twice-run bootstrap. |
| `packages/db/MIGRATIONS.md`, `docs/contracts/shadow-persistence-v1.md` | Contract, compatibility, role catalog, future bindings and forward-fix strategy. |
| `docs/verdicts/SV-2/BUILDER_RECEIPT.md` | This truthful handoff. |

## DW1–DW8 coverage and practical limits

| Card assertion | Implementation / automated evidence | Execution status |
| --- | --- | --- |
| DW1 | Runtime has no shadow table/column/sequence/view privilege; recursive dependent-view scan and callable-function scan, exact bounded EXECUTE catalog. Actual runtime SELECT attacks. | PostgreSQL execution owed by CI. |
| DW2 | Both new roles are NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS, members of no role; no identity/control-plane grants. Actual table, policy, role and RLS-off attacks. | PostgreSQL execution owed by CI. |
| DW3 empty half | Zero rows despite matching tenant/job **revealed rows actually seeded** and other states/jobs/tenants present. No fake lock. EXECUTE exactly runtime (plus owner). Constant reveal audit shape. | PostgreSQL execution owed by CI. **Positive locked half explicitly SV-4's obligation.** |
| DW4 | Immutable statements reject UPDATE/DELETE/TRUNCATE on new facts; signal receive/proposal/disclosure provenance guarded; early disclosure state terminal; reason rows append-only; SH-1 origins retained immutable. | PostgreSQL execution owed by CI. |
| DW5 | Composite tenant/job signal, evidence/version/hash/receive-time, run/signal/classification, match and origin links. Cross-job/cross-tenant attacks tested both under real shadow role and privileged fixtures to distinguish FK rejection from RLS. | PostgreSQL execution owed by CI. |
| DW6 | Separate emergency role; required reason in restricted access fact and hash-only audit before returning; ordinary runtime/worker denied. Exact grantee catalog and atomic rollback test. | PostgreSQL execution owed by CI. |
| DW7 / Test R | Support repository pins `support_conversation`; worker cannot impersonate support. Durable disclosure, first-visible server time, permanent flag and ineligibility; replay conflict and rollback; all current other routes use the same routine. | PostgreSQL execution owed by CI. |
| DW8 | Previous-schema upgrade seeds variations before SH-1, compares completed backfill rows/labels/counts before/after 0100 with no second backfill. Variation/final-account suites and API/browser regressions preserved unchanged. | DB/browser regressions owed by CI; SH-1 obsolete catch assertion conflict below. |

B2 tests cover command provenance, one origin, kind/track enforcement, source only
for catches and source FKs. Runtime **existing and nonexistent source IDs receive
the identical 42501 message/detail/constraint**, refused in the BEFORE trigger
before PostgreSQL's RLS-bypassing FK lookup. B3 keeps the captured variation/origin
and appends only withdrawal. Fresh install and seeded upgrade are real-PG tests;
the existing non-superuser bootstrap runs twice and checks zero appointed holders.
No database assertion above is labelled executed/passing locally.

## Role/grant catalog expected in CI

All new tables are migration-owned, tenant-scoped, ENABLE + FORCE RLS:
`shadow_commercial_signal`, `shadow_signal_evidence`, `shadow_signal_ineligibility`,
`shadow_reconciliation_run`, `shadow_signal_classification`,
`shadow_signal_disposition`, `shadow_disclosure_event`,
`shadow_break_glass_access`, `variation_withdrawal`.

| Principal | Grants |
| --- | --- |
| jobguard_runtime | No shadow tables/columns/sequences/views; SELECT/INSERT withdrawal; existing origin SELECT/INSERT; reveal EXECUTE only. |
| jobguard_shadow | SELECT shadow; INSERT proposals/evidence/ineligibility/run/classification/disposition; selected signal projection-column UPDATE. Disclosure EXECUTE. No direct disclosure/access-fact INSERT. |
| jobguard_shadow_emergency_access | No tables. Emergency-read and disclosure EXECUTE only; support-route use requires holder membership. |
| jobguard_migration | Owner; bounded routine authority; private helper owner-only, no PUBLIC/runtime/shadow/emergency EXECUTE. |

No new UPDATE/DELETE/TRUNCATE grants to runtime. No grants on identity, credentials,
control-plane or infrastructure data to either new role. Synthetic test logins
alone receive the separate memberships. Search paths are pinned. Existing audit
head allocation is the final lock; job then signal locks precede it. Audit payloads
contain IDs/hashes only, with SQL timestamps normalized to the existing audit.v1
millisecond canonical format. They do not contain signal descriptions or reasons.

## Commands actually observed

Dependencies were already installed. **No install command was run; no package download was observed.** The
last issued environment instruction overrides `pnpm install --frozen-lockfile`;
a clean pinned install remains CI evidence. Node `v24.17.0`. The default pnpm
launcher attempted version resolution and was stopped (exit 130). Commands below
use `PATH=/private/tmp/sv2-bin:$PATH`, whose pnpm shim executes the already-cached
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No package or
lockfile changed. Turbo reported sandbox cache-write IO warnings; those warnings
are recorded rather than represented as verification failures when exit was 0.

| Exact command (pnpm uses the cached shim above) | Exit / observed result |
| --- | --- |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-catalog.integration.test.ts` **before implementation** | **1**. Missing issued migration registration assertion failed; PG setup also failed. This is the failed-first run, not a claimed DB red/green result. |
| `pnpm typecheck` first | **2**. Nested cross-package Zod generic inference error; fixed by staged strict wrapper plus shared-schema parsing. |
| `pnpm typecheck` subsequent and final | **0**, 7 package tasks; cache warnings only. |
| `LANE_BASE_REF=origin/main pnpm lint` initial and final | **0**, repository guards and all package checks. |
| `pnpm build` | **0**, all 7 package tasks including optimized Next production build. Next workspace-root/CSS and cache warnings retained. Final-source repetition recorded below. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0**, sv-2 registered and changed paths permitted; final receipt-inclusive repetition below. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-catalog.integration.test.ts -t 'registers the issued expand migration'` | **0**, registration assertion now passes; other 4 tests intentionally filtered. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-catalog.integration.test.ts test/shadow-persistence.integration.test.ts -t 'registers the issued\|rejects malformed versioned'` | **0**, 2 assertions passed / 10 deliberately filtered. Only pure registration/boundary assertions, not DB isolation. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-persistence.integration.test.ts test/shadow-catalog.integration.test.ts test/small-builder-origin.integration.test.ts test/shared-money-origin.integration.test.ts test/variation.integration.test.ts test/final-account.integration.test.ts` | **1**. Six suites cannot initialize PG; 1 registration assertion passed, 32 DB tests skipped. Later added negative assertions remain CI work. |
| `pnpm test` | **1**. Root tool checks and multiple package suites passed; core reported 2,836 passing / 6 allocator timeout failures (source and dist); DB setup failed. No mandatory check weakened. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/shadow-domain` | **0**, 10 files / **105 tests passed**. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/receipt-allocation.test.ts` | **1**, 31 passed / 3 existing 5,000-ms timeout failures. Allocator and its tests unchanged; failures persist in isolation. |
| `pnpm test:db` | **1**, 5 files passed / 40 failed; 30 assertions passed, 209 skipped, 1 restore assertion failed on blocked localhost. Other failures occur during PG initialization. |
| `pnpm test:migrations` | **1**, both suites failed PG initialization; 11 assertions skipped. |
| `pnpm openapi:check` | **1**, tsx launcher attempts a forbidden IPC pipe (`listen EPERM`, `/var/folders/.../tsx-501/63935.pipe`). |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | **0**. Same source comparison using Node loader avoids the IPC launcher; committed OpenAPI is current. |
| `node apps/api/dist/generate-openapi.js --check` | **1**, silent Nest abort. Separate read-only diagnostic found existing DecisionsController emitted metadata requests `Function` rather than Pool. No adjacent fix made. The source-loader OpenAPI check above passes. |
| `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --target ES2023 --module NodeNext --moduleResolution NodeNext --experimentalDecorators packages/db/test/shadow-catalog.integration.test.ts packages/db/test/shadow-persistence.integration.test.ts packages/db/test/small-builder-origin.integration.test.ts` | First **2** on an overly narrow inferred UUID fixture parameter; after explicit string parameters, **0**. Final negative-assertion repetition below. |

Exact PostgreSQL setup error:

> Postgres init script exited with code null. Please check the logs for extra info. The data directory might already exist.

Restore's separate error: `listen EPERM: operation not permitted 127.0.0.1`.
No PostgreSQL server started successfully. No grant/catalog/upgrade assertion
ran against a real database locally. Local logs live under `/private/tmp/sv2-checks/`;
they are not independent verdicts or a live integration receipt.

Not run: frozen install (issued no-download instruction), `pnpm test:e2e` (dispatcher
defers localhost/browser/PG suites to GitHub CI), live providers/models, deploy,
restore success, production activation or professional/commercial approvals.
`pnpm eval` is inapplicable: no prompt/model/AI gateway or matching policy changed.

## Invariants, compatibility, operational changes and remaining gates

Touches AGENTS §§5.1, 5.2 (retained origin/capture identity), 5.4 (capture receipts
and atomicity), 5.7 (append-only hash chain), 5.8 (exact evidence version/hash/server
receive time), 5.9 (proposals only), 5.10 (no fees from capture), 5.13 and 5.14.
No fee entitlement, money posting, commercial send or provider effect added.

0100 is additive and transactionally rolls back on failure; existing origins and
variations are not rewritten. Existing legacy synthetic capture, pricing,
approval/rejection and final-account contracts stay available. Source-ID catch
inserts by ordinary runtime are intentionally refused; future SV-5 catch command
requires a bounded lock-aware authority path. New roles have no login, so Compose
needs no worker-login change. Forward fix is documented in MIGRATIONS.md: stop
application use first, retain facts/audit, append a reviewed corrective migration;
do not drop populated history or weaken probe protection.

No new external operational alert subsystem. CI must fail closed on catalog/grant
or immutable-history drift. Emergency access rows/reason hashes provide restricted
operational review evidence; selection of real holders and incident ownership are
G1 work, not approval inferred from this implementation.

**Unresolved instruction/test conflict (reported to integrator):** unchanged
`shared-money-origin.integration.test.ts` test “maps every raising command to
exactly one allowed origin…” inserts a **runtime** ConfirmJobGuardCatch origin
with **no source_signal_id**. Its positive assertion cannot coexist with the
issued source-required/probe-refusal rules. The builder asked for a narrow lane
amendment to update only that obsolete catch assertion, or direction to leave it
and record the conflict. No answer/amendment received; the prohibited SH-1 test
and 0053 remain untouched. CI will need that integrator resolution; this receipt
does not hide the expected assertion failure behind local setup errors.

**Discovered later — report to integrator, not edited into BUILD_PLAN:** builder
Withdraw command/route/screen remains missing by Q3's explicit scope. Existing
compiled Nest OpenAPI generator metadata for DecisionsController fails DI, while
source-loader OpenAPI comparison passes; a separate lane owns any repair. Existing
allocator performance tests time out locally without changes to their limits.

Remaining release/acceptance gates: D12, D13, G1, G4-S; approval of who may hold
emergency permission outside synthetic mode; actual PG fresh/upgrade/catalog and
browser regressions in CI; integrator resolution of the obsolete SH-1 catch
assertion; integrator ledger amendment and separate SV-4 test-split plan PR;
SV-4 positive reveal test / shared job-lock serialization; SV-5 lock-line binding;
independent Claude verdict on the dispatcher commit and separate technical
acceptance. Builder does not self-accept or release.

## Final handoff repetitions

- `pnpm build`: **0**, all 7 package tasks, final repository-source build (6m3.559s); no public route or web source changed.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **0**, final receipt-inclusive check; exactly 17 permitted changed files.
- Strict direct TypeScript check of the three new test files: **0**, including the added revocation/atomic failure and boundary assertions.
- Registration and malformed-input-only Vitest run: **0**, 2 passing assertions; these are deliberately non-database checks and do not establish PostgreSQL isolation.
- Intended commit message is `/private/tmp/jg-msg-sv-2.txt`. Dispatcher commits; no new head hash exists yet.
- Exact six-suite DB command repeated on the final SQL/test sources: **1**, same PG initialization error; 2 pure assertions passed / 33 DB assertions skipped. No assertion-level database result was observed.
- A read-only process diagnostic was also blocked: `zsh:1: operation not permitted: ps`; no process information or claim was used from it.
