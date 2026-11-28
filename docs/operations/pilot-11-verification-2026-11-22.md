# PILOT-11 local verification · 22 November 2026

**Fixture application and migration commit**
`6cf0a9a6b31297d3f57c96fd5f2c3a03142efc4a`.
PILOT-11 adds the [evidence index](foundation-gates.md#pilot-11-evidence-index--22-november-2026)
and this receipt to that base. The release candidate and its independent review,
deployed checks, separate technical acceptance and activation decision remain pending.

The merged pieces' independent Claude PASS verdicts come from the
coordinator verdict ledger (outside repo), 22 Nov 2026. The evidence index records their full
SHAs and the open PILOT-04a automated-review P2. [Merged evidence](foundation-gates.md#merged-evidence) · [Open LATER follow-up](foundation-gates.md#open-later-follow-up)

**Runner** Codex in the isolated JobGuard workspace. Node 24.15.0, pnpm 10.28.1,
Vitest 4.1.12 and the repository's embedded PostgreSQL 16.10 fixture. The DB
harness creates disposable loopback clusters and applies migrations with fixture
administrative roles. Application checks use the fixture runtime, identity and
worker roles defined by the named suites. Customer and builder records are
fictional, and delivery is local and fake. The committed
[pilot topology](../../infra/pilot/topology.v1.json) identifies the deployment
shape for later rehearsals. Its SHA-256 is
`3359d99cccda39ab6eb474e729e1a9166d42cfc2ffe50c286eba2047bae4010a`.

**Migration manifest** The base contains 440 SQL files through
`0775_pilot_customer_portal.sql`. Its ordered name-and-hash manifest has SHA-256
`72bef6206de51e4133dc776d366f5d8334f74b8ca3a22a138ed6b99277b0dc35`,
computed with `(cd packages/db && LC_ALL=C sha256sum migrations/*.sql) | sha256sum`.
Individual upgrade suites install their own pinned predecessor and successor.

**Versioned artifacts** The four versioned contracts linked from
`g0-contracts` bind to the tested base. The pilot policy tests use
D02 `reference_tax_invoice_policy_v1`, D04 `provider_residency_policy_v1`,
D06 `customer_approval_jurisdiction_policy_v2`, D07
`pilot_data_operations_policy_v1`, D12 `third_party_data_protection_policy_v4`
and D13 `shadow_attribution_policy_v3`. Those identifiers describe the
versions checked in fixtures. G0 and G1 remain unmet.

## Required checks

| Command | Result |
|---|---|
| `VITEST_MAX_WORKERS=2 pnpm --filter @jobguard/api test` | 4,583 passed across 272 files. The included OpenAPI check passed. |
| `pnpm --filter @jobguard/web test` | 3,781 passed across 264 files. |
| `pnpm --filter @jobguard/config test` | 490 passed across 34 files. |
| `pnpm --filter @jobguard/api typecheck` and `pnpm --filter @jobguard/web typecheck` | Both exited 0 with `packages/config/dist` absent throughout both compiler runs. |
| `CI=1 NEXT_TELEMETRY_DISABLED=1 pnpm --filter @jobguard/web build:cloudflare` | Passed. Next.js generated 76 static pages and OpenNext wrote `.open-next/worker.js`. |
| `node --test tools/*.test.mjs` | 449 passed, 3 existing TODOs, 0 failures out of 452. |
| `pnpm lint` | Passed all eight workspace lint tasks and the repository guards using the pinned comparison base. |
| PostgreSQL fixture groups below | 183 passed, 4 existing TODOs, 0 failures across 22 files. |

The first full API attempt finished with 4,560 passing tests, one workspace
framework test timeout and 22 shadow-isolation cases skipped after their setup
hit the concurrent Next.js build lock. The passing full rerun used the completed
production build and two Vitest workers.

## PostgreSQL and policy matrix

Run the files in the matrix from `packages/db` using
`pnpm exec vitest run --maxWorkers=2 <files>`. Names are relative to
`packages/db/test/`. The first invocation ran the 18 files marked A
(139 passed). The second ran the four files marked B (44 passed, 4 existing
Final Check TODOs). One unmatched non-integration grant-freeze selector in A
was corrected by running the integration file in B. Fixture permissions and
historic upgrade scopes come from each test's own harness.

| Check | Runner files | Remaining evidence |
|---|---|---|
| Fresh install and upgrade | A · `tenancy.integration.test.ts`, `demo-bootstrap.integration.test.ts`, `final-account-lock-upgrade.integration.test.ts`, `commercial-outbound-pause-upgrade.integration.test.ts`, `pilot-customer-portal.integration.test.ts` | Rerun for the eventual deployment candidate. |
| Installed catalogs, grants and RLS | A · `lp-0-authority-paths.integration.test.ts`, `bound-context-reader.test.ts`, `bound-context-reader.integration.test.ts`, `money-trail-security.integration.test.ts`, `deployment-preflight.integration.test.ts`, tenancy above. B · `lp-0-grant-freeze.integration.test.ts` | Deployed role/catalog proof and independent human LP-9 review under PILOT-20. |
| Identity, tenancy and customer authority | A · `identity.integration.test.ts`, tenancy and pilot portal above | Deployed edge trust, sign-in, membership, access revocation and pooled roles. |
| Concurrency, rollback, delivery and outbox | A · `audit.integration.test.ts`, `outbox.integration.test.ts`, identity, outbound upgrade and pilot portal above | Complete integrated pilot dispatch and stop/drain/reconcile/resume from PILOT-07. |
| Audit, ledger and recovery | A · `ledger.integration.test.ts`, `audit-checkpoint-handoff.integration.test.ts`, `lp9-restore.integration.test.ts`, audit above | Restricted deployed checkpoint and measured backup/restore from PILOT-17/19/20. |
| Final account, privacy and financial checks | A · `final-account-lock-reveal.integration.test.ts`, `shadow-pilot-financial.integration.test.ts`. B · `final-account-lock-invoice.integration.test.ts`, `final-check-invoice.integration.test.ts`, `privacy-operations.integration.test.ts` | Existing fixtures cover individual controls and stored gross accrual, invoice and collection detections. PILOT-05/09 supply the integrated pilot Final Check, invoice, receipt and privacy coverage. |
| Contracts and fail-closed policies | Config suite, offline foundation pack test and API/web suites. `policy-gates.pilot.test.ts` exercises absent, proposed, wrong-version, superseded and revoked policies, and independently missing G0/G1 evidence in the trusted record. | Repeat at each entry point and executor against the eventual candidate under PILOT-21, including missing approval at otherwise eligible entry points. |

## Browser matrix

Playwright used the production Next.js build and system Chromium 154 after the
pinned Chromium download returned HTTP 403. Both runners used disposable local
PostgreSQL. The pilot fixture uses a seeded builder session and local mailbox.

| Runner | Result and scope |
|---|---|
| `PILOT_FIXTURE_CHROMIUM=/usr/bin/chromium pnpm --filter @jobguard/web exec playwright test --config=e2e/pilot-04a.config.ts` | 3 passed. Builder capture, exact quote staging and live-job continuation at 360px and 1280px. Customer portal sign-in, exact quote acceptance, extra approval, stage acknowledgement and message evidence at 360px. |
| `CI=1 pnpm --filter @jobguard/web exec playwright test --workers=1 --project=mobile-360 --project=desktop m1-15-complete-journey.spec.ts MON-5-customer-journey.spec.ts` | 4 passed. Synthetic practice job-spine and customer journeys at 360px and 1280px. |

## Pilot journey completion criteria

The isolated full journey remains pending PILOT-05, PILOT-07 and their
integration with the existing builder and customer fixtures. Run with fictional
actors and a fake delivery port, using one persisted job from entered-code
builder sign-in through quote and exact customer portal approval, activation,
extras and private versioned proof, final-account lock and Final Check, supported
builder invoice, and authorized off-platform customer receipt. Check the same
job after replay, then assert zero JobGuard obligations, accruals, platform
invoices, platform journals and collection attempts in committed state.
The individual fixture results above leave this end-to-end assertion open.

PILOT-09 and PILOT-18 still owe the complete privacy rehearsals. PILOT-12–21
supply the actual approved policies, deployed evidence and acceptance.
