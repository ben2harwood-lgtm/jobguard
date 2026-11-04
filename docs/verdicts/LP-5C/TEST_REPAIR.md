# LP-5c PR #540 test repair evidence

Builder test evidence; not an independent review or permission to merge.
Base head: `87d61aaf5d5692d0ee9177c85b17a75fb5569e51`.
Branch: `codex/sandbox/lp-5c-revoke`.

Migration 0557, routines and product code are unchanged. No test is deleted or skipped.
The checker correction is applied: guard proofs retain their original trigger/constraint/routine errors; only dedicated runtime forgery probes expect permission denial.

“Setup” means owner fixture writes outside the behavior under test. “Guard” means the forged owner write or an owner-staged receipt still reaches the original refusing guard. “Runtime forgery” means the dedicated runtime denial assertion expects 42501.

Every file below is in `packages/db/test/` and ends in `.integration.test.ts`.

| File stem | Classification | Preserved proof / change |
| --- | --- | --- |
| `commands` | Setup + guard | Owner stages dismissed resolution and attempts authorization; original 23514 trigger assertion and invocation counts remain. |
| `extra-origin` | Setup + guard | Owner executes raw origin/receipt fixtures; original kind, actor, uniqueness, deferred audit and tenant-setting refusals remain. |
| `job-parties` | Setup + guard | Owner stages adoption/binding authority and deferred protocol probes; correction routine and runtime INSERT probes explicitly assume the runtime login. |
| `site-visit` | Setup + guard | Owner stages the receipt, then runtime invokes complete-visit; CLOSEOUT_ANSWER_REQUIRED / 23514 and no-change checks remain. |
| `subscription-authority` | Guard (catalogue) | Assert the current migration chain denies runtime receipt INSERT; subscription restrictions remain exact. |
| `success-fee-catch-posting` | Setup + guard | Owner stages generic approvals without an SV-6 command; SUCCESS_FEE_REVIEW_REQUIRED and every effect count remain. |
| `contractor-parties` | Guard + runtime forgery | Original owner-forged succeeded receipt still fails with 23514; runtime fails with 42501. Both preserve the full effect snapshot before the legitimate bind. |
| `enterprise-fee-command-fixtures` | Setup + guard | Owner injects corrupt receipt results; runtime replay still reconstructs the authoritative statement/correction result and all conflict/audit assertions remain. |
| `extra-origin-upgrade` | Setup + guard | Owner writes historical and malformed origins; original column guards, backfill and upgrade catalogue comparisons remain. |
| `extra-unlink` | Guard | Owner constructs the completed raw unlink without its audit; INVALID_ORIGIN / 23514 and the full snapshot equality remain. |
| `job-work-state-commands-boundaries` | Setup + guard | Owner inserts the forged receipt, runtime inserts watchdog identity; JOB_NOT_LIVE and unchanged identity/effect counts remain. |
| `lp-adoption-boundary` | Setup + guard | Owner stages receipt authority in the same transaction as the direct adoption probe; original authorization and JOB_PARTIES_REQUIRED refusals and all tenant counts remain. |
| `watchdog-lock-order` | Setup | Only the observer self-check locks a receipt through an observed owner connection, since FOR UPDATE requires UPDATE privilege. Real command lock-order tests still use runtime. |
| `commercial-integrity-v3-receipt-guard` | Setup + guard + runtime forgery | Owner stages unrelated receipts and proves immutable/conversion triggers and rolled-back trigger-removal control. The separate spoofed-role runtime forgery expects 42501. |
| `extra-approval-chain` | Setup + guard | Owner stages another actor’s receipt, runtime invokes xa_approve; original INVALID_COMMAND routine assertion remains. |
| `extra-links` | Setup + guard | Owner executes raw link/origin/order fixtures; original FK, uniqueness and deferred audit checks remain. Raw-unlink failure injection observes the owner pool actually used. |
| `job-import-v3-admission-upgrade` | Guard (catalogue) | Full-upgrade expectation changes only the command_receipt runtime ACL from ar to r and explicitly denies INSERT; every other ACL, owner, RLS and stored-row comparison remains exact. |
| `job-work-state-sources` | Setup | Owner inserts/completes receipt fixtures; photo, evidence-link and stage writes explicitly assume runtime. Source forgery and hidden-state comparisons remain unchanged. |
| `recovery-follow-up` | Setup + guard | Owner stages the already-resolved Decision; RECOVERY_FOLLOW_UP_DUE_INVALID and the final zero-due check remain. |
| `site-extra-pricing` | Setup + guard | Owner stages origin/receipt fixtures; direct pricing calls explicitly assume runtime. Original authority refusals, exact result, basis and audit assertions remain. |
| `decisions-later` | Setup + guard | Owner stages dismissed resolution and attempts receipt tamper; original mandatory-classification and DECISION_CHECK_IMMUTABLE proofs remain. |
| `lp5-commands` | Guard | Owner attempts completed-receipt tamper plus tenant switch; original AUTHORIZATION_INVALID / 23514 and saved-result equality remain. |
| `lp5c-revoke` | Setup | Synthetic positive job starts accepted so the command reaches receipt/replay checks. Existing runtime 42501 forgeries and all no-change counts remain. |
| `recovery-case-terms` | Setup + guard | Owner constructs hand-made authority; original role, exact authorization, duplicate approval and timestamp routine checks retain their exact errors and counts. |
| `shared-money-origin` | Setup + guard | Owner constructs command origins for invariant probes. Shadow-origin attempts assume runtime after receipt setup, preserving the original identical shadow-refusal errors and non-disclosure checks. |

The lane file `config/lanes/lp-5c-revoke.json` keeps the version-2 `{ "version": 2, "lanes": { ... } }` shape, lists every repair file and this evidence document, and does not list itself.

## Executed checks

- Node 24.15.0, pnpm 10.28.1; core/storage dependency builds passed.
- Real embedded PostgreSQL 16; synthetic fixtures and fake external data only.
- Final complete run: **25 files passed, 606 tests passed, zero failed/skipped**, 403.29 seconds.
- Latest LP-5 command guard rerun: **20 passed**, including both owner-side terminal receipt tamper guards (5.89 seconds).
- `pnpm --filter @jobguard/db typecheck`: passed.
- `node tools/agent-lane-boundary-lint.mjs`: passed against the fetched `origin/main` comparison base.
- `git diff --check`: passed.
- Diff against the requested base contains no changes to migrations, routines or product source. No real product runtime-write defect was found.
- No requested check remains blocked. Full monorepo tests/build/lint/e2e and a new remote CI result were not verified by this repair.

Complete PostgreSQL command (run from the repository root):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --reporter=verbose \
  test/commands.integration.test.ts \
  test/extra-origin.integration.test.ts \
  test/job-parties.integration.test.ts \
  test/site-visit.integration.test.ts \
  test/subscription-authority.integration.test.ts \
  test/success-fee-catch-posting.integration.test.ts \
  test/contractor-parties.integration.test.ts \
  test/enterprise-fee-command-fixtures.integration.test.ts \
  test/extra-origin-upgrade.integration.test.ts \
  test/extra-unlink.integration.test.ts \
  test/job-work-state-commands-boundaries.integration.test.ts \
  test/lp-adoption-boundary.integration.test.ts \
  test/watchdog-lock-order.integration.test.ts \
  test/commercial-integrity-v3-receipt-guard.integration.test.ts \
  test/extra-approval-chain.integration.test.ts \
  test/extra-links.integration.test.ts \
  test/job-import-v3-admission-upgrade.integration.test.ts \
  test/job-work-state-sources.integration.test.ts \
  test/recovery-follow-up.integration.test.ts \
  test/site-extra-pricing.integration.test.ts \
  test/decisions-later.integration.test.ts \
  test/lp5-commands.integration.test.ts \
  test/lp5c-revoke.integration.test.ts \
  test/recovery-case-terms.integration.test.ts \
  test/shared-money-origin.integration.test.ts
```


## Catch-up with #539 and #542 (3 November 2026)

Starting head: `23d26127275a1a5fe7f87a45c16f36d04744eae8`.
Fetched main: `bc8993090dcb111dbf707653d18cc51e22191f2e`.
Exact-union merge: `f6fbd7999f77318e91a9d58e95734837c17d1aa5`.
The merge tree `796e01596523991bff8e07af4712c10c56d090f3` equals the result of `git merge-tree --write-tree` for those two parents. No conflict resolution or additional product behavior was introduced.
Migration `0557_lp5c_revoke_command_writes.sql` retains its name and original blob `9e0e348d048f109cb098c465470869c55f1d747d`.

Incoming direct authority-write audit:

| Incoming file | Connection / classification | Disposition |
| --- | --- | --- |
| `packages/db/test/lp-job-doors-fixtures.ts` | Owner setup; staged receipt is executed by the existing owner-side adoption guard probes. | Already correct; unchanged. |
| `packages/db/test/migfix-8-upgrade.integration.test.ts` | `seedDemoFixture(admin, ...)` stages resolutions and authorizations. | Already correct; unchanged. |
| `packages/db/test/outbox.integration.test.ts` | `admin` stages resolutions and authorizations. | Already correct; unchanged. |
| `packages/db/test/signed-evidence-export-store.integration.test.ts` | Admin approval setup and explicit admin historical tamper fixtures; actual store operations use runtime. | Already correct; unchanged. |

The remaining incoming integration tests contain no direct writes to the three authority tables. Source inspection of incoming product files found no direct runtime authority writer. No expectation was replaced with 42501, and no guard proof was altered during this catch-up.

`packages/db/test/later-empty-tables.ts` is unchanged from main and still matches exactly the five empty `app` tables introduced by migrations 0550–0555: practice exposure schedules, sync checkpoints, synthetic evidence chunks, signer keys and signed exports. Connector and outbound-control tables belong to separate schemas. Migration 0557 creates no tables. The existing full-upgrade snapshot consumers are included in the integration run.

The lane allow list is unchanged: the only post-merge edit is this already-allowed evidence document.

Catch-up checks executed with Node 24.15.0, pnpm 10.28.1, real embedded PostgreSQL 16 and synthetic data only:

- Original 25 files: **606 passed** within the main catch-up run.
- Complete integration set: **58 files, 838 tests passed** across the main run and the portal rerun. The main run passed 57 files / 832 tests in 581.97 seconds; `customer-portal-message` initially failed collection because `@jobguard/ai` had not been built. After building that dependency, its unchanged suite passed all 6 tests in 9.25 seconds. No database test assertion failed, and no test was skipped or weakened.
- Incoming proof/catalogue tests (`connector-intake-proof`, `resumable-evidence-catalog`, `signed-evidence-export-store`): **3 files, 8 tests passed** in 7.51 seconds.
- All five `later-empty-tables.ts` snapshot consumer suites passed, including the portal upgrade proof.
- Core/storage and AI dependency builds: passed.
- `pnpm --filter @jobguard/db typecheck`: passed.
- `node tools/agent-lane-boundary-lint.mjs`: passed against fetched main `bc899309`.
- `git diff --check`: passed. Migration 0557 remains byte-identical; all other migrations, routines, product and test source equal the exact-union merge.
- No requested check remains blocked. Full monorepo tests/build/lint/e2e and a new remote CI result were not verified.

Main integration command (repository root):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --reporter=verbose \
  test/commands.integration.test.ts \
  test/extra-origin.integration.test.ts \
  test/job-parties.integration.test.ts \
  test/site-visit.integration.test.ts \
  test/subscription-authority.integration.test.ts \
  test/success-fee-catch-posting.integration.test.ts \
  test/contractor-parties.integration.test.ts \
  test/enterprise-fee-command-fixtures.integration.test.ts \
  test/extra-origin-upgrade.integration.test.ts \
  test/extra-unlink.integration.test.ts \
  test/job-work-state-commands-boundaries.integration.test.ts \
  test/lp-adoption-boundary.integration.test.ts \
  test/watchdog-lock-order.integration.test.ts \
  test/commercial-integrity-v3-receipt-guard.integration.test.ts \
  test/extra-approval-chain.integration.test.ts \
  test/extra-links.integration.test.ts \
  test/job-import-v3-admission-upgrade.integration.test.ts \
  test/job-work-state-sources.integration.test.ts \
  test/recovery-follow-up.integration.test.ts \
  test/site-extra-pricing.integration.test.ts \
  test/decisions-later.integration.test.ts \
  test/lp5-commands.integration.test.ts \
  test/lp5c-revoke.integration.test.ts \
  test/recovery-case-terms.integration.test.ts \
  test/shared-money-origin.integration.test.ts \
  test/commercial-outbound-pause-upgrade.integration.test.ts \
  test/connector-intake.integration.test.ts \
  test/contractor-billing-delivery.integration.test.ts \
  test/contractor-entitlement-upgrade.integration.test.ts \
  test/customer-portal-message.integration.test.ts \
  test/customer-quote-acceptance.integration.test.ts \
  test/customer-stage-acknowledgement.integration.test.ts \
  test/demo-bootstrap.integration.test.ts \
  test/evidence.integration.test.ts \
  test/j3-landing-allocation.integration.test.ts \
  test/job-activation-terms.integration.test.ts \
  test/migfix-8-upgrade.integration.test.ts \
  test/operative-entitlements-upgrade.integration.test.ts \
  test/outbox.integration.test.ts \
  test/payment-fee-standing-authority-upgrade.integration.test.ts \
  test/prevent-allocated-case-upgrade.integration.test.ts \
  test/prevention-checks.integration.test.ts \
  test/receipt-line-command-producer-upgrade.integration.test.ts \
  test/receipt-movement-job-fk-upgrade.integration.test.ts \
  test/receipt-source-job-binding-upgrade.integration.test.ts \
  test/recovery-case-terms-upgrade.integration.test.ts \
  test/recovery-follow-up-upgrade.integration.test.ts \
  test/recovery-pursuit-terms-upgrade.integration.test.ts \
  test/server-entitlement-upgrade.integration.test.ts \
  test/signed-evidence-export-store.integration.test.ts \
  test/simulation-fee-collection-upgrade.integration.test.ts \
  test/simulation-fee-statement-upgrade.integration.test.ts \
  test/simulation-money-run-upgrade.integration.test.ts \
  test/subscription-actions.integration.test.ts \
  test/success-fee-catch-upgrade.integration.test.ts \
  test/success-fee-recovery-upgrade.integration.test.ts \
  test/sync-snapshot.integration.test.ts \
  test/withheld-payment-statement-source-upgrade.integration.test.ts
```

Successful missing-dependency recovery:

```sh
pnpm turbo run build --filter=@jobguard/ai...
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --reporter=verbose test/customer-portal-message.integration.test.ts
```

