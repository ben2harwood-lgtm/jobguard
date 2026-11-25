# PILOT-05c — builder-reviewed invoice drafts

RED: money, tax presentation and tenant data. NOPR build for independent review.

## Scope and authority

Built on `codex/sandbox/pilot-05c`, clean starting HEAD and local `origin/main`
`45a2b3fc26c3810b714c33e59a6d51043aee2311` (newer than the brief's inspected base).
No fetch, git mutation, push, PR, provider call, deployment or real data was used.
The issued 25 November draft-only ruling and checked VAT research lead this slice.
The current SIMPLE_LOOP, ALL_BUILDS_LOOP and simplicity rule were read. The pilot
plan was read from local `origin/codex/sandbox/pilot-g1-plan`, without importing its code.

The final-account screen now offers preparation after lock. The server requires
current verified owner/job access, G1, a saved unblocked account and its completed
lock check. It uses the existing repositories and request-bound tenant context;
there is no practice-identity fallback and no grant/schema change.

GET obtains a source binding; POST prepares a fresh preview, printable HTML or CSV.
The binding covers tenant/job, account revision/hash and lines, current saved
parties/profile, captures and current approved extra revisions. Every export
re-reads and checks that binding and checks current owner access again. A new
approved extra absent from the saved account blocks preparation. Stale bindings
clear the UI preview and confirmations. Reloading the source also clears them.
Only authoritative account lines enter the output; pending/unconfirmed findings
and extra proposals do not. Recorded quote/extra quantity, unit and unit price are
included when available. Missing details remain labelled missing, including the
customer billing address: the current party model only stores the work site.

The checklist is explicitly builder statements, not verified tax facts. It requires
VAT registration and a format-checked VAT number, the same private homeowner as
customer/payer, existing-home standard-rated GBP work, all checked relief and
energy-saving exclusions, no retention/CIS/reverse charge, no earlier deposits,
stages/part-payments, debit/credit notes or cash discounts. Every statement must be
true; missing/unknown/false answers cannot export a VAT draft. Unsupported cases
return a reason and keep the saved account intact. There is no fallback summary
carrying VAT figures or inherited “inc. VAT” text.

The existing proposed `candidate_m1_standard_v1` policy computes exact integer
group VAT; totals must match the saved account to the penny. HTML and CSV share one
row model and carry “Draft — This is not a VAT invoice”. They mark official number,
actual issue/sending date and tax point as missing for completion outside JobGuard.
The preview timestamp is labelled separately. Credit notes require separate review;
CSV carries no MTD claim. There is no Issue or Send action, invoice-number allocation,
issue/delivery record, receipt, payment state, financial posting or outbox staging.
Existing pilot refusals and synthetic invoice applications were not changed.

## Executed validation

Installed Node `v24.17.0`, TypeScript `5.8.3`, Vitest `4.1.12`; one Vitest worker.
No packages downloaded. Each test invocation named at most three files.

- `./packages/core/node_modules/.bin/vitest run packages/core/src/pilot-invoice-draft.test.ts packages/core/src/final-account.test.ts packages/core/src/tax.test.ts --maxWorkers=1`: **17 passed**.
- Installed Vitest with `/tmp/pilot-05c-vitest.config.mjs` against the new API draft, route and UI tests: **11 unique tests passed** (the final API delta run covered seven tests, including the G1 refusal; the UI test and the route's three had already passed).
- `./node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit`: passed.
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`: passed.
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`: passed.
- `git diff --check`: passed before the final test-only additions; final repeat is stalled without output.

The temporary Vitest configuration retained `apps/web/test/setup-worker-role.ts`
and aliased `@jobguard/core`, `@jobguard/db` and `@jobguard/config` to their existing
source barrels. The ordinary API unit invocation could not resolve unbuilt workspace
outputs; no build was run because this sandbox order permits unit tests/typechecks
only. The pnpm wrapper also attempted registry-based version/signature verification
and failed with restricted network access. Validation therefore used installed
repository executables directly. No verification setting was disabled.

Final API/web typecheck repetitions after the last test-only additions stalled without output; earlier typechecks passed and no later diagnostic was emitted. Per the brief this is a READY handoff with the stall recorded, not an invented pass.

Package lint scripts use the same `tsc --noEmit` checks. Full root lint/build and
PostgreSQL/browser suites were not executed in this sandbox.

## Review/CI handoff — still required

After the owner builds the normal dependency outputs, run with at most two workers:

- `pnpm --filter @jobguard/db exec vitest run test/pilot-invoice-draft.integration.test.ts --maxWorkers=1`
- `pnpm --filter @jobguard/web exec playwright test --config e2e/pilot-05c.config.ts`
- Existing pilot workspace/issuance-refusal tests, synthetic customer-invoice/receipt journeys and all required current-main CI checks.

The database fixture reuses the pilot persisted-session/lock/worker setup; it tests
positive reads, full financial/invoice/payment/outbox row snapshots, stale profile,
wrong job/tenant and revoked owner access. The browser fixture reuses the established
pilot setup and exercises the real routes through capture/acceptance/lock/Final Check,
then draft preview/download at 360px and 1280px, invalid VAT input and stale-profile
reconfirmation. These are **added, not locally executed**. Existing synthetic
invoice/receipt journeys also remain execution evidence for CI, not a builder claim.

Some fixture setup is copied because the existing browser and pilot-worker suites
own their setup privately; changing those suites is outside this lane.
LATER / SIMPLICITY: `apps/web/e2e/pilot-05c.browser.ts` and
`packages/db/test/pilot-invoice-draft.integration.test.ts`: extract the repeated pilot
identity/lock fixture setup into shared test helpers in a separately scoped change,
so future fixture maintenance has one source. This observation does not block.

No independent RED verdict, green current-main CI or launch approval is claimed.
Invoice issuance, sends, receipt entry, D02/D06 professional/policy approval,
PILOT-14 and Ben's launch go-ahead remain open. This implements only the reversible
draft handoff, not the whole parent PILOT-05 or its invoice remainder.
