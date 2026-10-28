# M4-10-S builder receipt

Status: independent pure representation built; full server portion and complete plan card INCOMPLETE. This is not a completed money-chain issuance piece. No technical acceptance or independent model verdict is claimed.

## Session

- Builder: Codex, 24 October 2026, worktree `.worktrees/m4-10-s`; branch `codex/sandbox/m4-10-s`.
- Actual HEAD/base: `04fea7be692d9ea254a6ff62238cc68c43663adb` (M4-9-S, in review), stacked on accepted SV-6 storage stack `dc9dbfba3735dfdbedba43b160fe2609ed3abd6a`. Inspected `origin/main`: `4b1a779008505c86ca85db78fb38eda412394fe4`. Decision 74 authorizes this preparatory stack; it does not assert a dependency merge or release Q1/Q2.
- Full order read: `/Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-m4-10-s-20261013T172832.md`; AGENTS.md and BUILD_PLAN.md §§10.2.8, 10.3.1–10.3.3, M4-9-S/M4-10-S cards, namespace and persistence contracts inspected. AGENTS.md/BUILD_PLAN.md match inspected origin/main. D01/D02 remain proposed.
- C259 reserves 0219. It replaces the draft's migration placeholder, but no migration is created/registered because Q2 explicitly holds persistence. No 0080/0086 migration allocated.
- First repository edit: `config/lanes/m4-10-s.json`. It grants only the independent core/contract/receipt paths. The legacy lane register is untouched. No existing merged test, fingerprint, policy, privilege or catalogue freeze is edited.
- Runtime: Node `v24.17.0`, versus repository `.nvmrc` `24.15.0`; pnpm `10.28.1` from the existing cached wrapper `/private/tmp/jg-sv6-bin/pnpm`. No install, download or pin change. This is not a clean pinned-install proof.
- No git write/add/checkout/commit/push, PostgreSQL startup, browser run, live provider, deployment or customer data. Unit/tool tests may create their own isolated temporary fixtures. Dispatcher commits/pushes after exit; intended message is `/private/tmp/jg-msg-m4-10-s.txt`.
- Heavy checks run sequentially; direct Vitest uses `--maxWorkers=2` with at most three named files. Turbo uses `--concurrency=1`; batch driver waits if one-minute load exceeds 20. Observed load readings stayed below 20.
- No final commit exists during this session. A different model must review the exact dispatcher-created commit, and a separate actor must accept it. Source inspection and deterministic executed tests below are not independent verification.

## Implemented and inspected

Built only the order's independent pure portion: strict versioned representation schema, typed error, supplied Money/exact-Q validation, signed principal/history, required labels, explicit unavailable settlement integration, canonical JSON/UTF-8 bytes and separate SHA-256 metadata. `packages/core/src/index.ts` adds one export. Contract: `docs/contracts/simulation-fee-statement-v1.md`.

Synthetic object fixtures represent Q £2,820, F £282 and documentary posting principals £32/£250; a separate representation has −£250 document principal, £32 cumulative principal and original-document hash/identity. They are neither genuine allocator/posting journeys nor database fixtures. There is no second allocator or fee formula: validation reuses `money`, `exactPenceV1`/`parseExactPence`; formatting reuses portable `sha256`. Web Crypto independently checks output digest in tests. Formatting preserves supplied F even where deliberately inconsistent reference Q/F inputs demonstrate that it does not decide entitlement.

Inspected prerequisite reality: `0218_success_fee_v3.sql` contains authenticated read/refusal entrypoints only; write always raises `SUCCESS_FEE_DEPENDENCY_BOUND`. It supplies no persisted derivation/journal/approval artifact. `0213_recovery_attribution.sql` assessment raises `RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND`. Source-backed fee persistence remains DEPENDENCY-BOUND on M4-9-S/SV-6/SV-5, not proved by stack presence or administrative storage documents.

Namespace inspection: `0195_subscription_persistence.sql` already creates `app.platform_statement` and `app.platform_statement_line` with subscription-only period/namespace/amount constraints. Future fee persistence must consume/reconcile the landed namespace under Q3/Q7, preserve subscription history and tests, and coordinate prefixes/sequence/correction numbering. This lane creates no second namespace and makes no namespace policy decision.

No new database table/routine, provider path or mutation exists. LP-0, lp-0-authority-paths, tenancy, serious-b5 and contractor-entitlement catalogues remain byte-for-byte unchanged from the ordered base; no exact additive rows are applicable to a pure formatter. No existing grants, RLS, fingerprinted shapes, authentication boundaries, v1 fee implementation, allocation paths, worker ownership or API operations change. There are no data migrations, external actions, operational alerts or backward compatibility changes to existing interfaces.

## Acceptance disposition

| IDs | Evidence / remaining obligation |
| --- | --- |
| FS-01 | Pure strict document fields, versions, UUID/hash syntax, Money/rational limits and signed principal tests executed. Issuance/correction commands and approval/source authority held under Q2. |
| FS-03 | Pure artifact exact warning, VAT and sandbox labels; prohibited fields rejected. Database/API assertions held. |
| FS-06 | Pure formatting preserves inputs, has no persistence/posting/payment/provider capability. Database count, saved-read and transport assertions held. |
| FS-07 | Canonical UTF-8 bytes, independent SHA-256 comparison, preserved exact fractions/inputs and deterministic formatting tested. Saved downloads/immutability/route proof held. |
| FS-18 | Explicit unavailable integration, strict rejection of paid/collected/outstanding/refund claims tested. API and authoritative fee-settlement integration held for Q2/M4-12-S. |
| FS-22 | Builder receipt only. Independent exact-commit review, separate acceptance, full server and whole-card acceptance outstanding. |
| FS-02/04/05/08–17/19–21 | Entire task-specific criteria unbuilt under Q2; existing regression checks remain required. Pure correction formatting is not an FS-08 persistence or compensation pass. |

## Holds

- Q1: successive positive statements, lineage/supersession/supplementation and collectible balances.
- Q2: exact approved artifact, source/approval interfaces, command lifecycle, issuance/correction persistence, replay, numbering, source bindings, audit, database fixtures/suites, API/Nest/Next adapters and saved delivery. No provisional approval/source schemas or fail-closed substitute routes built.
- DEPENDENCY-BOUND: actual M4-9-S/SV-6/SV-5 source-backed proof/qualification and immutable derivation/journal/approval contracts; merge acceptance must not be inferred from this stack.
- Non-catch qualification authority, supplier-credit consumption and negative-compensation execution remain unbuilt. A negative in-memory principal does not create compensation, credit/refund work or ledger facts.
- Q4/M4-12-S: authoritative fee settlement history; customer receipts/subscription/v1 payments are not substituted. No zero-paid, cash-outstanding or refund-due claim.
- Q8: screens, source panels, navigation and browser/download interactions remain parked. Whole plan row stays open.
- Q3/Q7: shared namespace reconciliation and dispatcher numbering coordination before any future persistence; C259's 0219 reservation alone releases none of Q2.
- Independent exact-commit verdict, separate acceptance, complete mandatory CI database/browser suites, pinned-install proof and all production/commercial/tax release gates remain owed.

## Commands and results

All pnpm commands below use `PATH=/private/tmp/jg-sv6-bin:$PATH`. Detailed logs and diagnostic scripts in `/private/tmp` are local scratch evidence, not committed artifacts or independent verification.

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/simulation-fee-statement.test.ts` | Red first (module absent); green after implementation. Final restored baseline: 52 passed. Logs `jg-m410-red.log`, `jg-m410-restored.log`. |
| `pnpm typecheck --concurrency=1` | Final exit 0, seven tasks. First launcher attempt was cancelled; initial completed run exposed test-only Node type imports, fixed by using portable Web Crypto/TextEncoder. Log `jg-m410-typecheck-final.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1 at inherited stack paths outside this task lane, before package checks. No lane widening. Log `jg-m410-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, inherited M4-9-S/SV-6/storage stack paths. Log `jg-m410-lanes.log`. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0, seven package tasks. Log `jg-m410-package-lint.log`. |
| `pnpm build --concurrency=1` | Exit 0, seven tasks including Next production build. Logs `jg-m410-build.log` and final rerun `jg-m410-build-final.log`. |
| Serial unit batches, each `pnpm exec vitest run --maxWorkers=2 <up to three files>` in its package | Final 116 batches / 341 files: 6,497 passed, one PostgreSQL/socket test explicitly skipped. Initial attempt stopped at missing built workspace exports, then build supplied them and the entire selection reran. Logs `jg-m410-unit-<package>-<batch>.log`; driver `jg-m410-units.py`; summary `jg-m410-unit-summary.json`. |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC socket `listen EPERM`. No wrapper pass claimed. Log `jg-m410-openapi.log`. |
| `node --import tsx src/generate-openapi.ts --check` (API cwd) | Exit 0; same generator/check source without the CLI IPC server. No OpenAPI changes. Log `jg-m410-openapi-loader.log`. |
| `node --test --test-concurrency=1 tools/*.test.mjs` | Exit 0, 122 passed, including migration-order/lane comparator tests without PostgreSQL. Log `jg-m410-tools.log`. |

Root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e` were NOT run. Their database/socket/browser obligations remain for reviewer/GitHub CI after dispatcher push. No scripts, required CI checks, existing tests or exclusions were edited. No AI/model/prompt/extraction/matching/gateway change; live-model eval is inapplicable.

The final source-unit selection preserves the prior M4-9-S selection, adds this task's file, and enumerates all current core and web unit files. API exclusions: `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/practice-worker-switch.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/final-account-lock.isolation.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`. The batch containing `src/recovery-attribution.http.test.ts` also uses `-t '^(?!.*PostgreSQL actual HTTP)'`, filtering its one real PostgreSQL/socket test. This is selected source-unit coverage, not full-root coverage or live integration evidence.

## Guard mutation evidence

Driver `/private/tmp/jg-m410-mutations.py` changed only the new implementation file, one mutant at a time, restoring original bytes in `finally`. Each mutant ran the new core test file with `--maxWorkers=2`. All 27 exited 1 with assertion failures, not compilation/import errors. Restored baseline exited 0 (52 tests). Summary: `/private/tmp/jg-m410-mutation-summary.json`; logs `/private/tmp/jg-m410-mutant-<name>.log`. These are deterministic checks, not independent model review. Existing shared Money/rational validator implementations were not modified.

| Mutant | Result |
| --- | --- |
| `money-validation` | Assertion-killed, exit 1 |
| `nonnegative-F` | Assertion-killed, exit 1 |
| `Q-range-and-sign` | Assertion-killed, exit 1 |
| `currency` | Assertion-killed, exit 1 |
| `uuid-syntax` | Assertion-killed, exit 1 |
| `version` | Assertion-killed, exit 1 |
| `synthetic-mode` | Assertion-killed, exit 1 |
| `policy` | Assertion-killed, exit 1 |
| `settlement-unavailable` | Assertion-killed, exit 1 |
| `settlement-owner` | Assertion-killed, exit 1 |
| `warning` | Assertion-killed, exit 1 |
| `VAT-label` | Assertion-killed, exit 1 |
| `sandbox-label` | Assertion-killed, exit 1 |
| `number-required` | Assertion-killed, exit 1 |
| `number-bound` | Assertion-killed, exit 1 |
| `history-bound` | Assertion-killed, exit 1 |
| `hash-syntax` | Assertion-killed, exit 1 |
| `strict-object-1` | Assertion-killed, exit 1 |
| `strict-object-2` | Assertion-killed, exit 1 |
| `strict-object-3` | Assertion-killed, exit 1 |
| `strict-object-4` | Assertion-killed, exit 1 |
| `strict-object-5` | Assertion-killed, exit 1 |
| `invalid-refusal` | Assertion-killed, exit 1 |
| `canonical-key-order` | Assertion-killed, exit 1 |
| `history-order` | Assertion-killed, exit 1 |
| `hash-bytes` | Assertion-killed, exit 1 |
| `byte-length` | Assertion-killed, exit 1 |

`strict-object-1` through `strict-object-5` remove strictness respectively from Money, posting entry, original reference, unavailable-settlement object and the whole document. Money tests cover unsafe/fractional/out-of-range signed amounts; Q tests cover negative/bad/zero denominators, malformed numerators, magnitude and digit bounds. Literal mutations cover every fixed version/environment/policy/label/settlement value. Bounds cover number presence/length and history size. UUID/hash syntax, typed refusal, canonical ordering, history order, UTF-8 byte length and hash-byte binding are independently mutation-checked.

## Exact executed unit batches

Every row below names the files for one sequential `pnpm exec vitest run --maxWorkers=2` command in that package; all exited 0. Only the noted attribution batch adds the explicit PostgreSQL filter above. Repeated baseline/mutation tests are not added to the unique suite count.

### core

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
- `src/shadow-domain/type-contracts.test.ts src/simulation-fee-statement.test.ts src/site-extra-evidence.test.ts`
- `src/site-extra-pricing.test.ts src/site-extra-v2.test.ts src/site-extra.test.ts`
- `src/site-visit.test.ts src/sor-pricing.test.ts src/subscription-allocation.test.ts`
- `src/subscription-architecture.test.ts src/subscription-period.test.ts src/subscription-persistence.test.ts`
- `src/subscription-track-review.test.ts src/subscription.test.ts src/success-fee-posting-fixtures.test.ts`
- `src/success-fee-posting.test.ts src/supplier-documents.test.ts src/supplier-facts.test.ts`
- `src/supplier-matching.test.ts src/sync-download.test.ts src/tax.test.ts`
- `src/variation.test.ts src/watchdog.test.ts src/work-order.test.ts`

### config

- `src/connector-environment.test.ts src/index.test.ts src/policy-gates.decision-identity.test.ts`
- `src/policy-gates.superseded-replay.test.ts`

### storage

- `src/index.test.ts`

### ai

- `src/capture-evaluation.test.ts src/capture.test.ts src/enterprise-ai-evaluation.test.ts`
- `src/enterprise-ai-prompts.test.ts src/enterprise-live-prompt-evaluation.test.ts src/enterprise-live-prompt-persisted-evaluation.test.ts`
- `src/gateway.test.ts src/later-capture-evaluation.test.ts src/later-gateway.test.ts`
- `src/later-shadow-evaluation.test.ts src/later-shadow-proposal.test.ts src/shadow-evaluation.test.ts`
- `src/shadow-proposal.test.ts src/sor-suggestion-evaluation.test.ts src/sor-suggestion.test.ts`

### db

- `src/audit-checkpoint-handoff.test.ts src/audit-fix-dbsrc-08.test.ts src/decision-adoption.test.ts`
- `src/demo-seed.determinism.test.ts src/demo-seed.test.ts src/evidence-finalization-race.test.ts`
- `src/later-money-boundaries.test.ts src/later-outbox.test.ts src/later-sso-refusal.test.ts`
- `src/meter-persistence.test.ts src/meter-repository.test.ts src/migrate-discovery.test.ts`
- `src/northside-settings.test.ts src/outbox.test.ts src/practice-invoice-later.test.ts`
- `src/practice-invoice-repository.test.ts src/proof-replacement.test.ts src/recovery-allocation-serious-b9.test.ts`
- `src/recovery-attribution-repository.test.ts src/recovery-legacy-later.test.ts src/serious-b10.test.ts`
- `src/serious-b7.test.ts src/serious-b8.test.ts src/subscription-simulated-payment-adapter.test.ts`
- `src/success-fee-repository.test.ts src/supplier-match-repository.test.ts src/tenant-context.test.ts`

### api

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
- `src/recovery-attribution.http.test.ts src/recovery-case-terms.application.test.ts src/recovery-case.application.test.ts`
- `src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts src/recovery-eligibility-v3.application.test.ts`
- `src/recovery-follow-up.application.test.ts src/recovery-follow-up.controller.test.ts src/recovery-message.application.test.ts`
- `src/recovery-message.controller.test.ts src/recovery-message.errors.test.ts src/recovery-payment-payer.application.test.ts`
- `src/shadow-detection-lock-race.test.ts src/shadow-detection.worker.test.ts src/subscription-boundaries.test.ts`
- `src/subscription.application.test.ts src/success-fee.application.test.ts src/success-fee.http.test.ts`
- `src/value/value.application.test.ts src/variation/variation.application.test.ts src/watchdog-registry.test.ts`
- `src/watchdog.filter.privacy.test.ts src/workspace/fee-illustration-later.test.ts src/workspace/fee-illustration.application.test.ts`
- `src/workspace/workspace.service.test.ts`

### web

- `app/admin/contractor/audit-exports/page.test.tsx app/admin/contractor/contractor-admin.test.tsx app/api/contractor/jobs/[id]/order-check/route.test.ts`
- `app/api/contractor/jobs/[id]/order-lines/route.test.ts app/api/contractor/jobs/[id]/site-extras/route-v2.test.ts app/api/contractor/jobs/[id]/site-extras/route.evidence.test.ts`
- `app/api/contractor/jobs/[id]/site-extras/route.test.ts app/api/contractor/jobs/[id]/site-extras/sor/route.test.ts app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts`
- `app/api/contractor/jobs/[id]/site-visits/start/route.test.ts app/api/contractor/jobs/[id]/sor-items/route.test.ts app/api/contractor/origin.test.ts`
- `app/api/contractor/practice/acting-as/end/route.test.ts app/api/contractor/practice/acting-as/route.test.ts app/api/contractor/practice/session/revoke/route.test.ts`
- `app/api/contractor/practice/workers/[workerId]/acting-as/route.test.ts app/api/contractor/route.test.ts app/api/contractor/site/jobs/route.test.ts`
- `app/api/jobs/[id]/customer-messages/route.test.ts app/api/jobs/[id]/diary/route.test.ts app/api/jobs/[id]/success-fees/route.test.ts`
- `app/api/northside/routes.test.ts app/lib/audit-pkg-lib-86.test.ts app/lib/invoice-payment-state.test.ts`
- `app/lib/receipt-http-error.test.ts app/lib/recovery-case-requests.test.ts app/lib/recovery-case-routes.test.ts`
- `app/lib/recovery-case-selection.test.ts app/lib/recovery-fee-note.test.ts app/page.test.tsx`
- `app/ui/job-parties-draft.test.ts app/ui/job-parties.test.tsx app/ui/materials-command.test.ts`
- `app/ui/practice-receipts-state.test.ts app/ui/purchase-order-state.test.ts app/ui/recovery-cases.behaviour.test.ts`
- `app/ui/recovery-cases.test.ts app/ui/recovery-eligibility-command.test.ts app/ui/recovery-messages.test.tsx`
- `app/ui/supplier-fact-editor.test.ts app/ui/workspace-lifecycle.test.ts`

## Final preservation check

`node /private/tmp/jg-m410-working-tree-check.mjs` exited 0: exactly six own-lane working-tree paths, precisely one additive core export, no migration or existing catalogue/test/auth/API changes, and no malformed whitespace. `git diff --check` exited 0. This custom delta check is labelled separately from the failing official origin/main stack-lane check; it neither overrides that failure nor proves PostgreSQL behavior. Final `pnpm typecheck --concurrency=1` and `pnpm build --concurrency=1` both exited 0 with seven successful tasks. Intended conventional commit subject/body saved to `/private/tmp/jg-msg-m4-10-s.txt`; dispatcher owns commit/push and subsequent review routing.


## 28 October 2026 — current-main catch-up only (RED)

Reconciled the in-progress main merge on `codex/sandbox/m4-10-s` without
new behaviour. Unioned core/workspace exports and LP-0 entries/routine facts.
Every main LP-0 entry and routine fact is unchanged; the only additions are
M4-9-S's two exact routine identities and four ownership/EXECUTE entries.
Contractor-entitlement and tenancy expectations match main byte-for-byte.
SERIOUS-B5 matches main plus precisely the two inherited success-fee routines.
All 133 main migration files match main byte-for-byte. Inherited
`0302_success_fee_v3.sql` matches pre-merge HEAD, SHA-256
`1c8490a2ecb398311635e5a657fbc488b4091786b0780743618932f61a6f9611`.
No new migration, renumbering, SQL edit or product implementation.
Updated this piece's existing lane with exact conflict-resolution paths;
the lane's own file is implicitly authorized by the lane validator.

Local validation (cached pnpm 10.28.1 via `/private/tmp/jg-sv6-bin`,
installed Vitest 4.1.12; each Vitest run uses `--maxWorkers=2`):

- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/simulation-fee-statement.test.ts src/success-fee-posting.test.ts src/success-fee-posting-fixtures.test.ts`: 125 passed.
- `pnpm typecheck --concurrency=1`: seven successful tasks, two cached;
  Turbo reported cache IO permission warnings, no failed tasks.
- `pnpm --filter @jobguard/core build`: passed. Regenerated ignored core dist
  after API/repository imports initially failed on its stale double-unwrap
  schema call; no source fix was needed.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/success-fee.application.test.ts`: rerun 11 passed.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/success-fee-repository.test.ts`: rerun 4 passed.
- Lane policy loading/schema and exact branch validation passed.
- `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`,
  `node tools/commercial-boundary-lint.mjs`: passed. Core purity reported
  existing computed-import diagnostics.
- `git diff --check`, export union assertions, catalogue/main comparisons,
  migration byte comparisons and tracked source merge-marker scan: passed.

The default PATH pnpm was v11 and stalled before test execution; both initial
commands were interrupted and rerun using the existing cached pinned launcher.
No dependencies downloaded. No git writes, database/browser suites, providers,
real customer data or releases. Router stages the resolved files and completes
the existing merge; git's index remains unmerged until that authorized step.
CI database/browser checks and independent exact-head RED review remain owed.
The catch-up does not complete the outstanding full M4-10-S plan work above.
