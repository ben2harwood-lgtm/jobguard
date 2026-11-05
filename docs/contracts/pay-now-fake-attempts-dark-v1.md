# MON-6 dark fake attempts v1

Synthetic observations only; MON-6 remains open. `PAY_NOW_ENABLED` is false.
No route, screen, worker or application registration consumes this repository.
CustomerInvoicePayNow remains mounted without an invoice and renders nothing.

`command(context, actor, raw)` accepts a verified context, a trusted actor locator
`{jobId, sessionDigest}`, and the strict versioned command
`{version: 'pay-now-attempt.v1', commandId, invoiceId, rail}`. The session is
rechecked against active company owner/admin membership in SQL, including replay.
Only bank_transfer, card and pay_by_bank are accepted. Every stored customer_invoice
currently represents a final invoice; deposits, stages and the DD stub are excluded.
The invoice's final-account revision and existing issuance/lock controls remain authoritative.

The server derives the balance using stored credits and unreversed receipts, and
derives `fake-builder-<tenant UUID>` itself. Core parsePayNowInvoice/payNowOptions
and the shared payNowFakeResult own all tariff arithmetic. The private SQL store
receives that calculated projection, verifies balance, destination, zero platform
funds and the cap independently, and hashes the complete record. Repository reads
revalidate exact core options and results, refusing corrupted projections. SQL
EXECUTE is an application trust boundary: it does not defend against compromised
application code submitting a false tenant context or bypassing core projection
validation. No additional role or direct table access is granted.

Prepare and store share one transaction and the existing command-then-invoice
advisory lock order. A unique tenant/invoice/source fingerprint refuses a second
fake settlement of identical invoice facts, including concurrent commands.
The fingerprint covers the immutable invoice source/final revision plus credit,
receipt and reversal identities. A changed balance permits a new observation;
even a reversal returning to an earlier balance has a distinct fingerprint.
The commercial invoice revision is unchanged by these observations. Replays
return the original immutable row, even after credits, full payment or reversal;
changed command payload or actor conflicts. A new command cannot collect a zero balance.

`read(context, jobId, invoiceId)` uses verified-context tenant isolation, as the
existing practice invoice reader does; it returns `{synthetic: true, attempts}`.
Each attempt and every option/result has a synthetic label. Missing invoices,
foreign tenants and wrong jobs have the same not-found response. These are fake
outcome records, not payment facts, commercial commands, receipts, ledger postings,
fee obligations, reservations, collections or audit-chain events. None of those
tables is written. Bank transfer is always offered without a fee. Catch provenance
does not affect options or fees; the projection does not inspect shadow tables.

D10 v2 amounts are unapproved fixture values. No live tariff, VAT treatment,
provider sandbox evidence, live rail, link, charge, DD, stage or screen is delivered.
Live use still requires the written payment-regulation opinion, VAT ruling,
D10 v2, G4-S and M4-15. All G0-G5 gates remain closed. Exact-head independent
RED review and PostgreSQL CI (including upgrade/catalogue/RLS/concurrency tests)
remain required before landing this bounded synthetic change.

## Builder practice preview (4 November 2026; MON-6 remains open)

This addition supersedes the earlier no-route/no-screen description only for the
builder practice preview. A session-only, no-store GET/POST now serves the stored
invoice and attempts at `/jobs/:job/invoices/:invoice/pay-now-preview`.
The application binds the verified company context directly; POST passes the
session digest as actor locator and accepts only `{commandId, rail}`. GET checks
current owner/admin membership via the existing identity provider and obtains
positive-balance options from read-only SQL prepare; zero balance has no
collectable options. No private SQL actor-helper grant was added. POST requires
the trusted browser origin. Page and route are not found outside synthetic_demo.
The client renders server facts, shares the original wording, and retains the
command ID/rail across uncertain responses and reloads. Bank transfer gets equal
list treatment and a 44 px practice action. The customer component stays dark.

Local evidence: all seven package TypeScript checks and 415 focused Vitest tests
passed with installed binaries, at most two workers per run; lane/diff checks
and browser fixture subprocess syntax pass. The pnpm wrapper could not
verify/fetch its pinned executable here; its top-level checks did not execute.
Vitest lists five new DB cases; Playwright lists mobile-360 and desktop cases.
Neither database nor browser execution was possible in this sandbox.
CI must run `pay-now-preview.integration.test.ts`, existing
`pay-now-attempt.integration.test.ts`, and
`MON-6-stored-pay-now-preview.spec.ts` headless at both widths. They cover stored
extreme balances, row immutability, replays/concurrency, roles/sessions, isolation,
credits/receipts/reversals, equal screens for an ordinary stored invoice and a
synthetic approved catch line, lost-response retries after reload, 44 px targets
and no horizontal scroll. The catch line is a source fixture, not live detection.
Normal CI gates and independent RED review at the router's committed head remain
outstanding. No migration, role or grant was introduced. Customer page, live
rails, stages, real tariff/VAT, provider sandbox evidence and G0-G5 stay held.

LATER / SIMPLICITY (initial review): `PayNowAttemptApplication.read` could later
use a repository current-options projection instead of inline prepare SQL plus
a separate balance read, keeping stored projection in one place. That requires
a separately scoped repository-interface change outside this brief.

## Customer practice display (4 November 2026; MON-6 remains open)

`GET /api/customer-portal/practice-pay-now` and
`/customer/practice-pay-now` are synthetic_demo only. They accept no invoice,
tenant, job or customer locator. The existing customer cookie and persisted
session digest bind the scope; supplied query parameters or tenant headers are
refused before application access. Missing, malformed, expired, revoked and
foreign-scope customer credentials share the portal's public refusal. Responses
are no-store and no-referrer. No customer link or message is created or sent.

Migration 1200 adds one bounded identity-only read routine, reusing portal resolve
and its authority locks before invoice access. It selects the bound job's latest
synthetic final invoice by issue date and invoice number, subtracts credits and
unreversed receipts, and returns only invoice number and amount due. No role,
table grant, table, column or earlier routine changes; only EXECUTE on this new
read entrypoint is granted to the existing identity login. Its proof and note
record the expected catalogue change for CI verification.

The application projects only rail and customer total from `payNowOptions`.
Core's required identity fields use session-bound local placeholders for this
arithmetic projection; no stored invoice identity or catch classification is
needed. Builder fees, tariffs, surcharge lines, destinations, attempts and hidden
data never enter the public body. Positive balances offer bank transfer, card
and pay by bank in core's existing order; a zero balance offers none. All options
have identical list markup, spacing and font weight. There are no payment actions,
links, browser storage writes, attempt starts or other effects of visiting.

Local evidence: seven package TypeScript checks passed using installed binaries.
436 focused Vitest tests passed (application and authorization guards, identity,
repository and migration-proof loader, core cap/dark guards, route and rendering).
Runs used at most two workers and at most three named files. Browser listing
finds the new spec in mobile-360 and desktop; the native seed subprocess passes
`node --check`. Listing/syntax checks do not establish database/browser execution.

CI must execute `packages/db/test/customer-practice-pay-now.integration.test.ts`
and `apps/web/e2e/MON-6-customer-practice-pay-now.spec.ts` headless at both widths,
plus the existing required PostgreSQL fresh/upgrade/catalogue/RLS suites and
normal checks. The new database cases cover 1, 12,000 and 1,000,000,000,000 pence,
catch/ordinary byte equality, current balances after credits/receipts/reversals,
identity-only access, uniform session refusals and unchanged stored rows.
The browser spec uses actual stored fictional invoices and customer sessions,
checks equal options, no actions or disclosure, revoked/signed-out refusal and
no new attempts. Neither suite can execute in this sandbox. Exact-head independent
RED review remains required. CustomerInvoicePayNow and PAY_NOW_ENABLED stay dark;
real invoice UI, provider evidence, live rails/links, stages, tariff/VAT and all
G0-G5 release gates remain held. This does not finish MON-6.
LP-5 lifecycle hold: this synthetic observation store and its practice preview
do not dispatch through the LP-5 command lifecycle. They create no commercial
authorization or execution record. Lifecycle integration remains held before
any live payment command can use this surface.


## Batch-39 landing reconciliation (5 November 2026)

READY for router staging and no-PR handoff; this is builder evidence, not an
independent review or permission to merge. Comparison base is `origin/main`
`62081c68933d0b953e7dd75a8cbd7b3a2fb4f304` (the pending merge's incoming head).
The local branch named `main` is stale and is not this comparison base.

Migration inventory against that base:

- Removed `1015_pay_now_fake_attempts.sql` and its proof/note. Its SQL is
  byte-identical to main's `0598_pay_now_fake_attempts.sql`: SHA-256
  `520c1eb9b8b378e45955206051cd9e315473678aeda74774393531fde7033d3c`.
  The old proof differs, after stem normalization, only in the authority-group
  target note: main explicitly holds LP-5 integration. Main's proof, note and
  contract hold are retained. The obsolete `0757` conflict paths stay absent.
- Renamed `1016_customer_practice_pay_now_read` to
  `1200_customer_practice_pay_now_read`, including its proof/note and source
  references. SQL bytes are unchanged: SHA-256
  `1e833500890d5f96a57287157900062887a8f6218c715e19c7876e1e8c0f6095`.
  This is the only additional migration, with a temporary landing number.
- All migrations on the comparison base are byte-identical in this worktree.
  `identity.customer_practice_pay_now` has no earlier definition on main; this
  batch re-creates no existing routine. In particular main's latest
  `app.lp5_command_result`, including `purchase_order.send.dark`, is untouched.

Stored fake-attempt infrastructure is wholly on main. The remaining scope is
ENT-3's priced mobile journey proof and MON-6's synthetic customer practice
read/display with its unit, PostgreSQL and browser coverage. This does not close
MON-6's live acceptance criteria. Main's database exports, complete later-empty
registry and batch-23 lane are retained. The batch-39 lane lists exactly every
file changed from the comparison base outside `config/lanes/`, and never itself.
No existing test has been weakened.

Local verification for this reconciliation (installed binaries; no downloads):

- API: `vitest run --maxWorkers=2 src/pay-now-attempt.application.test.ts`:
  29 passed.
- Web: `vitest run --maxWorkers=2
  app/api/customer-portal/practice-pay-now/route.test.ts
  app/customer/practice-pay-now/screen.test.tsx`: 13 passed.
- Database package, without PostgreSQL: `vitest run --maxWorkers=2
  test/migration-proof-loader.test.ts test/pay-now-attempt-repository.test.ts
  test/customer-evidence-approval-proof.test.ts`: 108 passed.
- Core: `vitest run --maxWorkers=2 src/pay-now-synthetic.test.ts`: 5 passed.
- `playwright test --list --workers=2 e2e/ENT-3-priced-journey.spec.ts
  e2e/MON-6-customer-practice-pay-now.spec.ts`: four project entries discovered.
  ENT-3 intentionally executes at mobile-360 only; MON-6 covers both widths.
  Discovery is not browser execution.
- Installed TypeScript `tsc -p <package>/tsconfig.json --noEmit` passed
  sequentially for config, core, storage, ai, db, api and web (seven packages).
- Core purity, money, commercial, AI-provider and PL/pgSQL boundary lint passed.
  `git diff origin/main --check` passed. Direct use of the existing lane-policy
  functions against the effective working-tree/main diff passed (14 exact
  non-lane paths; one new migration above main's highest number, 0608).
- The normal `node tools/lint.mjs` stopped at the lane check because the
  read-only Git index still represents an unfinished merge and old HEAD paths.
  This is not a final-head lint pass. The pnpm launcher stalled before checks;
  it was interrupted and the installed binaries were invoked directly.

### Named holds for landing

- **Git staging and final lane gate:** the sandbox cannot write `.git`. The
  router must stage all working-tree resolutions, removals and the new 1200
  files, finish the pending merge, reconcile the final migration number and
  rerun the normal lane/lint gate on the exact resulting head. No Git-writing
  command was run here.
- **CI PostgreSQL proof:** run fresh/upgrade migrations, migration proofs,
  privilege/catalogue/RLS and tenancy checks, plus
  `customer-practice-pay-now.integration.test.ts` and the existing pay-now
  integration suites. Source inspection and proof-loader tests do not establish
  PostgreSQL behavior.
- **CI browser proof:** execute `ENT-3-priced-journey.spec.ts` at mobile-360 and
  `MON-6-customer-practice-pay-now.spec.ts` at mobile-360 and desktop, headless
  with at most two workers. Retain all existing required CI checks, including
  typecheck, lint, test and build, against current main.
- **Independent RED review:** required against the final exact head for customer
  authority, tenant isolation and money display. No independent review ran here.
- **Release scope:** synthetic data only. CustomerInvoicePayNow,
  PAY_NOW_ENABLED, live providers, payment regulation/VAT/D10/G4-S and all
  previously recorded release gates remain held.

## Batch-39 pre-check repair (5 November 2026)

READY for router commit/push and CI; NOPR. This is one builder repair round,
not an independent RED pass or a database/browser execution result. The launcher
already merged main; the comparison base is now `origin/main`
`199124c0885ca27558fbaf62a9a74dee7ad2818f`. All existing main migrations remain
unchanged. The only extra migration remains 1200_customer_practice_pay_now_read;
main's fake-attempt migration is not duplicated.

B1: the proxy's only product edit appends the exact `practice-pay-now` exception.
The action matrix covers it; customer cookies (alone, empty or alongside builder
cookies, across all tested HTTP methods) still refuse builder jobs, sessions,
payment attempts and contractor APIs. Trailing-slash and nested variants remain
refused. Both proxy files are in the lane.

B2: the expiry fixture shifts issued_at and expires_at back together, preserving
the required one-hour interval. Database and browser fixtures now share one real
approved-catch setup: existing final-check helpers seed evidence, reveal it after
the immutable baseline lock, publish the checked completion, confirm the catch,
price it and approve its exact revision through the variation repository. The
baseline invoice precedes a new immutable account revision and a supplementary
invoice issued through FinalAccountLockRepository. Stored source, scope, revision
and approval references are genuine; no guard is bypassed. This extra fixture
setup is necessary because a real JobGuard catch happens after lock and cannot
be inserted into the original locked invoice. The database comparison asserts
jobguard_catch origin and the exact persisted approval and amount, and masks only
the invoice number. The browser compares real equal balances and public markup.
The shared final-check job fixture now explicitly binds fictional parties and a
small-builder track before going live, so it works without legacy DB-test hooks.
The subsequent independent re-check disproved this round's ENT-3 price-display
claim: the list returns quotedPence null for this capture. The final repair below
corrects the spec against the actual approval-bound quote semantics.

Local checks (installed tools, no downloads, at most two Vitest workers and three
named files per run):

- Web proxy, practice route and practice screen: 51 passed.
- API pay-now application and customer sign-in: 70 passed.
- DB package non-database proof loader, pay-now repository and customer-evidence
  approval proof: 108 passed.
- Web TypeScript and a targeted TypeScript check including both the new shared
  fixture and the DB integration test passed. The shared fixture imported in
  Node/tsx without starting a database; the extracted browser seed passed
  `node --check`.
- Playwright listing discovered all four project entries for ENT-3 and MON-6;
  listing is not execution. ENT-3 remains mobile-only by its existing skip.
- `node tools/lint.mjs` passed, including the normal lane check. The lane lists
  exactly 18 changed non-lane files, including the new fixture and the adjusted
  shared final-check fixture; it does not list itself. `git diff origin/main
  --check` passed. No Git-writing command was run.

CI must run the actual PostgreSQL customer-practice suite (including SB-25 and
all expiry/refusal/no-write assertions), customer-signin, customer-portal-message,
final-check catch-confirm, catch-journey, lock-run and final-account lock/invoice
regressions affected by the shared fixture. Retain fresh/upgrade migrations,
proof/catalogue/privilege/RLS/tenancy checks and existing mandatory suites. Execute
MON-6 at mobile-360 and desktop and ENT-3 at mobile-360, headless with at most two
workers. All required typecheck, lint, test and build checks and independent RED
review must pass at the router's final exact head before merge. The sandbox cannot
start PostgreSQL or bind localhost, so none of these database/browser results is
claimed locally. All existing synthetic-only, provider, money, release and launch
holds above remain in place; MON-6 is not finished.


## Batch-39 final repair round (5 November 2026)

READY for router commit/push and CI, NOPR. This is the second and last repair
round, with no independent PASS claimed. Proxy and expiry fixes are preserved.

- SB-25: baseline and supplementary invoice repositories now use the existing
  `practiceMaterialPool` with the catch job's digest. The invoice actor guard
  requires both the owner and this job-scoped practice session; a plain tenant
  context cannot authorize issuance. No actor, permission or guard was changed.
- MON-6 seed: pg parses connectionString after explicit options, so the inherited
  admin URL overrode the shadow login in browser fixtures. Replace the URL's
  credentials too. The generated login still has only jobguard_shadow membership.
  A local regression uses pg's real Client parser for both discrete options and
  URL configuration, stops before seeding, and proves the effective login,
  database, host and port. It does not connect or prove PostgreSQL permissions.
- ENT-3: correct the spec, leave the screen unchanged. The SoR amount is already
  tested against the stored schedule, adjustment and origin. `quotedPence` is a
  separate read of extra_approval_revision_binding, absent for this capture.
  Assert the exact extra's null quote and awaiting_approval state in the API and
  absence of a displayed quote, while retaining all stored-money, photo,
  resident-confirmation, mobile-size, replay and close-out assertions. Do not
  fabricate a displayed quote from another price source.
- Keep only the existing minimal shared final-check fixture change: draft insert,
  idempotent fictional-party binding, small-builder/synthetic track, then live.
  These prerequisites are strictly needed in browser clusters without the legacy
  DB-test hook: live insertion requires parties and begin requires the track.
  No actor, final-check ordering or other shared-fixture behavior changed in this
  round. CI must retain the shared-fixture regressions named above.

Local checks (installed binaries, no downloads):

- From apps/web: `./node_modules/.bin/vitest run --maxWorkers=2 proxy.test.ts
  app/api/customer-portal/practice-pay-now/route.test.ts
  app/customer/practice-pay-now/screen.test.tsx`: 51 passed.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2
  test/customer-practice-pay-now-fixtures.test.ts`: 2 passed, no database.
- From apps/web: `./node_modules/.bin/tsc -p tsconfig.json --noEmit
  --incremental false`: passed.
- Root installed tsc with `/tmp/batch-39-repair-typecheck.json`, extending the
  strict root config and including the catch helper, its new regression and
  customer-practice-pay-now.integration.test.ts: passed.
- Playwright `test --list --workers=2` for ENT-3 and MON-6: four project entries
  discovered, not executed. ENT-3 retains its existing desktop skip.
- `node tools/lint.mjs` and `git diff --check`: passed.
- The pnpm launcher stalled before execution and was interrupted; the results
  above come from the installed binaries, not those interrupted commands.
- Lane equality against the current main/branch merge-base
  `199124c0885ca27558fbaf62a9a74dee7ad2818f`: 19 exact non-lane paths,
  including the new regression; the lane does not list itself. origin/main has
  advanced to `28871adf3ba1db975b6a4beb44025bcb8a571c9c`; no catch-up or Git
  mutation was attempted in this read-only-Git sandbox.

### Named holds for landing

- PostgreSQL SB-25 catch comparison and invoice authorization remain unexecuted
  here. Run customer-practice-pay-now.integration and the customer sign-in,
  portal-message and shared final-check regressions, plus mandatory migration,
  catalogue, RLS, privileges and tenancy suites in CI.
- Execute MON-6 at both widths and ENT-3 on mobile, headless, at most two workers.
  Browser discovery and source inspection do not establish those journeys pass.
- Router reconciles current main and migration 1200's landing number, commits and
  pushes, then obtains required green CI and independent RED review at the exact
  resulting head. No further local repair round is authorized.
- Existing synthetic-only, real-provider, money, deployment and launch gates stand.

READY
