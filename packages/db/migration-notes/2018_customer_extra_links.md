# Q12 / V2-F6 · RED · customer agreement links

Migration `tools/v2/migrations/2018_customer_extra_links.sql` is local-only. The
checked V2 bootstrap installs it after 2001. It has no dependency on 2002–2006,
does not join the production migration runner, and refuses any other database.
Rerunning the bootstrap retains rows and creates neither links nor audit events.
Forward fix with this reserved migration during rehearsal; rollback by retaining
the old V2 volume for evidence and provisioning a fresh V2 rehearsal directory.
No production migration, real-customer launch or fee authority is supplied.

The new table has forced RLS, bound tenant + firm + visible-job runtime policies,
job-qualified foreign keys and no runtime DELETE grant. LP-11 removed GUC-only
business access. Narrow SECURITY DEFINER routines therefore resolve a hashed
capability and use private, capability-scoped migration-owner policies for reads
and variation row locks. The audit sealer gets only the capability's recorded
agreement event and tenant head through a private helper, preserving LP-11.
They never create a builder or customer session.
Anonymous agreement audit attribution remains a bearer claim recorded for the
issuer; the database independently labels it system attribution. Names, text,
photos, tokens and financial findings do not enter audit payloads.

Fallback chosen: the existing authenticated-customer command needs a customer
session; the customer-evidence command needs a verified original evidence object.
A typed link name satisfies neither. Agreement records only a claim and leaves
committed price unchanged. The builder's one-tap approval uses the existing
`variation-command.v1` with its explicit builder attestation unchanged. Quotes
and issued invoices remain immutable. This is not an authenticated signature.

Builder screen: `/v2/jobs/<job-id>/extra-links`. It lists the current priced
variations, makes or cancels links and offers approval after customer agreement.
Optional photos are explicitly selected from this job's verified photos,
and snapshotted as immutable object versions. Customer page:
`/customer/change/<firm-digest>.<secret>`. The only destination is the local test
inbox shown on the builder screen; `captureV2Delivery` records receipt metadata.
Raw secrets are never persisted in the database. Keep the local inbox page open
or copy its link; a reload intentionally cannot reconstruct a lost secret.

Purchase-order audit deferral: the new local table is excluded from the shared
schema. An added separate test in `purchase-order-audit.integration.test.ts`
checks that boundary. Real V2 tests are appended as their own block in
`tools/v2/seed.integration.test.mjs`: commands, exact replay, changed replay,
audit append, forced post-insert failure, no partial agreement, cancelled,
expired, stale, second-firm SELECT/INSERT/UPDATE/DELETE and unchanged money docs.
The proof manifest is beside the local migration. PostgreSQL tests were written
but cannot run in the sandbox.

Browser proof uses real seeded requests and Playwright, with no mocked success:
`V2_TEST_ORIGIN=<web-origin> node --test tools/v2/customer-extra-links.browser.test.mjs`.
Repeat against the HTTPS phone-mode origin on this Mac, optionally setting
`V2_TEST_SCREENSHOTS`. Both 360 and 1280 widths cover link creation, customer
agreement, reload, overflow and explicit builder approval. These runs remain due.

Rework risk: low
Not ready for Ben: waiting for Astra's plan check

Local validation (builder, not independent review):
- `pnpm typecheck --cache-dir=/tmp/v2-f6-turbo-cache --concurrency=2`: 8 packages passed.
- `pnpm exec turbo run lint --cache-dir=/tmp/v2-f6-turbo-cache --concurrency=2`: 8 packages passed.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/v2-customer-extra-link-repository.test.ts`: 11 passed.
- `node --test tools/v2-local.test.mjs`: 47 passed.
- Bootstrap, seed integration and browser test JavaScript syntax checks passed.
- Core purity, money arithmetic, commercial boundary, AI provider boundary,
  PL/pgSQL CASE lint and `git diff --check` passed.
- `LANE_BASE_REF=origin/v2/main pnpm lint:lanes` and the root lint wrapper
  refuse a self-comparison because HEAD still equals the issued base. Git is
  read-only in this sandbox. The working-tree allowlist separately matches all
  21 changed paths exactly; rerun the required lane command after router commit.
- No application build, PostgreSQL server or browser was launched locally.
  Compile the installed storage dependency before targeted unit tests on a fresh
  worktree (`pnpm --filter @jobguard/storage exec tsc -p tsconfig.json`).

Pending commands outside this sandbox: rebuild the API/DB artifacts, start the
checked V2 launcher, then run the V2 seed integration suite with
`JOBGUARD_LOCAL_V2=1 JOBGUARD_ENV=synthetic_demo` and the launcher's existing backend
and database system-ID settings. Run the new browser suite at the web origin and
again at this Mac's HTTPS phone-mode origin. Required CI, including full build,
PostgreSQL and browser checks, and independent RED review remain outstanding.
