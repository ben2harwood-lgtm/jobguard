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

Repair2 — PR #923 must-fix findings only (24 November 2026):
- Added an invoker trigger restricting runtime UPDATE to the pending-to-cancelled
  transition. Saved content, money and agreement fields remain unchanged;
  capability agreement still uses the existing SECURITY DEFINER function.
  The real-PostgreSQL seed proof now attempts all six reported same-firm rewrites
  of an agreed row, expects SQLSTATE 42501 and checks the builder's saved values.
- Create now accepts positive PostgreSQL integer variation revisions independently
  of link versions. Unit coverage accepts revision 3; the seed proof reprices
  twice and creates/opens a version-3 link at its exact new amount.
- The F6 seed block reuses the two sessions established earlier in the suite.
  The browser proof signs in once through the real UI (including secure-cookie
  practice entry), then reuses its storage state at 360 and 1280 pixels.
- Phone source inspection: tools/v2/start.mjs enables Next experimental HTTPS
  with the selected phone address/certificate; tools/v2/settings.mjs configures
  that HTTPS AUTH_ALLOWED_ORIGIN. apps/web/next.config.mjs only proxies
  /api/v2-backend/* to the internal HTTP API; extra-link routes stay in Next.
  extraLinkOrigin now compares Origin to configured AUTH_ALLOWED_ORIGIN, avoiding
  dependence on a dev proxy's request.url or untrusted forwarded headers. Unit
  tests cover the configured HTTPS origin with an internal HTTP request URL,
  foreign/missing origins and missing configuration.

Repair2 local validation (working tree based on ccdf8ddbe2807c31184e1397949a57804a6ba0a8):
- Targeted db Vitest: 12 passed; targeted web origin Vitest: 3 passed.
- node --test tools/v2-local.test.mjs: 47 passed.
- Turbo typecheck and lint: 8 packages passed each (concurrency 2).
- Turbo build --filter=@jobguard/db: db, core and storage builds passed (3 tasks).
- Both changed test scripts passed node --check; PL/pgSQL CASE-in-IF lint,
  LANE_BASE_REF=origin/v2/main pnpm lint:lanes and git diff --check passed.
- PostgreSQL, Playwright, the full application build and full test suite were not
  run in this sandbox. The router must rebuild API/DB artifacts, rerun bootstrap
  to install the revised local migration, run the full seed suite in one run,
  and run customer-extra-links.browser.test.mjs at both widths against HTTP and
  HTTPS phone mode. Record actual counts against the resulting committed head;
  no Mac/browser pass or new head is claimed here. Independent RED recheck and
  required CI remain the router's gates.

Repair (Codex P1, 25 Nov): a BEFORE INSERT guard, `app.v2_f6_guard_insert`,
refuses any new link that is not pristine (link_version 1, no cancel or
agreement fields). Without it, same-firm runtime could insert a link that was
already "agreed" and skip `app.v2_f6_agree`, its checks and its audit event.

Repair (Codex P1 on 209d838): the insert guard also checks every saved photo.
Each entry must have exactly the five locator fields and match, field for
field, an original, server-verified, uninvalidated image evidence object of
the link's own tenant and job; duplicates are refused. The anonymous photo
endpoint can then never read another job's object by a copied locator.
