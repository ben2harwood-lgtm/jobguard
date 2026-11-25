# V2-K4 — 2019 automatic chasing (RED)

Applied only by the checked V2 bootstrap after 2001; never registered in
`MIGRATION_URLS`. No production schema, source rows, fee or payment state changes.
The three tables have forced RLS, authenticated tenant/firm binding and job
visibility. Practice firms sharing the backing tenant stay separate. Runtime
can append logs/receipts and update only the firm setting columns; it cannot
rewrite or delete a reminder. Quote and invoice references bind tenant and job.
The metadata routine exposes existing synthetic invoice metadata for the bound
job only; it grants no access to hidden financial findings.

Two fixed steps: quote sent+3/+7 days, invoice due+3/+10 days. At most two captures
per item. Only the latest due step can be captured, within two days of its due time.
An overdue or superseded step is saved as chase_skipped with no recipient, message
or sent time. Each step occupies its original unique key whether sent or skipped.
Reinstalling 2019 upgrades the existing outcome constraint in place and preserves old rows. The run command uses a server clock;
tests inject one in the repository, never through HTTP. Selection happens before the firm lock. Finalization uses a fresh state read under that lock.
The message insert also compares the live item projection in its own PostgreSQL statement;
a committed payment, credit, dispute, decision or switch-off suppresses stale delivery. Enabling the setting authorizes these bounded local
fictional templates only. The command records its member, job, time, expected
setting revision and exact replay hash. Each command and each newly captured or skipped step is
audited in the same transaction, with audit locking last. Exact replays make no
writes and emit no extra catcher notification. Messages persist in the local
chase log, and `captureV2Delivery` emits the usual catcher metadata after commit.
There is no provider or network executor and no production standing authority.

Invoice due dates and dispute/refund state come from the existing administrative
`dunning_invoice` synthetic projection. Missing, malformed or stale metadata
suppresses chasing. Actual customer invoice balances, credits and unreversed
receipts are also checked at delivery. A partial payment or credit suppresses the invoice even
when the current metadata correctly shows the reduced balance. No due date is guessed from issue date.
This does not introduce an invoice metadata authoring workflow; the V2 fixture
suite supplies that metadata. Replies/disputes can be recorded by the builder
through the stop command; existing quote acceptance/disposition facts also stop
chasing. Paid, part-paid, disputed, pilot and decided items acquire permanent stop markers
on an enabled run. Switch-off hides all future steps immediately across jobs;
switch-on resumes only remaining steps on items without a permanent stop.

The launcher prints `/jobs/<id>/chasing`. The builder view includes the firm
switch, next steps, per-item stop/reply/dispute controls and the local catcher.
The explicit "run" command is the packet's allowed scheduler seam; no second
scheduler, provider calls or background timer is installed.

Fresh/upgrade/idempotent-install, firm/RLS, audit, rollback, balances and replay
assertions are in `tools/v2/chasing.integration.test.mjs`. The source expectation
file is `tools/v2/proofs/2019_automatic_chasing.proof.json`; it is explicitly pending
execution, not a measured database proof. PostgreSQL, browser and phone-mode
execution belong to the router environment. Roll forward by correcting this
V2-only migration on a fresh rehearsal database. Retain the old rehearsal state
for reference; do not delete history or weaken privileges for rollback.

Router verification commands (from this checkout, after starting the seeded V2
launcher with this branch and building API dependencies):

```sh
JOBGUARD_ENV=synthetic_demo JOBGUARD_V2_BACKEND=embedded node --test tools/v2/chasing.integration.test.mjs
V2_TEST_ORIGIN=http://127.0.0.1:3400 pnpm --filter @jobguard/web exec playwright test --config=playwright.v2-chasing.config.ts
V2_TEST_ORIGIN=https://<phone-host>:3400 pnpm --filter @jobguard/web exec playwright test --config=playwright.v2-chasing.config.ts
LANE_BASE_REF=origin/v2/main pnpm lint:lanes
```

For Docker, use `JOBGUARD_V2_BACKEND=docker` and the launcher's checked system
identifier via `JOBGUARD_V2_TEST_SYSTEM_ID`. The integration suite appends clearly
fictional jobs/messages to the rehearsal state, ends with chasing off, and does
not erase fixture history. It is a standalone Node test requiring the dedicated
V2 stack, not part of the normal production PostgreSQL migration inventory.
