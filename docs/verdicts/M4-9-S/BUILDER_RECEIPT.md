# M4-9-S builder receipt

Status: catch-only positive/zero source-backed posting is implemented in 0392–0393; PostgreSQL CI and exact-head RED review are pending. The full card, Q2/Q3 and UI remain incomplete. The 29 October section records the current slice; earlier boundary-only entries are historical. No independent verdict or acceptance is recorded.

## Session

- Builder: Codex, 24 October 2026; worktree `.worktrees/m4-9-s`.
- Branch: `codex/sandbox/m4-9-s`; inspected HEAD/ordered stack: `dc9dbfba3735dfdbedba43b160fe2609ed3abd6a` (contains PERSIST-A `2fc54428`). Dispatcher decision 74 explicitly permits this build ahead; no dependency merge is inferred.
- Order: `/Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-m4-9-s-20261013T172851.md`, read in full, plus BUILD_PLAN.md §§10.2.8, 10.3.1–10.3.5, 10.4 and AGENTS.md. C258 reserves migration 0218.
- Lane: `config/lanes/m4-9-s.json`, created as the first repository change. Legacy lane register untouched. No subagents or model verdict were fabricated.
- Actual runtime: Node `v24.17.0`; repository `.nvmrc` remains `24.15.0`. pnpm `10.28.1` via the existing cached wrapper `/private/tmp/jg-sv6-bin/pnpm`. Dependencies were already installed; no install command or pin update was made. This is not a clean pinned-install proof. An initial system `pnpm --version` launcher did not finish and was cancelled; all checks use the cached 10.28.1 runner.
- No shared-repository git write/add/checkout/commit/push, PostgreSQL startup or browser run was attempted. Existing tool tests use isolated temporary git fixtures. The standard OpenAPI wrapper attempted its IPC socket and was refused; the loader fallback binds none.
- All checks ran one at a time. Every direct Vitest run uses `--maxWorkers=2` and at most three files; Turbo uses `--concurrency=1`. Batch drivers check load before each batch; observed one-minute loads stayed below 20. No package/test check was run concurrently with a mutation.
- No final commit exists yet. Dispatcher commits and pushes after handoff; the exact final commit must then receive a different-model verdict, separate acceptance and founder merge/release. Builder does not accept its work.

## Dependency finding and implemented boundary

The ordered accepted storage stack does not supply a source-backed qualification seam. `packages/db/migrations/0213_recovery_attribution.sql` defines `app.assess_recovery_attribution` to always raise `RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND`. Its private append helper persists supplied documents, not source authority. `RecoveryAttributionRepository.assess` calls that closed entrypoint; PERSIST-B history is explicitly dependency-bound. Acceptance of storage does not turn its administrative test documents into approved qualifying allocations.

Built: strict versioned review/approval **intent** schemas and typed errors; reference Q/F/J/delta proposal calculation using the unchanged shared half-even kernel; arithmetic for F1–F23 (including F4b, ties, zero and negatives); one application and two server transports; checked SQL read/refusal entrypoints in 0218; actual-role access/upgrade/SQL-mutation tests authored for reviewer/CI; no UI.

GET returns a constant strict dependency status with no Q, F, count, manifest, history or statement. POST validates intent then refuses; it creates no review, approval, command identity, derivation, journal or audit. Next defers JSON reading until application access; Nest retains its normal pre-controller body parser. Scripted Nest handler execution is not real socket/HTTP/database proof. No source read can depend on hidden signals. No outward provider action exists.

The six business tables, source FKs, statement artifact/hash, approved Decision/action boundary, durable replay, source-event concurrency, positive/zero derivations, linked journals, audit/deferred validation, source drill-down and source races are DEPENDENCY-BOUND, not waived. The order requires actual accepted source/proof foreign keys and proof paths before building those facts. No guessed seam, administrative positive fixture, blanket zero Q or second allocator was substituted. This limitation is separate from Q2/Q3 and prevents calling the unheld server slice complete.

Q2 non-catch qualification authority, supplier-credit consumption and dependent positive database fixtures remain UNBUILT — HELD. Q3 reassessment/negative execution, actor/scheduler authority, linked compensation and downstream refund execution remain UNBUILT — HELD. UI/source-navigation/browser assertions remain UNBUILT — PARKED. No VAT, numbered statement, charging, provider rail, subscription, contractor fee or AI work was added.

## Migration, invariants and compatibility

0218 adds exactly `app.read_success_fee_v3(uuid,text)` and `app.write_success_fee_v3(uuid,text,jsonb,jsonb)`, both owned by `jobguard_migration`, SECURITY DEFINER, fixed `search_path=pg_catalog`; only runtime receives their exact EXECUTE grants. The writer independently uses the current checked-reader boundary even for direct SQL/repeated IDs, then raises dependency-bound. No arbitrary actor is supplied. The same persisted principal and genuine context flow through the existing authenticated practice boundary and `withTenant`.

No business table, column, row, backfill, policy, existing routine, existing grant, ledger kind, fingerprint, v1 fixture or v1 fee port changes. No FORCE RLS/table inventory entries are invented for nonexistent tables. LP-0 adds four exact ACL/owner entries, two recorded routine entries and additive recovery-money authority-path evidence; the existing LP-0 authority-path test consumes that same JSON. No separate `lp-0-authority-paths` JSON exists. SERIOUS-B5 adds the two exact routine identities only. Tenancy and contractor-entitlement expected table rows need no addition because 0218 creates no table; both remain unchanged. Existing freezes/exception dispositions remain intact.

The closed historical migration list is unchanged; existing directory discovery registers 0218. Shared registrations serialize with other lanes: core/db/workspace exports, watchdog registry, AppModule, workspace composition, OpenAPI, LP-0 inventory and SERIOUS-B5 snapshot. No business lock follows an audit-head lock: neither occurs in the refusal path. No network call enters its transaction.

Deploy 0218 before exposing the new route. Forward fix: disable the route and append a reviewed migration; never remove the dependency refusal as a substitute for source qualification, exact authorization and atomic posting. Preserve any future immutable financial history. No new operational alert is needed for this closed boundary; positive posting alerts/reconciliation remain unbuilt with their executor.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

The new upgrade test snapshots preceding catalogues, compares all preceding table values/types by named columns, applies 0218 alone, allows exactly its two routine overloads, then requires later passes twice. It is authored, NOT RUN. Administrative boundary fixtures create no qualifying source or fee and are explicitly labelled.

## Acceptance disposition (no inferred passes)

| ID | Disposition |
| --- | --- |
| SF-01 | Intent/proposal/status schema tests executed; exact statement artifact/result schemas remain dependency-bound. |
| SF-02 | Existing shared kernel reused; F4 exact rational reaches arithmetic unrounded. Persisted proof-to-Q consumption dependency-bound. No second allocator. |
| SF-03 | Q2 HELD; pure F10 arithmetic only. |
| SF-04 | Zero proposal arithmetic executed. Retained zero derivation/new approval and replay NOT BUILT — DEPENDENCY-BOUND. |
| SF-05 | Q2/Q3 HELD; pure −25,000p calculated, no negative execution. |
| SF-06 | Entire reference arithmetic matrix executed; unchanged SV-1 fixture suite executed. Accepted-source database coverage dependency-bound; non-catch/Q3 extensions held. |
| SF-07 | Strict intents reject offset/authority fields; outputs introduce none. No v3 J database aggregate exists. |
| SF-08–10 | Durable replay, source-event serialization, stale-source races NOT BUILT — DEPENDENCY-BOUND. Repeated requests only refuse, never claimed as replay. |
| SF-11–12 | No positive posting route exists. Exact approval, persisted proof and attribution-conjunct acceptance NOT BUILT — DEPENDENCY-BOUND. Generic refusal is not a positive-posting guard proof. |
| SF-13 | Earlier timing logic untouched; reference arithmetic includes equality/before-opening zero. Actual CH-7 database timing regressions owed in CI. |
| SF-14–15 | Local application mode/access/deferred-read tests executed. Actual role/session/job/track/policy access tests authored, NOT RUN. |
| SF-16–17 | Two narrow routine grants and catalogue additions authored. No new table DML surface. Actual SQL privilege/catalogue tests NOT RUN; financial table assertions remain dependency-bound. |
| SF-18–20 | Journal/deferred integrity, atomic audit/rollback, derivation/source persistence NOT BUILT — DEPENDENCY-BOUND; Q3 extensions HELD. Scripted refusal transaction rollback is not economic atomicity proof. |
| SF-21 | No source/hidden relation is queried by these routines. Actual PostgreSQL regression authored, NOT RUN. Completed authorized catch drill-down dependency-bound. |
| SF-22 | Existing v1 source/tests untouched; local source regressions executed. PostgreSQL v1 upgrade/fee/ledger suites owed. |
| SF-23 | Own-step upgrade test authored, NOT RUN. Migration discovery/order tests executed without PostgreSQL. |
| SF-24 | Shared server path, strict intent/no-store/errors, scripted Nest/Next tests executed. Source OpenAPI check passed via loader; standard wrapper fails sandbox IPC. No real HTTP/database persistence claim. |
| SF-25 | UI parked; no component/CSS/screen/browser fixture/test changed. All three V(...) clauses and source-navigation screen remain outstanding. |
| SF-26 | Exact-commit independent verdict, separate acceptance and founder merge/release outstanding. |

## Commands and results

All commands use `PATH=/private/tmp/jg-sv6-bin:$PATH` unless they are direct `node`/Python/read-only git. Logs and batch drivers are diagnostic scratch files in `/private/tmp`, not committed artifacts.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Exit 0, seven tasks. Final repeat after tests/implementation also exit 0. Latest Swagger response annotation additionally checked by final lint/build. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1 at inherited SV6-01/05/PERSIST-A/B paths outside this lane, before package checks; core purity passes. No lane relaxation. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same inherited stack paths. This is not green. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0, seven tasks before final annotation; final ordered-base root lint recorded below. |
| `pnpm build --concurrency=1` | First attempt exit 2: new unit test imported a fixture outside DB rootDir. Changed the test to use the existing genuine context constructor and removed three untracked emitted files. Next run exit 0, seven tasks. Final build recorded below. |
| Serial unit batches | Exit 0 in all 116 batches, 340 files, 6,444 tests passed, one explicitly filtered PostgreSQL/socket test skipped. Selection/commands/results below. Added one schema-only test subsequently passed in restored baseline; do not sum reruns as unique suite coverage. |
| `node --test --test-concurrency=1 tools/*.test.mjs` | Exit 0, 122 passed. Includes migration-order/lane tool tests, no PostgreSQL. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/success-fee-access.integration.test.ts test/success-fee-upgrade.integration.test.ts` | Exit 0; compiles new DB suites/helpers, does not execute PostgreSQL. |
| `node --import tsx src/generate-openapi.ts` (API cwd) | Exit 0; generated exactly one new path with GET/POST (194 additive lines). |
| `pnpm openapi:check` | Exit 1: `tsx` CLI IPC `listen EPERM`; no check pass claimed for wrapper. |
| `node --import tsx src/generate-openapi.ts --check` (API cwd) | Exit 0, same generator/check source, avoids CLI IPC. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/success-fee.http.test.ts src/auth/context-boundary.test.ts src/watchdog-registry.test.ts` | Exit 0, 3 files / 267 tests; after final Swagger changes. |

Root `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e` were NOT run: their PostgreSQL/socket/browser execution is assigned to reviewer/CI, and all standard mandatory suites remain owed. No test script or CI was weakened. `pnpm eval` is inapplicable: no prompt/model/parser/detector/matching/gateway change; fixture arithmetic is not live-model evidence.

The serial source selection uses the inspected prior storage-stack local selection, adds every new unit file and all current core/web unit files, and names at most three files per invocation. API database/socket files excluded locally: `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/practice-worker-switch.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/final-account-lock.isolation.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`. `src/recovery-attribution.http.test.ts` runs with `-t '^(?!.*PostgreSQL actual HTTP)'`, excluding its one real PostgreSQL/socket test. This is selected source-unit coverage, not full-root coverage.

### Every unit invocation (all exit 0)

From each package directory shown, run `pnpm exec vitest run --maxWorkers=2` with the exact arguments below. Logs: `/private/tmp/jg-m49-unit-<package>-<batch>.log`; driver `/private/tmp/jg-m49-units.py`; aggregate `/private/tmp/jg-m49-unit-summary.json`.


packages/core:

- `src/acceptance.test.ts src/activation-v3.test.ts src/activation.test.ts`
- `src/allocation.test.ts src/capture.test.ts src/commercial-integrity.test.ts`
- `src/contractor-billing-ordering.test.ts src/contractor-billing.test.ts src/contractor-entitlement-authority.test.ts`
- `src/contractor-parties.test.ts src/contractor-practice-session.test.ts src/contractor.test.ts`
- `src/cumulative-fee.test.ts src/customer-billing.test.ts src/decision-checks-later.test.ts`
- `src/decision-checks.test.ts src/discrepancy-audit-fix.test.ts src/discrepancy.test.ts`
- `src/enterprise-baseline.property.test.ts src/enterprise-baseline.test.ts src/enterprise-dashboard-billing.test.ts`
- `src/enterprise-dashboard.test.ts src/enterprise-domain/boundaries.test.ts src/enterprise-domain/duplicate-unlink-roles.test.ts`
- `src/enterprise-domain/fee-both.test.ts src/enterprise-domain/fee-pins.test.ts src/enterprise-domain/fee.test.ts`
- `src/enterprise-domain/later-explicit-refund.test.ts src/enterprise-domain/origin.test.ts src/enterprise-domain/transitions.test.ts`
- `src/enterprise-fee-statement.test.ts src/enterprise-live-prompt-contracts.test.ts src/enterprise-live-prompt-persistence.test.ts`
- `src/enterprise-live-prompts.test.ts src/enterprise-signal.test.ts src/evidence-pack.test.ts`
- `src/extra-approval.test.ts src/extra-client-approval.test.ts src/extra-evidence-pack.test.ts`
- `src/extra-origin.test.ts src/extra-persistence.test.ts src/extra-unlink.test.ts`
- `src/fee-statement.test.ts src/fee-what-if.test.ts src/fee.test.ts`
- `src/final-account-lock.test.ts src/final-account.test.ts src/free-first-job-keys.test.ts`
- `src/free-first-job-period.test.ts src/free-first-job.test.ts src/inbox-relevance.test.ts`
- `src/index.test.ts src/job-import.test.ts src/job-parties.test.ts`
- `src/job-sources.test.ts src/job-work-state.test.ts src/job.test.ts`
- `src/jobs-on-the-go-pricing.test.ts src/jobs-on-the-go.test.ts src/later-review-boundary.test.ts`
- `src/materials.test.ts src/mobile-auth.test.ts src/mobile-device-lifecycle.test.ts`
- `src/money.test.ts src/observation.test.ts src/offline-contract.properties.test.ts`
- `src/offline-contract.test.ts src/plan-entitlements.test.ts src/practice-facts.test.ts`
- `src/practice-feed.test.ts src/practice-supplier-credit.test.ts src/practice-worker-switch.test.ts`
- `src/prevention-checks.test.ts src/proof.test.ts src/purchase-order.test.ts`
- `src/quantity.test.ts src/quote-document.test.ts src/quote-rounding.test.ts`
- `src/quote.test.ts src/readiness.test.ts src/receipt-allocation.test.ts`
- `src/recovery-allocation.test.ts src/recovery-attribution-persistence.test.ts src/recovery-attribution-persistence.type.test.ts`
- `src/recovery-case-terms.test.ts src/recovery-case.test.ts src/recovery-eligibility-v3.test.ts`
- `src/recovery-eligibility.test.ts src/recovery-fee-illustration.test.ts src/recovery-fee-illustration.type.test.ts`
- `src/recovery-follow-up.test.ts src/recovery-message.test.ts src/recovery-payment-payer.test.ts`
- `src/recovery.test.ts src/review.test.ts src/shadow-detection.test.ts`
- `src/shadow-domain/architecture.test.ts src/shadow-domain/attribution.test.ts src/shadow-domain/capture.test.ts`
- `src/shadow-domain/eligibility.test.ts src/shadow-domain/evaluation.test.ts src/shadow-domain/lock.test.ts`
- `src/shadow-domain/must-surface.test.ts src/shadow-domain/signal.test.ts src/shadow-domain/success-fee.test.ts`
- `src/shadow-domain/type-contracts.test.ts src/site-extra-evidence.test.ts src/site-extra-pricing.test.ts`
- `src/site-extra-v2.test.ts src/site-extra.test.ts src/site-visit.test.ts`
- `src/sor-pricing.test.ts src/subscription-allocation.test.ts src/subscription-architecture.test.ts`
- `src/subscription-period.test.ts src/subscription-persistence.test.ts src/subscription-track-review.test.ts`
- `src/subscription.test.ts src/success-fee-posting-fixtures.test.ts src/success-fee-posting.test.ts`
- `src/supplier-documents.test.ts src/supplier-facts.test.ts src/supplier-matching.test.ts`
- `src/sync-download.test.ts src/tax.test.ts src/variation.test.ts`
- `src/watchdog.test.ts src/work-order.test.ts`

packages/config:

- `src/connector-environment.test.ts src/index.test.ts src/policy-gates.decision-identity.test.ts`
- `src/policy-gates.superseded-replay.test.ts`

packages/storage:

- `src/index.test.ts`

packages/ai:

- `src/capture-evaluation.test.ts src/capture.test.ts src/enterprise-ai-evaluation.test.ts`
- `src/enterprise-ai-prompts.test.ts src/enterprise-live-prompt-evaluation.test.ts src/enterprise-live-prompt-persisted-evaluation.test.ts`
- `src/gateway.test.ts src/later-capture-evaluation.test.ts src/later-gateway.test.ts`
- `src/later-shadow-evaluation.test.ts src/later-shadow-proposal.test.ts src/shadow-evaluation.test.ts`
- `src/shadow-proposal.test.ts src/sor-suggestion-evaluation.test.ts src/sor-suggestion.test.ts`

packages/db:

- `src/audit-checkpoint-handoff.test.ts src/audit-fix-dbsrc-08.test.ts src/decision-adoption.test.ts`
- `src/demo-seed.determinism.test.ts src/demo-seed.test.ts src/evidence-finalization-race.test.ts`
- `src/later-money-boundaries.test.ts src/later-outbox.test.ts src/later-sso-refusal.test.ts`
- `src/meter-persistence.test.ts src/meter-repository.test.ts src/migrate-discovery.test.ts`
- `src/northside-settings.test.ts src/outbox.test.ts src/practice-invoice-later.test.ts`
- `src/practice-invoice-repository.test.ts src/proof-replacement.test.ts src/recovery-allocation-serious-b9.test.ts`
- `src/recovery-attribution-repository.test.ts src/recovery-legacy-later.test.ts src/serious-b10.test.ts`
- `src/serious-b7.test.ts src/serious-b8.test.ts src/subscription-simulated-payment-adapter.test.ts`
- `src/success-fee-repository.test.ts src/supplier-match-repository.test.ts src/tenant-context.test.ts`

apps/api:

- `src/audit-export/audit-export.application.test.ts src/audit-export/audit-export.context.test.ts src/auth/auth.test.ts`
- `src/auth/context-boundary.test.ts src/auth/identity.test.ts src/auth/sso/later-sso-resource.test.ts`
- `src/auth/sso/linking.test.ts src/auth/sso/oidc.contracts.test.ts src/auth/sso/oidc.test.ts`
- `src/auth/sso/role-mapping.test.ts src/auth/sso/saml-fixlater-6.test.ts src/auth/sso/saml.test.ts`
- `src/auth/sso/scim-paths.test.ts src/auth/sso/scim.test.ts src/auth/sso/sso-emergency-owner.test.ts`
- `src/auth/sso/sso-emergency.test.ts src/auth/sso/sso-required-disclosure.test.ts src/auth/sso/sso-required-paths.test.ts`
- `src/auth/sso/sso-required-unlinked.test.ts src/auth/sso/sso-required.test.ts src/capture/capture-state.test.ts`
- `src/commercial-integrity.application.test.ts src/commercial-integrity.audit.test.ts src/contractor/billing.adapters.test.ts`
- `src/contractor/contractor-parties.application.test.ts src/contractor/contractor-parties.controller.test.ts src/contractor/contractor-parties.privacy.test.ts`
- `src/contractor/contractor-practice-session.application.test.ts src/contractor/contractor.application.test.ts src/contractor/contractor.projection.test.ts`
- `src/contractor/enterprise-baseline.application.test.ts src/contractor/enterprise-dashboard.application.test.ts src/contractor/enterprise-dashboard.boundaries.test.ts`
- `src/contractor/enterprise-fee.application.test.ts src/contractor/enterprise-fee.executor.test.ts src/contractor/enterprise-live-prompt-boundaries.test.ts`
- `src/contractor/enterprise-live-prompt.application.test.ts src/contractor/enterprise-live-prompt.http.test.ts src/contractor/full-demo-package-baseline.test.ts`
- `src/contractor/full-demo-package-sales.test.ts src/contractor/full-demo-package.application.test.ts src/contractor/offline-risk.application.test.ts`
- `src/contractor/practice-worker-switch.application.test.ts src/contractor/site-extra-evidence.application.test.ts src/contractor/site-extra-pricing.application.test.ts`
- `src/contractor/site-extra.application.test.ts src/contractor/site-visit.application.test.ts src/contractor/work-order.application.test.ts`
- `src/customer-receipt-input.amount-types.test.ts src/customer-receipt-input.command-identity.test.ts src/customer-receipt-input.fractions.test.ts`
- `src/customer-receipt-input.reversal-authority.test.ts src/customer-receipt-input.reversal-reason.test.ts src/customer-receipt-input.test.ts`
- `src/decisions/decisions-later.test.ts src/effects/policy-gates.test.ts src/evidence-pack.application.test.ts`
- `src/evidence-pack.controller.test.ts src/evidence-pack.errors.test.ts src/final-account-lock.application.test.ts`
- `src/final-account-lock.controller.test.ts src/final-account.application.test.ts src/free-first-job-card.adapter.test.ts`
- `src/free-first-job.application.test.ts src/health-database-independence.test.ts src/inbox-relevance.boundary-missing.test.ts`
- `src/inbox-relevance.session.test.ts src/job-parties.application.test.ts src/job-source.application.test.ts`
- `src/job-source.controller.test.ts src/job-work-state.application.test.ts src/job-work-state.controller.test.ts`
- `src/job-work-state.http.test.ts src/job-work-state.isolation.test.ts src/later-shadow-detection.worker.test.ts`
- `src/material.application.test.ts src/material.contracts.boundary.test.ts src/plan-entitlements.application.test.ts`
- `src/plan-entitlements.boundary.test.ts src/practice-errors.redaction.test.ts src/practice-facts.application.test.ts`
- `src/practice-facts.controller.test.ts src/practice-feed.application.test.ts src/practice-feed.controller.test.ts`
- `src/practice-session.test.ts src/practice-supplier-credit.application.test.ts src/practice-supplier-credit.http.test.ts`
- `src/practice-transports.test.ts src/prevention-check.application.test.ts src/proof/proof-adopted-original.test.ts`
- `src/proof/proof.application.test.ts src/quote/serious-b3-preview.test.ts src/readiness.later.test.ts`
- `src/readiness.payload-preservation.test.ts src/recovery-allocation.application.test.ts src/recovery-allocation.controller.test.ts`
- `src/recovery-allocation.credit.test.ts src/recovery-attribution.application.test.ts src/recovery-attribution.controller.test.ts`
- `src/recovery-attribution.http.test.ts src/recovery-case-terms.application.test.ts src/recovery-case.application.test.ts -t '^(?!.*PostgreSQL actual HTTP)'`
- `src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts src/recovery-eligibility-v3.application.test.ts`
- `src/recovery-follow-up.application.test.ts src/recovery-follow-up.controller.test.ts src/recovery-message.application.test.ts`
- `src/recovery-message.controller.test.ts src/recovery-message.errors.test.ts src/recovery-payment-payer.application.test.ts`
- `src/shadow-detection-lock-race.test.ts src/shadow-detection.worker.test.ts src/subscription-boundaries.test.ts`
- `src/subscription.application.test.ts src/success-fee.application.test.ts src/success-fee.http.test.ts`
- `src/value/value.application.test.ts src/variation/variation.application.test.ts src/watchdog-registry.test.ts`
- `src/watchdog.filter.privacy.test.ts src/workspace/fee-illustration-later.test.ts src/workspace/fee-illustration.application.test.ts`
- `src/workspace/workspace.service.test.ts`

apps/web:

- `app/admin/contractor/audit-exports/page.test.tsx app/admin/contractor/contractor-admin.test.tsx 'app/api/contractor/jobs/[id]/order-check/route.test.ts'`
- `'app/api/contractor/jobs/[id]/order-lines/route.test.ts' 'app/api/contractor/jobs/[id]/site-extras/route-v2.test.ts' 'app/api/contractor/jobs/[id]/site-extras/route.evidence.test.ts'`
- `'app/api/contractor/jobs/[id]/site-extras/route.test.ts' 'app/api/contractor/jobs/[id]/site-extras/sor/route.test.ts' 'app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts'`
- `'app/api/contractor/jobs/[id]/site-visits/start/route.test.ts' 'app/api/contractor/jobs/[id]/sor-items/route.test.ts' app/api/contractor/origin.test.ts`
- `app/api/contractor/practice/acting-as/end/route.test.ts app/api/contractor/practice/acting-as/route.test.ts app/api/contractor/practice/session/revoke/route.test.ts`
- `'app/api/contractor/practice/workers/[workerId]/acting-as/route.test.ts' app/api/contractor/route.test.ts app/api/contractor/site/jobs/route.test.ts`
- `'app/api/jobs/[id]/customer-messages/route.test.ts' 'app/api/jobs/[id]/diary/route.test.ts' 'app/api/jobs/[id]/success-fees/route.test.ts'`
- `app/api/northside/routes.test.ts app/lib/audit-pkg-lib-86.test.ts app/lib/invoice-payment-state.test.ts`
- `app/lib/receipt-http-error.test.ts app/lib/recovery-case-requests.test.ts app/lib/recovery-case-routes.test.ts`
- `app/lib/recovery-case-selection.test.ts app/lib/recovery-fee-note.test.ts app/page.test.tsx`
- `app/ui/job-parties-draft.test.ts app/ui/job-parties.test.tsx app/ui/materials-command.test.ts`
- `app/ui/practice-receipts-state.test.ts app/ui/purchase-order-state.test.ts app/ui/recovery-cases.behaviour.test.ts`
- `app/ui/recovery-cases.test.ts app/ui/recovery-eligibility-command.test.ts app/ui/recovery-messages.test.tsx`
- `app/ui/supplier-fact-editor.test.ts app/ui/workspace-lifecycle.test.ts`

## Guard mutation evidence

Local mutations change only newly created product files, one at a time, in a Python `try/finally` that restores original bytes. Each mutant uses `pnpm exec vitest run --maxWorkers=2 <one file>` from its package directory; every mutant failed assertions (exit 1), and every restored baseline passed (exit 0). These are deterministic mutation checks, not independent review or database guard execution.

Driver: `/private/tmp/jg-m49-mutations.py`; aggregate `/private/tmp/jg-m49-mutation-summary.json`; logs `/private/tmp/jg-m49-mutant-<name>.log`.

| Mutant | File | Exact test argument | Result |
| --- | --- | --- | --- |
| strict-authority-fields | `packages/core/src/success-fee-posting.ts` | `src/success-fee-posting.test.ts` | Killed, exit 1 |
| invalid-command-stop | `packages/core/src/success-fee-posting.ts` | `src/success-fee-posting.test.ts` | Killed, exit 1 |
| proposal-mode | `packages/core/src/success-fee-posting.ts` | `src/success-fee-posting.test.ts` | Killed, exit 1 |
| proposal-range | `packages/core/src/success-fee-posting.ts` | `src/success-fee-posting.test.ts` | Killed, exit 1 |
| fixed-rate | `packages/core/src/success-fee-posting.ts` | `src/success-fee-posting-fixtures.test.ts` | Killed, exit 1 |
| application-mode | `apps/api/src/success-fee.application.ts` | `src/success-fee.application.test.ts` | Killed, exit 1 |
| application-access | `apps/api/src/success-fee.application.ts` | `src/success-fee.application.test.ts` | Killed, exit 1 |
| query-and-tenant | `apps/api/src/success-fee.application.ts` | `src/success-fee.application.test.ts` | Killed, exit 1 |
| parse-before-access | `apps/api/src/success-fee.application.ts` | `src/success-fee.application.test.ts` | Killed, exit 1 |
| malformed-json | `apps/api/src/success-fee.application.ts` | `src/success-fee.application.test.ts` | Killed, exit 1 |
| repository-output-identity | `packages/db/src/success-fee-repository.ts` | `src/success-fee-repository.test.ts` | Killed, exit 1 |
| exact-db-error | `packages/db/src/success-fee-repository.ts` | `src/success-fee-repository.test.ts` | Killed, exit 1 |
| unexpected-sql-success | `packages/db/src/success-fee-repository.ts` | `src/success-fee-repository.test.ts` | Killed, exit 1 |
| next-mode | `apps/web/app/api/jobs/[id]/success-fees/route.ts` | `app/api/jobs/[id]/success-fees/route.test.ts` | Killed, exit 1 |
| next-deferred-json | `apps/web/app/api/jobs/[id]/success-fees/route.ts` | `app/api/jobs/[id]/success-fees/route.test.ts` | Killed, exit 1 |
| next-tenant-header | `apps/web/app/api/jobs/[id]/success-fees/route.ts` | `app/api/jobs/[id]/success-fees/route.test.ts` | Killed, exit 1 |
| next-no-store | `apps/web/app/api/jobs/[id]/success-fees/route.ts` | `app/api/jobs/[id]/success-fees/route.test.ts` | Killed, exit 1 |

Restored baselines, run sequentially with the same prefix: core `src/success-fee-posting.test.ts`; core `src/success-fee-posting-fixtures.test.ts`; db `src/success-fee-repository.test.ts`; api `src/success-fee.application.test.ts`; web `app/api/jobs/[id]/success-fees/route.test.ts`. All exit 0. Logs `/private/tmp/jg-m49-restored-*.log`.

SQL mutation tests are AUTHORED, NOT RUN: database predicate, tenant format, missing actor, owner role, revocation/expiry, owned digest, fee policy, track/environment and writer reauthentication. They use rollback-only function replacements and compare baseline/mutant behavior under the real runtime role. Missing/foreign context and resource tests remain mandatory. Every SQL guard's executed mutation verdict remains outstanding for reviewer/CI; no source inspection or TypeScript compilation is called a database mutation pass.

## Reviewer/CI work still owed

Run new `test/success-fee-access.integration.test.ts` and `test/success-fee-upgrade.integration.test.ts`, including SQL mutants, against PostgreSQL 16, and compile/run all mandatory suites with the ordered two-worker/three-file sequential batching. Verify actual catalogue/privileges/old rows/grants, fresh install, later passes twice and all regression suites. Unbuilt positive/race/rollback/source-persistence acceptance cannot be cleared by these closed-boundary tests.

Required predecessor regressions include M4-8-S allocation/line-allocation/races/upgrade suites; `fingerprinted-row-shape.integration.test.ts`, `ledger.integration.test.ts`, tenancy, SERIOUS-B5 and contractor-entitlement upgrades; `lp-0-grant-freeze.integration.test.ts` and `lp-0-authority-paths.integration.test.ts`; existing recovery/fee/eligibility timing suites; shadow catalogue/persistence/isolation. Actual dependency filenames inspected: `recovery-attribution.integration.test.ts`, `recovery-attribution-figures.integration.test.ts`, `recovery-attribution-access.integration.test.ts`, `recovery-attribution-replay.integration.test.ts`, `recovery-attribution-upgrade.integration.test.ts`; core `recovery-attribution-persistence.test.ts`, `recovery-fee-illustration.test.ts`, their type tests, API attribution application/controller/HTTP and DB attribution repository tests. CH-7 actual inspected filenames: `recovery-eligibility-v3.integration.test.ts`, `recovery-eligibility-v3-interest.test.ts` (included in local unit batches), and `recovery-insurer-money.integration.test.ts`. No separate F17 timing test filename was found.

No completion of full server/card acceptance, professional sign-off, independent verification or production permission is claimed.

## Final handoff evidence

- Final `pnpm exec turbo run lint --concurrency=1`: exit 0, all seven tasks (`/private/tmp/jg-m49-package-lint-final.log`). Final `pnpm build --concurrency=1`: exit 0, all seven tasks (`/private/tmp/jg-m49-build-final.log`); existing Next workspace-root/CSS and sandbox Turbo cache IO warnings only.
- `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs`: each exit 0, sequentially. Core purity passes via root lint.
- Final `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` and `LANE_BASE_REF=origin/main pnpm lint:lanes`: both exit 1, inherited SV-6 stack paths unchanged. The attempted ordered-base root lint (`LANE_BASE_REF=dc9dbfba3735dfdbedba43b160fe2609ed3abd6a`) also exits 1: official checker refuses a HEAD self-comparison as misleading. Neither official lane comparison is called green.
- Separate working-tree-only inspection `/private/tmp/jg-m49-working-tree-check.mjs`: exit 0, 29 changed/new paths all allowed by the existing lane checker’s `lanePathAllowed`; migration 0218 is strictly later than the ordered base. Existing LP-0 keys, group/freeze/target/hold records, recorded routines/RLS/policies/triggers and unrelated authority paths are preserved; exactly four keys and two routine records are added. OpenAPI differs only by the new `/jobs/{id}/success-fees` path. This is a deterministic structural check, not official lane acceptance or live catalogue evidence.
- Dedicated `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/migrate-discovery.test.ts`: exit 0, no PostgreSQL (`/private/tmp/jg-m49-migration-order.log`). Tools suite already exercised migration-order refusal cases.
- Final explicit DB fixture TypeScript command, identical to the earlier one: exit 0 after the added SQL mutation/lifecycle cases (`/private/tmp/jg-m49-db-fixture-typecheck-final.log`). No SQL test was executed locally. Post-live availability is deliberately allowed for invoiced/paid jobs retaining the v3 baseline; no new live-only billing policy was invented.
- `git diff --check`: exit 0. The separate working-tree check includes whitespace in untracked files.
- Intended conventional commit subject/body is written to `/private/tmp/jg-msg-m4-9-s.txt`. No shared repository commit or push was made. Dispatcher must commit, run CI/database/browser gates, obtain the exact-commit independent verdict, and arrange separate acceptance. This receipt is not that verdict.

The outstanding dependency work and Q2/Q3/UI holds above remain outstanding at handoff. Source-backed schema, review, authorization, positive/zero posting, compensation and their full assertions are not replaced by generic refusals or reference arithmetic.

## R1 — C250 repair round 1, 24 October 2026

Ordered base: `04fea7be`, branch `codex/sandbox/m4-9-s`. This section records the three repairs requested after `jg-runs/v5-m4-9-s-claude-A-04fea7be-20261024.md` (REPAIR). Earlier receipt entries are historical; this builder does not issue acceptance or an independent verdict.

- SF-14/15: the wrong-policy setup now disables only `app.job`'s `job_fixed_baseline` trigger before its administrative UPDATE, inside that case's BEGIN/ROLLBACK transaction. The runtime-role refusal assertion remains intact; ROLLBACK restores the trigger and fixture. Wrong-track/mode fixtures retain their existing rollback-only trigger overrides.
- SF-23: catalogue discovery partitions predecessor tables by actual primary-key presence. Only PK tables enter `proofBefore`/`proofDifferences`. Keyless tables retain PostgreSQL `row_to_json` text over all named pre-existing columns plus full column types; comparison consumes matching rows individually, preserving duplicate multiplicities. These comparisons run after 0218 alone and both later migration passes. Later additive rows/columns remain permitted, while missing/changed original rows or types fail.
- Money adversary: added Q = `149/10` p, J = 0, asserting exact Q preservation, F = 1 p and delta = 1 p. The intermediate-rounding mutant now FAILS: rounding Q to 15 p before applying 10% produces 2 p, rejected by the new assertion (exit 1, expected 1 p / received 2 p). Mutation was made only in `/private/tmp/jg-m49-r1-mutant-core`, a copied core source tree using existing dependencies; no workspace fee code was mutated. Command there: `pnpm exec vitest run --maxWorkers=2 src/success-fee-posting.test.ts -t 'rounds only after'`. Log: `/private/tmp/jg-m49-r1-mutant-intermediate-rounding.log`. This is a deterministic mutation check, not a model verdict.

Only the three test files and this receipt change. No fee implementation, migration, contract, provider, UI or production gate changes. The dependency, Q2/Q3 and UI holds above remain. PostgreSQL/database/browser suites are assigned to GitHub CI after dispatcher push because this sandbox cannot bind localhost/start PostgreSQL. Neither authored SQL nor compilation is claimed as executed database proof.

R1 validation uses the already-installed dependencies, Node `v24.17.0` and cached pnpm `10.28.1` via `PATH=/private/tmp/jg-sv6-bin:$PATH`; no install, git write, commit or push was attempted.

| Command | R1 result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Exit 0; seven tasks. Log `/private/tmp/jg-m49-r1-typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1; inherited SV6-01/05/PERSIST-A/B paths outside this lane stop root lint. Log `/private/tmp/jg-m49-r1-lint.log`. No lane rule changed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1; same inherited paths. Log `/private/tmp/jg-m49-r1-lanes.log`. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0; seven package checks. Log `/private/tmp/jg-m49-r1-package-lint.log`. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/success-fee-access.integration.test.ts test/success-fee-upgrade.integration.test.ts` | Final exit 0. Initial run exposed an implicit-any array in the new keyless comparison; explicit snapshot typing fixed it. Log `/private/tmp/jg-m49-r1-db-fixture-typecheck.log`. Compilation only. |
| `python3 /private/tmp/jg-m49-r1-units.py` | All 116 sequential batches exit 0: 340 files, 6,446 passed, one explicitly filtered PostgreSQL/socket test skipped. Uses the exact package/file selections listed earlier in this receipt, `pnpm exec vitest run --maxWorkers=2`, at most three files per invocation. Unchanged socket/database exclusions apply. Driver, summary and individual logs: `/private/tmp/jg-m49-r1-units.py`, `/private/tmp/jg-m49-r1-unit-summary.json`, `/private/tmp/jg-m49-r1-unit-<package>-<batch>.log`. The new fractional-Q baseline passes. |
| `node --test --test-concurrency=1 tools/*.test.mjs` | Exit 0; 122 passed. Log `/private/tmp/jg-m49-r1-tools.log`. |
| `pnpm build --concurrency=1` | Exit 0; seven tasks. Existing Next workspace-root/CSS and Turbo cache IO warnings only. Log `/private/tmp/jg-m49-r1-build.log`. |
| `pnpm openapi:check` | Exit 1; `tsx` launcher IPC socket `listen EPERM` in this sandbox. Log `/private/tmp/jg-m49-r1-openapi-wrapper.log`. |
| `node --import tsx src/generate-openapi.ts --check` (API cwd) | Exit 0; same generator/check through the socket-free loader. OpenAPI artifact unchanged. Log `/private/tmp/jg-m49-r1-openapi.log`. |
| `git diff --check` | Exit 0. Final path inspection confirms only the three ordered tests and this receipt changed. |

Handoff: intended conventional commit subject/body is in `/private/tmp/jg-msg-m4-9-s.txt`. Dispatcher owns commit/push and CI PostgreSQL/browser execution. R1 is ready for exact-commit independent re-review; no technical acceptance, new independent verdict or production permission is claimed here. The previous full-card dependency and release holds remain.


## 28 October 2026 — current-main catch-up (RED)

Plan piece: **M4-9-S, Derive and approve cumulative v3 success fees**, BUILD_PLAN.md
§10.4, finish-list row 8. Branch `codex/sandbox/m4-9-s`. Catch-up only; no new
behaviour and no claim that the full plan card's posting acceptance is complete.
The existing dependency-bound fee boundary remains closed.

Resolved AppModule and workspace composition by keeping both sides: success-fee
registration plus main's billing/subscription providers and current Final Check
handlers. Retained the union of serious-B5 routine identities, watchdog entries
and exports. Contractor-entitlement upgrade expectations are byte-identical to
current `origin/main`. Regenerated OpenAPI; a structural comparison confirms
that it equals main plus this lane's success-fee GET/POST path only.

Used `planRenumber` from `tools/migration-renumber.mjs` with the router's reserved
0302 slot, then filesystem rename/reference updates. The CLI's `--write` mode
requires a clean tree and runs `git add`, so it was not used in this read-only-git
sandbox. SQL SHA-256 before/after:
`1c8490a2ecb398311635e5a657fbc488b4091786b0780743618932f61a6f9611`.
All 129 main migrations are retained byte-for-byte; 0302 is the only additional
migration. No older attribution migration copy remains. Main's attribution
repository/fixture and receipt-allocation repository are unchanged. This lane
writes no attribution or allocation rows; its SQL writer reauthenticates and
unconditionally refuses. Conditions from #368, #356 and #346 therefore require
no writer fix in this catch-up. No migration, grant or test guarantee was weakened.

Validation used installed Node v24.17.0 and cached pnpm 10.28.1 through
`PATH=/private/tmp/jg-sv6-bin:$PATH`. No packages installed. The default pnpm
launcher stalled before task output and was stopped; all completed checks used
the cached pinned launcher. Vitest runs used at most two workers and three named
files per invocation:

- `pnpm exec turbo run build typecheck --filter=@jobguard/api... --concurrency=2`:
  PASS, 12 tasks (four cached), API and all dependencies; log
  `/tmp/m4-9-s-catchup-build.log`.
- `pnpm --filter @jobguard/web typecheck`: PASS;
  `/tmp/m4-9-s-catchup-web-typecheck.log`.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/success-fee-posting.test.ts src/success-fee-posting-fixtures.test.ts src/watchdog.test.ts`:
  PASS, 80 tests; `/tmp/m4-9-s-catchup-core.log`.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/success-fee.application.test.ts src/success-fee.http.test.ts`:
  PASS, 12 tests; `/tmp/m4-9-s-catchup-api.log`.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/success-fee-repository.test.ts`:
  PASS, four scripted repository tests (not PostgreSQL proof);
  `/tmp/m4-9-s-catchup-db-unit.log`.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/jobs/[id]/success-fees/route.test.ts'`:
  PASS, six tests; `/tmp/m4-9-s-catchup-web.log`.
- `node --import tsx src/generate-openapi.ts` then the same with `--check`
  (API cwd): PASS, no socket needed.
- `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`,
  `node tools/commercial-boundary-lint.mjs`: PASS. Core's existing computed-import
  notices remain reports only.
- Working-tree comparison against `origin/main`, using existing `loadLanePolicy`,
  `lanePathAllowed` and `migrationOrderViolations`: PASS; 29 exact PR paths
  (the lane file permits itself implicitly), no extra path or migration.
  This is a deterministic working-tree check, not committed-head CI acceptance.
- `git diff --check`: PASS.

Router handoff: commit/push/open PR, with **RED** and **M4-9-S** in its description.
GitHub CI must execute database, migration and browser suites; none ran locally.
The new exact head requires the independent RED review. No independent review,
merge, real customer data, provider activity, live money or release is claimed.
Git's index still reports the two resolved files as unmerged because no git-write
command was run; the router must stage the resolved content and migration rename.
Commit text: `/tmp/m4-9-s-20261028T175022Z-commit-msg.txt`.

## 28 October 2026 — PR #380 catch-up after #372 and #379 (RED)

Router scope: M4-9-S, branch `codex/sandbox/m4-9-s`, migration 0302;
prior RED pass reported by the router. This run is a catch-up only, with no new
behaviour or test-expectation changes beyond the union with merged main.
No new independent review is claimed by this builder.

Resolved the LP-0 and core-export conflicts by retaining both sides exactly.
Deterministic checks confirm LP-0 entries (1,366) and recorded routines (453)
are the exact deduplicated union of HEAD and origin/main. SERIOUS-B5 equals
main plus precisely the two 0302 routine identities. Contractor-entitlement
and tenancy expectations are byte-identical to main. Main's ENT-9C baseline
and MON-4A changes remain intact. No attribution/allocation writer changed.

Migration 0302 still matches HEAD byte-for-byte, SHA-256
`1c8490a2ecb398311635e5a657fbc488b4091786b0780743618932f61a6f9611`.
Every main migration is retained byte-for-byte. The existing lane file now
records this catch-up and lists exactly the 28 non-lane PR paths; its own path
is implicitly allowed by the repository lane policy (29 PR paths total).

Local checks, using installed dependencies and the cached pnpm 10.28.1 launcher
at `/private/tmp/jg-sv6-bin/pnpm`, Node v24.17.0:

- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/index.test.ts src/success-fee-posting.test.ts src/payment-fee-authority.test.ts`: PASS, 3 files / 73 tests.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-0-catalog.test.ts src/success-fee-repository.test.ts`: PASS, 2 files / 30 tests; comparator/scripted tests, not PostgreSQL proof.
- `pnpm --filter @jobguard/core typecheck`: PASS.
- `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/tenancy.integration.test.ts`: PASS; compilation only.
- Working-tree checks using `loadLanePolicy`, `lanePathAllowed` and `migrationOrderViolations`: PASS, all 29 PR paths permitted, exact allow list, migration order preserved.
- Exact union, preserved main migration bytes and absence of resolved-file conflict markers: PASS.
- `git diff --check`: PASS.

No PostgreSQL, browser, localhost listener, package download, provider activity,
real data, live money or release was attempted. Database/browser execution and
required CI remain with GitHub after router push. No git-writing command ran;
the index still holds unmerged entries until the router stages the resolved
files. Commit message: `/tmp/m4-9-s-20261028T184254Z-commit-msg.txt`.

## 28 October 2026 — PR #380 catch-up after #376 and #384 (RED)

M4-9-S catch-up only against origin/main `0a921c3eac5ae205708aee50fd7f31df049fd825`:
MON-1 day ledger 0300 and ENT-9 dashboards retained. Resolved the workspace
export conflict by keeping the success-fee export and both main dashboard/baseline
exports. No new behaviour or test-expectation changes beyond the union.
Prior RED pass is reported by the router; this builder claims no new review.

Deterministic source checks passed:

- LP-0 entries: exact deduplicated HEAD/main union, 1,370 entries. Recorded
  routines (456), RLS (257), policies (284), triggers (405): exact unions.
  Main authority paths remain exact except the existing M4-9-S recovery-money
  entry retained from HEAD.
- SERIOUS-B5: byte-identical to main after removing precisely the two existing
  0302 routine identities and their comment. Contractor-entitlement upgrade,
  contractor-entitlement authority and tenancy expectations match main bytes.
- Every migration from HEAD and main is retained byte-for-byte (132 each).
  Only 0302 is added relative to main; its SHA-256 remains
  `1c8490a2ecb398311635e5a657fbc488b4091786b0780743618932f61a6f9611`.
- Existing lane helpers confirm all 29 PR paths are permitted, the 28 non-lane
  paths exactly match the allow list, and migration order passes. The lane file
  implicitly permits itself. Resolved workspace file has no conflict markers.

Local checks with installed dependencies, cached pnpm 10.28.1 launcher
`/private/tmp/jg-sv6-bin/pnpm`, Node v24.17.0:

- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/success-fee.application.test.ts src/success-fee.http.test.ts`: PASS, 2 files / 12 tests.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-0-catalog.test.ts src/success-fee-repository.test.ts`: PASS, 2 files / 30 tests; comparator/scripted tests, not PostgreSQL proof.
- `pnpm --filter @jobguard/api typecheck`: PASS.
- `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/tenancy.integration.test.ts`: PASS, compilation only.
- `git diff --check`: PASS.

No git-writing command ran. The index still reports the resolved workspace file
as unmerged; the router must stage it to finish the existing merge, commit and
push PR #380. Database, migration and browser execution remain GitHub CI work.
No packages downloaded, PostgreSQL started, localhost listeners bound, real data,
provider activity, live money or release. Commit message:
`/tmp/m4-9-s-20261028T194935Z-commit-msg.txt`.

## 29 October 2026 — catch-only source-backed posting (RED)

Piece `m4-9-s-posting`, M4-9-S SF-04, SF-08–12 and SF-18–21.
This section supersedes historical dependency-bound descriptions **only for
synthetic catch positive/zero derivation, exact approval and posting**. The full
M4-9-S card, UI, Q2 and Q3 are not claimed complete. No independent review or
merge is claimed. Branch `codex/sandbox/m4-9-s-posting`, stacked on the issued
M4-8-S producer and SV-6 review branches; their merge is not inferred.

Implemented in reserved **0392–0393**:

- Six owner-only, FORCE RLS, append-only tables: command, review, derivation,
  source, journal and journal line. Exact assessment-subject and allocation FKs;
  one journal per derivation and one derivation per job revision/review.
- Current SV-6 `approve_review` Decision, approved resolution and exact
  authorization are required, with matching artifact, subject, policy, revision,
  actor, expiry and revocation checks. Reconstruct the latest assessment from
  stored sources; require matching hash, all ten true conjuncts and eligibility.
  M4-8-S v1 neutral receipt facts reach this path through its existing immutable
  case consumer. No new allocator or supplied qualification/money exists.
- Exact cumulative Q -> existing SQL half-even kernel -> F minus actual posted J.
  Repository validation independently recomputes through the existing core kernel.
  F13 Q £800 -> £80; no cap, subscription offset or fee VAT policy is introduced.
- Saved statement/hash approval creates an exact fee authorization bound to
  action, synthetic ledger recipient, GBP delta, revision, policy and expiry.
  A zero delta retains its derivation/sources/approval and creates no journal.
  Positive journals contain paired receivable/income lines. Deferred guards reject
  incomplete source/authorization/derivation and unbalanced or spurious journals.
- Durable command replay reauthenticates current session/owner/job and returns
  the original result with `replayed: true`. Changed payloads conflict. Shared
  case/receipt/job locks serialize posting and reject stale competing approvals.
  Statement/source/authorization/journal/command/audit writes are atomic.
- Availability reads remain independent of hidden facts before lock. Post-lock
  availability is constant `catch_review_available`; review results provide exact
  assessment hashes, source allocation IDs and review authorization references.
  Both transports keep no-store and existing access controls; bounded new
  source/review/stale/identity errors return 409. OpenAPI regenerated and checked.
- LP-0 recorded routines/policies/triggers, SERIOUS-B5, entitlement upgrade and
  tenancy expectations were extended with the exact installed objects. The two
  existing public routine grants remain; no runtime table or helper grant added.

Source-race trade-off: this synthetic writer first serializes authorization
writes, then takes SHARE table locks over mutable/appendable qualification
sources before business locks. This excludes phantom refund/credit, feed,
evidence-invalidation, disclosure and source-review changes as well as updates.
It is deliberately coarse, uses no new trigger-dispatch framework, and is not a
production throughput design. A contending source writer can deadlock; the fee
transaction rolls back and reports `SUCCESS_FEE_SOURCE_CHANGED`, requiring a new
review. Audit is last, with no subsequent business lock acquisition.

**Q2/Q3 boundary:** non-catch-only source sets still refuse with
`SUCCESS_FEE_DEPENDENCY_BOUND`. Unsupported negative/reassessment commands retain
`INVALID_SUCCESS_FEE_COMMAND`; a negative derived delta remains dependency-bound.
Refunds/credits or invalidation after review refuse new posting; historical replay
remains historical. Journals link their derivation and a negative journal's schema
requires an original journal reference, but **linked compensation execution and
its positive reversal acceptance test are not implemented**, because the issued
brief explicitly keeps Q3 negative execution refusing. No old journal is edited.
That held acceptance cannot be counted as passed by the immutable-history tests.

Adversarial PostgreSQL tests authored for CI cover: required SV-6 approval,
unallocated sources, unsettled feed facts, allocation overrun, locked-bill
substitution, tampered statement, competing approvals, durable concurrent replay,
zero derivation, refund/credit/invalidation staleness, a lock-observed concurrent
invalidation, another tenant/session, audit rollback/retry, direct runtime access,
immutable journals and a deferred malformed-journal refusal. Populated upgrade
coverage preserves the real v1 receipt chain, replays predecessor commands and
posts/replays after repeat migrate. **None of these PostgreSQL tests ran locally.**

Local validation (Node v24.17.0; installed dependencies only):

- Core: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/success-fee-catch-posting.test.ts src/success-fee-posting.test.ts src/success-fee-posting-fixtures.test.ts`
  in `packages/core`: PASS, 3 files / 79 tests.
- DB units: same runner, `src/success-fee-repository.test.ts test/lp-0-catalog.test.ts src/migrate-discovery.test.ts`
  in `packages/db`: PASS, 3 files / 39 tests. Scripted repository/catalogue tests
  and filesystem discovery only; not database execution.
- API: same runner, `src/success-fee.application.test.ts src/success-fee.http.test.ts`
  in `apps/api`: PASS, 2 files / 16 tests. Handler/OpenAPI tests; no listening HTTP.
- Web: same runner, `'app/api/jobs/[id]/success-fees/route.test.ts'` in
  `apps/web`: PASS, 1 file / 6 tests. Mocked transport, not a browser journey.
- Existing TypeScript compiler: `./node_modules/.bin/tsc -p <package>/tsconfig.json`
  compiled core, storage, config, AI and DB, and transpiled API. API/core/DB
  `--noEmit` checks passed. This does not claim the Nest production build or a
  clean pinned install. No AI source or prompt changed.
- Explicit strict NodeNext `tsc --noEmit` compilation passed for both new database
  suites and affected success-fee access, SERIOUS-B5, entitlement and tenancy
  integration suites. Compilation is not a PostgreSQL run.
- `node --import tsx src/generate-openapi.ts` and `--check` in `apps/api`: PASS.
- Core purity, money-arithmetic and commercial-boundary lint scripts: PASS.
  Existing computed-import notices are reports only.

The system pnpm launcher stalled before task output and was stopped. The old
`/private/tmp/jg-sv6-bin/pnpm` helper does not exist in this environment. All
completed checks above use the installed repository compiler/test executables;
no package was downloaded and no lockfile/runtime pin changed. An initial DB
unit invocation lacked the unbuilt storage package; after compiling existing
workspace dependencies the complete named group passed.

LATER / SIMPLICITY (initial source review):
`packages/db/migrations/0393_success_fee_catch_posting.sql` and SV-6's approved
review guard repeat some exact-review predicates. In a separately scoped follow-up,
a private shared validator could retain one authoritative set of these checks;
maintenance benefit is fewer opportunities for the two consumers to drift.
This is advisory and does not weaken or block any current guard or review.

Router handoff: commit/push/PR and GitHub PostgreSQL/migration/browser/required CI,
then one fresh exact-head Claude RED review. The reserved migration numbers are
above observed origin/main's 0375. The stacked producer branch already contains
unmerged 0401; if that lands first, re-reserve/renumber this pair before merging
so the migration-order gate remains true. Do not edit 0401 or any merged SQL.
No git-writing command, database startup, localhost listener, provider call,
real customer data, live money, deployment or release was attempted.

Final deterministic handoff checks: exact 22-path lane (21 explicit non-lane paths),
0392/0393 above observed origin/main 0375, no tracked migration changed, and
`git diff --check`: PASS. These compare the working tree, not a committed PR head.
Commit message: `/tmp/m4-9-s-posting-20261029T154217Z-commit-msg.txt`.
