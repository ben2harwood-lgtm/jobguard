# 0761 connector materials staging — ENT-13a (RED)

Adds materials_issue to connector.input_event.kind and replaces connector.intake with
0554's latest main body, widening only kind validation and the document-label branch.
Materials uses the same strict six-field envelope as work_order. No table, schema,
role, grant, domain write, origin, approval, price, prompt or statement access is added.
All kinds still return staged with domainEffects 0. Existing identities, receipts,
audits, binding checks, locks and replay conflicts are preserved.

The proof's explicit lp0, upgrade and tenancy arrays are empty because the reviewed
catalogue attributes they describe do not change: signature, owner, security-definer,
search path, grants, static writes/calls, relations and policies stay identical. The
kind CHECK and validation body change is tested separately. Expectations are source
reviewed, never derived from a database. No baseline or legacy list is changed.

CI must execute connector-intake.integration.test.ts, including a populated immediate
predecessor upgrade applying 0761 alone, and the mandatory full PostgreSQL migration,
tenancy and effective-privilege suites. Local source/proof tests do not establish SQL
execution. No database or browser is available in the build sandbox.

Forward fix: preserve immutable source facts and receipts. If materials intake must
be disabled, a later migration should refuse new materials events in intake while
retaining the widened CHECK and existing rows. Do not drop facts or rewrite 0761.
No data backfill or application activation. Q2/H1, Q3, Q4, Q7 and G5 remain held;
ENT-13a stays open and requires independent exact-head RED review.

## Staging catch-up validation — 4 November 2026

Inspected the completed merge against its current-main parent `155a3eb06`
(`origin/main`; local `main` is stale). No conflict or product-code correction was
needed. The only intake definition on that base is 0554; the source proof confirms
0761 retains its complete body with only the two kind-validation changes. No
fingerprinted row shape, command registry, context binding, client/server boundary,
new-table allowance or privilege proof needs widening. Only this piece's lane file
differs from the merged base, and its allow list exactly covers the ten non-lane
paths. SyntheticConnectorInbound and stageSftpFixturePull remain unregistered.

Local validation (Node 24.17.0, installed Vitest 4.1.12, `--maxWorkers=2`, no database
or browser):

- API: `vitest run --maxWorkers=2 src/connectors/inbound.test.ts src/connectors/sftp.synthetic.test.ts` — 56 passed.
- API: `src/auth/context-boundary.test.ts` — 145 passed;
  `src/auth/identity.test.ts` — 7 passed;
  `src/watchdog-registry.test.ts` — 126 passed, using the same runner and worker cap.
- DB: `vitest run --maxWorkers=2 test/connector-intake-proof.test.ts test/migration-proof-loader.test.ts` — 80 passed.
- Installed `tsc -p tsconfig.json` passed for core, storage, db and ai to generate
  missing local workspace build outputs; `tsc -p tsconfig.json --noEmit` passed for
  config, ai, api and web. Together these check all seven workspace packages.
- `node --check tools/agent-lane-boundary-lint.mjs`,
  `node tools/agent-lane-boundary-lint.mjs` and `git diff --check` passed.

The global pnpm launcher stalled before reporting its version, including when
invoked by Turbo; those attempts were stopped. Direct installed binaries were used
without downloading packages. Initial guard runs could not resolve missing
workspace dist entries; after generating those outputs, every listed suite passed.
These are deterministic local checks, not independent review or SQL execution.
CI must still prove the full PostgreSQL, upgrade, fingerprint, privilege and tenant
isolation suites, required browser workflows and other mandatory repository checks.
NOPR and RED remain; Q2/H1, Q3, Q4, Q7 and G0–G5 remain held. No real endpoint,
machine login, provider call, release or domain promotion is enabled.
